import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { getAccessToken, invalidateToken } from "./sankhyaAuth.js";

dotenv.config();

const app = express();
app.use(express.json());

// Mapeamento de Status do HubSpot (Internal ID -> Label Amigável)
const DEAL_STAGE_MAP = {
  "appointmentscheduled": "Agendado / Negociação",
  "decisionmakerboughtin": "Aguardando Liberação",
  "contractsent": "Aguardando Assinatura",
  "closedwon": "Fechado Ganho",
  "closedlost": "Perdido",
  "presentationscheduled": "Pedido Gerado"
};

// CONFIGURAÇÕES DE ESTÁGIOS (HUBSPOT INTERNAL IDS)
const STAGE_AGUARDANDO_LIBERACAO = "decisionmakerboughtin"; // Tomador de decisão envolvido
const STAGE_PEDIDO = "presentationscheduled"; // Pagamento (Gatilho B2B)

// SCAN DE PROPRIEDADES UTILIZADAS:
// - Deal: codemp_sankhya, sankhya_codemp, amount, codigo_vendedor_sankhya, hubspot_owner_id, ordem_de_compra_anexo, dealstage
// - Company/Contact: sankhya_codparc, codparc
// - LineItem: sankhya_codprod, codprod, hs_product_id, quantity
// - Quotes: hs_title, hs_status, hs_expiration_date, hs_lastmodifieddate

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

function toInt(name, value) {
  if (value === null || value === undefined || value === "" || value === "undefined") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${name} inválido (precisa ser inteiro): ${value}`);
  }
  return n;
}

async function getEmpresaNome(codEmp) {
  try {
    const sql = `SELECT RAZAOSOCIAL FROM TSIEMP WHERE CODEMP = ${codEmp}`;
    const response = await postGatewayWithRetry({ requestBody: { sql } });
    const rb = response.data?.responseBody;
    if (Array.isArray(rb?.rows) && rb.rows.length > 0) {
      return String(rb.rows[0][0]);
    }
    return `Empresa ${codEmp}`;
  } catch (e) { return `Empresa ${codEmp}`; }
}

/**
 * Discovery Chain: Resolve Vendedor, Parceiro, Produto e Quote
 */
async function getDealSankhyaContext(objectId, token) {
  const hsUrl = `https://api.hubspot.com/crm/v3/objects/deals/${objectId}?state=true&associations=companies,contacts,quotes,line_items&properties=codemp_sankhya,sankhya_codemp,amount,codigo_vendedor_sankhya,hubspot_owner_id,ordem_de_compra_anexo,dealstage`;
  const hsResponse = await axios.get(hsUrl, { headers: { Authorization: `Bearer ${token}` } });
  const deal = hsResponse.data;
  const props = deal.properties;

  // 1. Empresa (CodEmp)
  const codEmpRaw = props.codemp_sankhya || props.sankhya_codemp;
  const codEmp = toInt("codEmp", codEmpRaw);

  // 2. Vendedor (CodVend) - Fallback Prop p/ Owner
  // MAPA DE VENDEDORES (HubSpot ID -> Sankhya ID)
  // Preencha aqui os IDs. Exemplo: "1024509": 15
  const OWNER_TO_SANKHYA_MAP = {
    "hubspot_owner_id_aqui": 0
  };

  let codVendedor = props.codigo_vendedor_sankhya;
  if (!codVendedor && props.hubspot_owner_id) {
    codVendedor = OWNER_TO_SANKHYA_MAP[props.hubspot_owner_id] || props.hubspot_owner_id;
  }

  // 3. Parceiro (CodParc) - Company > Contact
  let codParcRaw = null;
  const companyId = deal.associations?.companies?.results?.[0]?.id;
  if (companyId) {
    try {
      const resp = await axios.get(`https://api.hubspot.com/crm/v3/objects/companies/${companyId}?properties=sankhya_codparc,codparc`, { headers: { Authorization: `Bearer ${token}` } });
      codParcRaw = resp.data.properties.sankhya_codparc || resp.data.properties.codparc;
    } catch (e) { }
  }
  if (!codParcRaw) {
    const contactId = deal.associations?.contacts?.results?.[0]?.id;
    if (contactId) {
      try {
        const resp = await axios.get(`https://api.hubspot.com/crm/v3/objects/contacts/${contactId}?properties=sankhya_codparc,codparc`, { headers: { Authorization: `Bearer ${token}` } });
        codParcRaw = resp.data.properties.sankhya_codparc || resp.data.properties.codparc;
      } catch (e) { }
    }
  }

  // 4. Multi-Item Discovery
  const items = [];
  // Fallback para 'line items' (com espaço) que as vezes o HubSpot retorna
  const rawLineItems = deal.associations?.line_items?.results || deal.associations?.["line items"]?.results || [];
  const lineItemIds = rawLineItems.map(r => r.id);

  console.log(`[DEBUG] Associations Keys: ${deal.associations ? Object.keys(deal.associations).join(',') : 'None'}`);

  if (lineItemIds.length > 0) {
    // Fetch details in batches or parallel
    await Promise.all(lineItemIds.map(async (id) => {
      try {
        const resp = await axios.get(`https://api.hubspot.com/crm/v3/objects/line_items/${id}?properties=sankhya_codprod,codprod,hs_product_id,quantity,name`, { headers: { Authorization: `Bearer ${token}` } });
        const lp = resp.data.properties;
        let codProd = lp.sankhya_codprod || lp.codprod;

        if (!codProd && lp.hs_product_id) {
          const pResp = await axios.get(`https://api.hubspot.com/crm/v3/objects/products/${lp.hs_product_id}?properties=sankhya_codprod,codprod`, { headers: { Authorization: `Bearer ${token}` } });
          codProd = pResp.data.properties.sankhya_codprod || pResp.data.properties.codprod;
        }

        if (codProd) {
          items.push({
            id,
            name: lp.name || `Item ${id}`,
            codProd: toInt("codProd", codProd),
            quantity: Number(lp.quantity || 0)
          });
        }
      } catch (e) { console.warn(`Erro ao buscar item ${id}:`, e.message); }
    }));
  }

  // 5. Quote Discovery (Lógica: Última modificada, não expirada)
  let activeQuote = null;
  const quotes = deal.associations?.quotes?.results || [];
  if (quotes.length > 0) {
    try {
      const detailPromises = quotes.map(q => axios.get(`https://api.hubspot.com/crm/v3/objects/quotes/${q.id}?properties=hs_title,hs_status,hs_expiration_date,hs_lastmodifieddate`, { headers: { Authorization: `Bearer ${token}` } }));
      const details = (await Promise.all(detailPromises)).map(r => r.data);
      const now = new Date();
      activeQuote = details
        .filter(q => q.properties.hs_status !== 'CANCELED')
        .filter(q => !q.properties.hs_expiration_date || new Date(q.properties.hs_expiration_date) >= now)
        .sort((a, b) => new Date(b.properties.hs_lastmodifieddate) - new Date(a.properties.hs_lastmodifieddate))[0];
    } catch (e) {
      console.warn("[DISCOVERY] Erro ao analisar Quotes:", e.message);
    }
  }

  console.log(`[DISCOVERY] Raw Data: Deal=${objectId}, Emp=${codEmp}, Parc=${codParcRaw}, Items=${items.length}, Quote=${activeQuote?.id || 'Nenhuma'}`);

  return {
    deal,
    props,
    codEmp,
    codParc: toInt("codParc", codParcRaw),
    items, // Array of { name, codProd, quantity }
    activeQuote,
    codVendedor
  };
}

const baseUrl = requireEnv("SANKHYA_BASE_URL");
const GATEWAY_EXECUTE_QUERY_URL = `${baseUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`;

async function postGatewayWithRetry(body) {
  let token = await getAccessToken();
  try {
    const response = await axios.post(GATEWAY_EXECUTE_QUERY_URL, body, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
    if (response.data && response.data.status === "3") {
      invalidateToken();
      token = await getAccessToken(); // O lock em getAccessToken silencia os redundantes
      console.log("[AUTH] Sessão renovada com sucesso.");
      return await axios.post(GATEWAY_EXECUTE_QUERY_URL, body, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
    }
    return response;
  } catch (err) {
    if (err.response?.status === 401) {
      invalidateToken();
      token = await getAccessToken();
      return await axios.post(GATEWAY_EXECUTE_QUERY_URL, body, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
    }
    throw err;
  }
}

function parseDbExplorerFirstValue(data) {
  const rb = data?.responseBody;
  if (Array.isArray(rb?.rows) && rb.rows.length) return Number(rb.rows[0]?.[0]);
  const rsRows = rb?.resultSet?.rows;
  if (Array.isArray(rsRows) && rsRows.length) return Number(rsRows[0]?.PRECO?.$ || Object.values(rsRows[0])[0]?.$);
  return null;
}

async function consultaPreco(codProd, codParc, codEmp, seqPv) {
  const sql = `SELECT AD_PRECO_TRADIPAR(${codProd}, ${codParc}, ${codEmp}, ${seqPv}) AS PRECO FROM DUAL`;
  const response = await postGatewayWithRetry({ requestBody: { sql } });
  return parseDbExplorerFirstValue(response.data);
}

async function consultaEstoque(codProd, codEmp) {
  try {
    const sql = `SELECT SUM(ESTOQUE - RESERVADO) AS DISPONIVEL FROM TGFEST WHERE CODPROD = ${codProd} AND CODEMP = ${codEmp}`;
    console.log(`[STK] SQL: ${sql}`);
    const response = await postGatewayWithRetry({ requestBody: { sql } });

    // Debug da resposta crua
    const rb = response.data?.responseBody;
    console.log(`[STK] Raw Response: ${JSON.stringify(rb)}`);

    if (Array.isArray(rb?.rows) && rb.rows.length > 0) {
      const row = rb.rows[0];
      // DbExplorer retorna array de valores. Se for SELECT SUM... o valor está no índice 0
      const val = Array.isArray(row) ? row[0] : row;
      return val != null ? Number(val) : 0;
    }

    return 0;
  } catch (err) {
    console.error(`[STK] Erro: ${err.message}`);
    return 0;
  }
}

app.post("/hubspot/prices/deal", async (req, res) => {
  console.log("--- Chamada /prices/deal (Multi-Item) ---");
  try {
    const { objectId } = req.body;
    const ctx = await getDealSankhyaContext(objectId, process.env.HUBSPOT_ACCESS_TOKEN);

    if (!ctx.codParc || !ctx.codEmp || ctx.items.length === 0) {
      return res.json({ status: "MISSING_DATA", message: "Dados incompletos (Parceiro, Empresa ou Itens).", details: ctx });
    }

    // Contexto da Empresa
    const empresaNome = await getEmpresaNome(ctx.codEmp);

    // Processar cada item
    const processedItems = await Promise.all(ctx.items.map(async (item) => {
      const [pv1, pv2, pv3, estoque] = await Promise.all([
        consultaPreco(item.codProd, ctx.codParc, ctx.codEmp, 1),
        consultaPreco(item.codProd, ctx.codParc, ctx.codEmp, 2),
        consultaPreco(item.codProd, ctx.codParc, ctx.codEmp, 3),
        consultaEstoque(item.codProd, ctx.codEmp),
      ]);

      return {
        ...item,
        prices: { pv1, pv2, pv3 },
        stock: estoque,
        stockContext: empresaNome // "RAZAO SOCIAL"
      };
    }));

    // Verificar corte global (se algum item não tem estoque)
    const hasStockCut = processedItems.some(i => i.stock < i.quantity);
    if (hasStockCut) console.warn(`[CORTE] Deal ${objectId} tem itens com falta de estoque.`);

    return res.json({
      status: "SUCCESS",
      items: processedItems,
      currentAmount: ctx.props.amount,
      currentStage: ctx.props.dealstage,
      stageLabel: DEAL_STAGE_MAP[ctx.props.dealstage] || ctx.props.dealstage, // Status Amigável
      quote: ctx.activeQuote ? { id: ctx.activeQuote.id, title: ctx.activeQuote.properties.hs_title } : null
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/hubspot/update/deal", async (req, res) => {
  try {
    const { objectId, amount } = req.body;
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    const ctx = await getDealSankhyaContext(objectId, token);
    let blockSave = false;
    let warningMsg = null;

    if (ctx.codProd && ctx.codParc && ctx.codEmp) {
      const pv3 = await consultaPreco(ctx.codProd, ctx.codParc, ctx.codEmp, 3);
      if (pv3 && Number(amount) < pv3) {
        blockSave = true;
        await axios.patch(`https://api.hubapi.com/crm/v3/objects/deals/${objectId}`, { properties: { dealstage: STAGE_AGUARDANDO_LIBERACAO, amount: String(amount) } }, { headers: { Authorization: `Bearer ${token}` } });
        warningMsg = "Preço < PV3. Enviado p/ aprovação.";
      }
    }
    if (!blockSave) {
      await axios.patch(`https://api.hubapi.com/crm/v3/objects/deals/${objectId}`, { properties: { amount: String(amount) } }, { headers: { Authorization: `Bearer ${token}` } });
    }
    return res.json({ status: blockSave ? "WARNING" : "SUCCESS", message: warningMsg });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/hubspot/convert-to-order", async (req, res) => {
  try {
    const { objectId } = req.body;
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    const hsUrl = `https://api.hubapi.com/crm/v3/objects/deals/${objectId}?properties=ordem_de_compra_anexo`;
    const hsResponse = await axios.get(hsUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!hsResponse.data.properties.ordem_de_compra_anexo) {
      return res.status(400).json({ error: "PO não anexado." });
    }
    await axios.patch(`https://api.hubapi.com/crm/v3/objects/deals/${objectId}`, { properties: { dealstage: STAGE_PEDIDO } }, { headers: { Authorization: `Bearer ${token}` } });
    res.json({ status: "SUCCESS" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- DEBUG REMOVER DEPOIS ---
app.post("/debug/sql", async (req, res) => {
  try {
    const { sql } = req.body;
    console.log(`[DEBUG] Executing SQL: ${sql}`);
    const response = await postGatewayWithRetry({ requestBody: { sql } });
    res.json(response.data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(Number(process.env.PORT || 3000), () => {
  console.log(`🚀 API: http://localhost:${process.env.PORT || 3000}`);
  console.log("--- SYSTEM READY (v1.2 - Quote Discovery + Clean Logs) ---");
});
