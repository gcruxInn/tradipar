import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { getAccessToken, invalidateToken } from "./sankhyaAuth.js";

dotenv.config();

const app = express();
app.use(express.json());

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

/**
 * Discovery Chain: Resolve Vendedor, Parceiro, Produto e Quote
 */
async function getDealSankhyaContext(objectId, token) {
  const hsUrl = `https://api.hubapi.com/crm/v3/objects/deals/${objectId}?state=true&associations=companies,contacts,quotes,line_items&properties=codemp_sankhya,sankhya_codemp,amount,codigo_vendedor_sankhya,hubspot_owner_id,ordem_de_compra_anexo,dealstage`;
  const hsResponse = await axios.get(hsUrl, { headers: { Authorization: `Bearer ${token}` } });
  const deal = hsResponse.data;
  const props = deal.properties;

  // 1. Empresa (CodEmp)
  const codEmpRaw = props.codemp_sankhya || props.sankhya_codemp;

  // 2. Vendedor (CodVend) - Fallback Prop p/ Owner
  let codVendedor = props.codigo_vendedor_sankhya || props.hubspot_owner_id;

  // 3. Parceiro (CodParc) - Company > Contact
  let codParcRaw = null;
  const companyId = deal.associations?.companies?.results?.[0]?.id;
  if (companyId) {
    try {
      const resp = await axios.get(`https://api.hubapi.com/crm/v3/objects/companies/${companyId}?properties=sankhya_codparc,codparc`, { headers: { Authorization: `Bearer ${token}` } });
      codParcRaw = resp.data.properties.sankhya_codparc || resp.data.properties.codparc;
    } catch (e) { }
  }
  if (!codParcRaw) {
    const contactId = deal.associations?.contacts?.results?.[0]?.id;
    if (contactId) {
      try {
        const resp = await axios.get(`https://api.hubapi.com/crm/v3/objects/contacts/${contactId}?properties=sankhya_codparc,codparc`, { headers: { Authorization: `Bearer ${token}` } });
        codParcRaw = resp.data.properties.sankhya_codparc || resp.data.properties.codparc;
      } catch (e) { }
    }
  }

  // 4. Produto e Qtd
  let codProdRaw = null, quantity = 0;
  const lineItem = deal.associations?.line_items?.results?.[0] || deal.associations?.["line items"]?.results?.[0];
  if (lineItem) {
    try {
      const resp = await axios.get(`https://api.hubapi.com/crm/v3/objects/line_items/${lineItem.id}?properties=sankhya_codprod,codprod,hs_product_id,quantity`, { headers: { Authorization: `Bearer ${token}` } });
      const lp = resp.data.properties;
      codProdRaw = lp.sankhya_codprod || lp.codprod;
      quantity = Number(lp.quantity || 0);
      if (!codProdRaw && lp.hs_product_id) {
        const pResp = await axios.get(`https://api.hubapi.com/crm/v3/objects/products/${lp.hs_product_id}?properties=sankhya_codprod,codprod`, { headers: { Authorization: `Bearer ${token}` } });
        codProdRaw = pResp.data.properties.sankhya_codprod || pResp.data.properties.codprod;
      }
    } catch (e) { }
  }

  // 5. Quote Discovery (Lógica: Última modificada, não expirada)
  let activeQuote = null;
  const quotes = deal.associations?.quotes?.results || [];
  if (quotes.length > 0) {
    try {
      const detailPromises = quotes.map(q => axios.get(`https://api.hubapi.com/crm/v3/objects/quotes/${q.id}?properties=hs_title,hs_status,hs_expiration_date,hs_lastmodifieddate`, { headers: { Authorization: `Bearer ${token}` } }));
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

  console.log(`[DISCOVERY] Raw Data: Deal=${objectId}, Parc=${codParcRaw}, Quote=${activeQuote?.id || 'Nenhuma'}`);

  return {
    deal,
    props,
    codEmp: toInt("codEmp", codEmpRaw),
    codParc: toInt("codParc", codParcRaw),
    codProd: toInt("codProd", codProdRaw),
    quantity,
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
    const sql = `SELECT ISNULL(SUM(ESTOQUE - RESERVADO), 0) AS DISPONIVEL FROM TGFEST WHERE CODPROD = ${codProd} AND CODEMP = ${codEmp}`;
    const response = await postGatewayWithRetry({ requestBody: { sql } });
    const estoque = parseDbExplorerFirstValue(response.data);
    return estoque !== null ? estoque : 0;
  } catch (err) {
    return 0;
  }
}

app.post("/hubspot/prices/deal", async (req, res) => {
  console.log("--- Chamada /prices/deal ---");
  try {
    const { objectId } = req.body;
    const ctx = await getDealSankhyaContext(objectId, process.env.HUBSPOT_ACCESS_TOKEN);

    if (!ctx.codProd || !ctx.codParc || !ctx.codEmp) {
      return res.json({ status: "MISSING_DATA", message: "Dados incompletos.", details: ctx });
    }

    const [pv1, pv2, pv3, estoque] = await Promise.all([
      consultaPreco(ctx.codProd, ctx.codParc, ctx.codEmp, 1),
      consultaPreco(ctx.codProd, ctx.codParc, ctx.codEmp, 2),
      consultaPreco(ctx.codProd, ctx.codParc, ctx.codEmp, 3),
      consultaEstoque(ctx.codProd, ctx.codEmp),
    ]);

    if (estoque < ctx.quantity) {
      console.warn(`[CORTE] Deal ${objectId}: Faltam ${ctx.quantity - estoque} un.`);
    }

    return res.json({
      status: "SUCCESS",
      prices: { pv1, pv2, pv3 },
      stock: estoque,
      quantity: ctx.quantity,
      currentAmount: ctx.props.amount,
      currentStage: ctx.props.dealstage,
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

app.listen(Number(process.env.PORT || 3000), () => {
  console.log(`🚀 API: http://localhost:${process.env.PORT || 3000}`);
  console.log("--- SYSTEM READY (v1.2 - Quote Discovery + Clean Logs) ---");
});
