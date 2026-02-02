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
        const resp = await axios.get(`https://api.hubspot.com/crm/v3/objects/line_items/${id}?properties=sankhya_codprod,codprod,hs_product_id,quantity,name,price`, { headers: { Authorization: `Bearer ${token}` } });
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
            quantity: Number(lp.quantity || 0),
            currentPrice: lp.price ? Number(lp.price) : null
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

// ============================================================
// CRUD Service para INSERT/UPDATE/DELETE no Sankhya
// ============================================================
const CRUD_SERVICE_URL = `${baseUrl}/gateway/v1/mge/service.sbr?serviceName=CRUDServiceProvider.saveRecord&outputType=json`;

async function saveSankhyaRecord(entityName, fields) {
  let token = await getAccessToken();

  // Construir o XML do request body conforme API Sankhya
  const fieldElements = Object.entries(fields)
    .map(([key, value]) => `<field name="${key}">${value === null ? '' : value}</field>`)
    .join('\n        ');

  const requestBody = {
    requestBody: {
      dataSet: {
        rootEntity: entityName,
        includePresentationFields: "N",
        dataRow: {
          localFields: {
            [entityName]: { field: Object.entries(fields).map(([name, value]) => ({ $: { name }, _: value === null ? '' : String(value) })) }
          }
        }
      }
    }
  };

  // Formato alternativo mais simples que o Sankhya aceita
  const simpleBody = {
    serviceName: "CRUDServiceProvider.saveRecord",
    requestBody: {
      dataSet: {
        rootEntity: entityName,
        includePresentationFields: "N",
        dataRow: {
          localFields: fields
        }
      }
    }
  };

  try {
    console.log(`[CRUD] Saving to ${entityName}: ${JSON.stringify(fields).substring(0, 200)}...`);
    const response = await axios.post(CRUD_SERVICE_URL, simpleBody, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 30000
    });

    console.log(`[CRUD] Response: ${JSON.stringify(response.data).substring(0, 500)}`);

    if (response.data?.status === "3") {
      invalidateToken();
      token = await getAccessToken();
      return await axios.post(CRUD_SERVICE_URL, simpleBody, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000
      });
    }

    return response;
  } catch (err) {
    if (err.response?.status === 401) {
      invalidateToken();
      token = await getAccessToken();
      return await axios.post(CRUD_SERVICE_URL, simpleBody, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        timeout: 30000
      });
    }
    throw err;
  }
}


function executeSankhyaQuery(sql) {
  console.log(`[QUERY] Executing: ${sql.substring(0, 100)}...`);
  return postGatewayWithRetry({ requestBody: { sql } }).then(response => {
    const rb = response.data?.responseBody;
    console.log(`[QUERY] Response keys: ${rb ? Object.keys(rb).join(',') : 'NULL'}`);

    // Try multiple parsing strategies
    let rows = rb?.rows;
    let fields = rb?.fieldsMetadata;

    // Fallback: resultSet structure
    if (!rows && rb?.resultSet) {
      console.log(`[QUERY] Using resultSet fallback`);
      rows = rb.resultSet.rows;
      fields = rb.resultSet.fieldsMetadata || rb.fieldsMetadata;
    }

    if (!rows || !fields) {
      console.log(`[QUERY] No rows or fields found. Raw: ${JSON.stringify(response.data).substring(0, 500)}`);
      return [];
    }

    console.log(`[QUERY] Parsed ${rows.length} rows, ${fields.length} fields`);
    const fieldNames = fields.map(f => f.name);
    return rows.map(row => {
      const obj = {};
      fieldNames.forEach((field, i) => {
        obj[field] = row[i];
      });
      return obj;
    });
  }).catch(err => {
    const errorDetail = err.response?.data || err.message;
    console.error(`[QUERY ERROR] ${JSON.stringify(errorDetail)}`);
    throw err;
  });
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

/**
 * Busca estoque de um produto em TODAS as empresas/unidades
 */
async function consultaEstoqueTodasUnidades(codProd) {
  try {
    const sql = `
      SELECT 
        E.CODEMP,
        EMP.RAZAOSOCIAL,
        EMP.NOMEFANTASIA,
        SUM(E.ESTOQUE - E.RESERVADO) AS DISPONIVEL
      FROM TGFEST E
      INNER JOIN TSIEMP EMP ON EMP.CODEMP = E.CODEMP
      WHERE E.CODPROD = ${codProd}
      GROUP BY E.CODEMP, EMP.RAZAOSOCIAL, EMP.NOMEFANTASIA
      ORDER BY EMP.CODEMP
    `;
    console.log(`[STK-ALL] Querying stock for CODPROD ${codProd} in all units`);
    const response = await postGatewayWithRetry({ requestBody: { sql } });

    const rb = response.data?.responseBody;
    const stocks = [];

    if (Array.isArray(rb?.rows)) {
      for (const row of rb.rows) {
        stocks.push({
          codEmp: row[0],
          razaoSocial: row[1],
          nomeFantasia: row[2],
          disponivel: Number(row[3]) || 0
        });
      }
    }

    return stocks;
  } catch (err) {
    console.error(`[STK-ALL] Erro: ${err.message}`);
    return [];
  }
}

// --- ENDPOINT: Stock from all units for a product ---
app.get("/sankhya/stock-all-units/:codProd", async (req, res) => {
  const { codProd } = req.params;

  try {
    console.log(`[STK-ALL] Fetching stock for CODPROD ${codProd} from all units`);

    const stocks = await consultaEstoqueTodasUnidades(codProd);
    const totalDisponivel = stocks.reduce((sum, s) => sum + s.disponivel, 0);

    res.json({
      success: true,
      codProd: Number(codProd),
      totalDisponivel,
      units: stocks
    });

  } catch (error) {
    console.error(`[STK-ALL ERROR] ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// --- ENDPOINT: Stock of multiple products from all units ---
app.post("/sankhya/stock-all-units", async (req, res) => {
  const { codProds } = req.body; // Array of product codes

  if (!Array.isArray(codProds) || codProds.length === 0) {
    return res.status(400).json({
      success: false,
      error: "codProds deve ser um array de códigos de produto"
    });
  }

  try {
    console.log(`[STK-ALL] Fetching stock for ${codProds.length} products from all units`);

    const results = [];
    for (const codProd of codProds) {
      const stocks = await consultaEstoqueTodasUnidades(codProd);
      const totalDisponivel = stocks.reduce((sum, s) => sum + s.disponivel, 0);
      results.push({
        codProd: Number(codProd),
        totalDisponivel,
        units: stocks
      });
    }

    res.json({
      success: true,
      products: results
    });

  } catch (error) {
    console.error(`[STK-ALL ERROR] ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.post("/hubspot/prices/deal", async (req, res) => {
  console.log("--- Chamada /prices/deal (Multi-Item) ---");
  try {
    const { objectId } = req.body;
    const ctx = await getDealSankhyaContext(objectId, process.env.HUBSPOT_ACCESS_TOKEN);

    if (!ctx.codParc || !ctx.codEmp || ctx.items.length === 0) {
      return res.json({ status: "MISSING_DATA", message: "Dados incompletos (Parceiro, Empresa ou Itens).", details: ctx });
    }

    // Contexto da Empresa Selecionada
    const empresaNome = await getEmpresaNome(ctx.codEmp);

    // Buscar TODAS as empresas do sistema para dual stock
    const allCompaniesResponse = await postGatewayWithRetry({
      requestBody: { sql: "SELECT CODEMP, RAZAOSOCIAL, NOMEFANTASIA FROM TSIEMP WHERE ATIVO = 'S' ORDER BY CODEMP" }
    });
    const allCompanies = allCompaniesResponse.data?.responseBody?.rows?.map(row => ({
      codEmp: row[0],
      razaoSocial: row[1],
      nomeFantasia: row[2]
    })) || [];

    // Identificar a "outra empresa" (assumindo 2 empresas principais)
    const otherCompany = allCompanies.find(c => c.codEmp !== ctx.codEmp);
    const otherCodEmp = otherCompany?.codEmp;

    // Processar cada item
    const processedItems = await Promise.all(ctx.items.map(async (item) => {
      // Buscar preços e estoque da empresa selecionada
      const [pv1, pv2, pv3, estoque, estoqueOutraEmpresa] = await Promise.all([
        consultaPreco(item.codProd, ctx.codParc, ctx.codEmp, 1),
        consultaPreco(item.codProd, ctx.codParc, ctx.codEmp, 2),
        consultaPreco(item.codProd, ctx.codParc, ctx.codEmp, 3),
        consultaEstoque(item.codProd, ctx.codEmp),
        otherCodEmp ? consultaEstoque(item.codProd, otherCodEmp) : Promise.resolve(0),
      ]);

      return {
        ...item,
        prices: { pv1, pv2, pv3 },
        stock: estoque,
        stockContext: empresaNome, // Empresa selecionada
        stockOther: estoqueOutraEmpresa, // Estoque da outra empresa
        stockOtherContext: otherCompany?.nomeFantasia || otherCompany?.razaoSocial || "Outra Unidade"
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

app.post("/hubspot/update/line-item", async (req, res) => {
  try {
    const { lineItemId, quantity, price } = req.body;
    if (!lineItemId) return res.status(400).json({ error: "Missing lineItemId" });

    const properties = {};
    if (quantity !== undefined && quantity !== null) {
      properties.quantity = String(quantity);
    }
    if (price !== undefined && price !== null) {
      properties.price = String(price);
    }

    if (Object.keys(properties).length === 0) {
      return res.status(400).json({ error: "Missing quantity or price to update" });
    }

    console.log(`[UPDATE] Updating LineItem ${lineItemId}:`, properties);

    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/line_items/${lineItemId}`,
      { properties },
      { headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` } }
    );

    return res.json({ status: "SUCCESS" });
  } catch (err) {
    console.error(`[UPDATE ERROR] ${err.message}`);
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

// --- IMPORTAÇÃO SANKHYA -> HUBSPOT (Enterprise Grade) ---

// Helper: Search HubSpot Company by property
async function findHubSpotCompany(token, propertyName, value) {
  if (!value) return null;
  try {
    const response = await axios.post(`https://api.hubspot.com/crm/v3/objects/companies/search`, {
      filterGroups: [{ filters: [{ propertyName, operator: "EQ", value: String(value) }] }],
      properties: ["name", "cnpj", "cpf", "codparc"]
    }, { headers: { Authorization: `Bearer ${token}` } });
    return response.data.total > 0 ? response.data.results[0] : null;
  } catch (err) {
    console.warn(`[SEARCH WARN] ${propertyName}=${value}: ${err.message}`);
    return null;
  }
}

app.post("/sankhya/import/partners", async (req, res) => {
  console.log("[IMPORT] ========== INÍCIO DA IMPORTAÇÃO ==========");
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  const { since, limit, offset = 0 } = req.body; // since = ISO date, offset for pagination

  try {
    // 1. Query Sankhya - TODOS os campos disponíveis (baseado em GerarJsonParceiro.java)
    let query = `
      SELECT P.CODPARC, P.NOMEPARC, P.RAZAOSOCIAL, P.CGC_CPF, P.EMAIL, P.TELEFONE, 
             P.CEP, P.NUMEND, P.COMPLEMENTO, P.TIPPESSOA, P.INSCESTADNAUF, 
             P.FORNECEDOR, P.CLIENTE, P.CODTAB, P.CODVEND, P.LIMCRED, 
             P.BLOQUEAR, P.EMAILNFE, P.CODCID, P.DTALTER,
             P.TIPOFATUR, P.OBSERVACOES, P.CODGRUPO, P.CLASSIFICMS,
             NVL(EDR.TIPO,'') || ' ' || NVL(EDR.NOMEEND,'') AS ENDERECO,
             BAI.NOMEBAI AS BAIRRO,
             CID.NOMECID
      FROM TGFPAR P
      LEFT JOIN TSIEND EDR ON EDR.CODEND = P.CODEND
      LEFT JOIN TSICID CID ON CID.CODCID = P.CODCID
      LEFT JOIN TSIBAI BAI ON BAI.CODBAI = P.CODBAI
      WHERE P.ATIVO = 'S' AND P.TIPPESSOA = 'J'
    `;
    if (since) {
      query += ` AND P.DTALTER >= TO_DATE('${since}', 'YYYY-MM-DD"T"HH24:MI:SS')`;
    }
    query += ` ORDER BY P.CODPARC DESC`;

    // Default limit de 1000 se não especificado (evita timeout em full syncs muito grandes)
    const effectiveLimit = limit !== undefined ? limit : 1000;

    // Pagination: OFFSET + FETCH (Oracle 12c+)
    if (offset > 0) {
      query += ` OFFSET ${offset} ROWS`;
    }
    if (effectiveLimit > 0) {
      query += ` FETCH FIRST ${effectiveLimit} ROWS ONLY`;
    }

    console.log(`[IMPORT] Limit efetivo: ${effectiveLimit === 1000 ? '1000 (padrão)' : effectiveLimit}`);

    const partners = await executeSankhyaQuery(query) || [];
    console.log(`[IMPORT] ${partners.length} parceiros a processar${since ? ` (desde ${since})` : ''}`);


    const stats = { created: 0, updated: 0, errors: 0, skipped: 0 };
    const auditLog = [];
    const delay = ms => new Promise(r => setTimeout(r, ms));

    for (const parc of partners) {
      const taxId = parc.CGC_CPF ? String(parc.CGC_CPF).replace(/\D/g, '') : null;
      const sankhyaId = String(parc.CODPARC);
      const isPJ = taxId && taxId.length === 14; // CNPJ
      const isPF = taxId && taxId.length === 11; // CPF

      // === DEDUPLICAÇÃO COM HIERARQUIA ===
      let company = null;
      let matchedBy = null;

      // 1. Tentar CNPJ (PJ)
      if (isPJ) {
        company = await findHubSpotCompany(token, "cnpj", taxId);
        if (company) matchedBy = "CNPJ";
      }

      // 2. Fallback: CPF (PF)
      if (!company && isPF) {
        company = await findHubSpotCompany(token, "cpf", taxId);
        if (company) matchedBy = "CPF";
      }

      // 3. Fallback: Sankhya ID (busca por codparc)
      if (!company) {
        company = await findHubSpotCompany(token, "codparc", sankhyaId);
        if (company) matchedBy = "CODPARC";
      }

      // === MAPEAR TODAS AS PROPRIEDADES DISPONÍVEIS ===
      const properties = {
        name: parc.NOMEPARC || parc.RAZAOSOCIAL,
        razao_social: parc.RAZAOSOCIAL || undefined,
        codparc: sankhyaId,
        sankhya_partner_id: sankhyaId,
        ativo_sankhya: true,
        email: parc.EMAIL || undefined,
        phone: parc.TELEFONE ? String(parc.TELEFONE) : undefined,
        address: parc.ENDERECO || undefined,
        numero_do_endereco: parc.NUMEND || undefined,
        bairro: parc.BAIRRO || undefined,
        city: parc.NOMECID || undefined,
        zip: parc.CEP || undefined,
        inscricao_estadual: parc.INSCESTADNAUF || undefined,
        limite_credito: parc.LIMCRED ? Number(parc.LIMCRED) : undefined,
        bloqueado_financeiro: parc.BLOQUEAR === 'S',
        email_nfe: parc.EMAILNFE || undefined,
        tipo_pagamento: parc.TIPOFATUR || undefined,
        description: parc.OBSERVACOES || undefined,
        grupo_parceiro: parc.CODGRUPO ? String(parc.CODGRUPO) : undefined,
        classificacao_icms: parc.CLASSIFICMS || undefined,
        tabela_preco_id: parc.CODTAB ? String(parc.CODTAB) : undefined,
        codvend: parc.CODVEND ? Number(parc.CODVEND) : undefined,
        is_cliente: parc.CLIENTE === 'S',
        is_fornecedor: parc.FORNECEDOR === 'S',
        tipo_de_pessoa: parc.TIPPESSOA === 'J' ? 'Jurídica' : 'Física'
      };

      // Popular CNPJ ou CPF
      if (isPJ) properties.cnpj = taxId;
      if (isPF) properties.cpf = taxId;

      // Limpar undefined
      Object.keys(properties).forEach(k => properties[k] === undefined && delete properties[k]);

      try {
        if (company) {
          // UPDATE
          await axios.patch(`https://api.hubspot.com/crm/v3/objects/companies/${company.id}`, { properties }, { headers: { Authorization: `Bearer ${token}` } });
          console.log(`[UPDATE] ${matchedBy} -> ID ${company.id} - ${properties.name}`);
          stats.updated++;
          auditLog.push({ op: "UPDATE", sankhyaId, hubspotId: company.id, matchedBy });
        } else {
          // CREATE
          const createResp = await axios.post(`https://api.hubspot.com/crm/v3/objects/companies`, { properties }, { headers: { Authorization: `Bearer ${token}` } });
          console.log(`[CREATE] ${properties.name} -> ID ${createResp.data.id}`);
          stats.created++;
          auditLog.push({ op: "CREATE", sankhyaId, hubspotId: createResp.data.id });
        }
      } catch (err) {
        const errMsg = err.response?.data?.message || err.message;
        console.error(`[ERROR] Parc ${sankhyaId}: ${errMsg}`);
        stats.errors++;
        auditLog.push({ op: "ERROR", sankhyaId, error: errMsg });
      }

      await delay(120); // Rate limit safe
    }

    console.log(`[IMPORT] ========== FIM: ${JSON.stringify(stats)} ==========`);
    res.json({
      status: "SUCCESS",
      stats,
      processed: partners.length,
      nextOffset: offset + partners.length,  // For stateful batch processing
      auditLog: auditLog.slice(0, 20)
    });

  } catch (err) {
    console.error(`[IMPORT FATAL] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

// Helper: Search HubSpot Product by SKU
async function findHubSpotProduct(token, sku) {
  if (!sku) return null;
  try {
    const response = await axios.post(`https://api.hubspot.com/crm/v3/objects/products/search`, {
      filterGroups: [{ filters: [{ propertyName: "hs_sku", operator: "EQ", value: String(sku) }] }],
      properties: ["name", "hs_sku", "description", "unit_of_measure"]
    }, { headers: { Authorization: `Bearer ${token}` } });
    return response.data.total > 0 ? response.data.results[0] : null;
  } catch (err) {
    console.warn(`[PRODUCT SEARCH WARN] SKU=${sku}: ${err.message}`);
    return null;
  }
}
// DEBUG: Endpoint para ver colunas disponíveis
app.get("/sankhya/debug/products", async (req, res) => {
  try {
    const result = await executeSankhyaQuery("SELECT * FROM TGFPRO WHERE ROWNUM <= 1");
    res.json(result);
  } catch (error) {
    res.status(500).send(error.message);
  }
});
// DEBUG: Endpoint para ver tabelas de preço
app.get("/sankhya/debug/pricetables", async (req, res) => {
  try {
    const result = await executeSankhyaQuery("SELECT NUTAB, NOMETAB FROM TGFTAB WHERE ATIVA = 'S'");
    res.json(result);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get("/sankhya/debug/price-scan", async (req, res) => {
  try {
    const query = `
      SELECT E.NUTAB, COUNT(1) as QTD 
      FROM TGFEXC E
      JOIN TGFPRO P ON P.CODPROD = E.CODPROD
      WHERE P.ATIVO = 'S'
      GROUP BY E.NUTAB
      ORDER BY COUNT(1) DESC
    `;
    const result = await executeSankhyaQuery(query);
    res.json(result);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get("/sankhya/debug/price/:sku", async (req, res) => {
  try {
    const { sku } = req.params;
    const query = `
      SELECT NUTAB, VLRVENDA, CODPROD
      FROM TGFEXC 
      WHERE CODPROD = ${sku}
    `;
    const result = await executeSankhyaQuery(query);
    res.json(result);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.get("/hubspot/debug/product-properties", async (req, res) => {
  try {
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    const response = await axios.get('https://api.hubspot.com/crm/v3/properties/products', {
      headers: { Authorization: `Bearer ${token}` }
    });
    // Return sorted by label for easier reading
    const props = response.data.results.map(p => ({
      label: p.label,
      name: p.name,
      type: p.type
    })).sort((a, b) => a.label.localeCompare(b.label));

    res.json(props);
  } catch (error) {
    res.status(500).json({ error: error.message, detail: error.response?.data });
  }
});

app.post("/sankhya/import/products", async (req, res) => {
  console.log("[PRODUCT IMPORT] ========== INÍCIO DA IMPORTAÇÃO ==========");
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  const { since, limit, offset = 0 } = req.body;

  try {
    let query = `
      SELECT 
        P.CODPROD, P.DESCRPROD, P.COMPLDESC, P.CODVOL, P.ATIVO, P.REFERENCIA, P.PESOLIQ, P.DTALTER, P.NCM, P.MARCA, P.PESOBRUTO,
        P.TEMIPIVENDA, P.TEMIPICOMPRA, P.TEMICMS, P.TEMINSS, P.TEMCOMISSAO, P.CALCDIFAL, P.TEMCIAP, 
        P.PERCCMTEST, P.PERCCMTFED, P.PERCCMTIMP,
        P.GRUPOICMS, P.GRUPOPIS, P.GRUPOCOFINS, P.GRUPOCSSL, P.CSTIPIENT, P.CSTIPISAI, P.CODESPECST,
        P.LARGURA, P.ALTURA, P.ESPESSURA, P.FABRICANTE, P.CNPJFABRICANTE, P.CODLOCALPADRAO,
        G.DESCRGRUPOPROD, V.DESCRVOL,
        (SELECT VLRVENDA FROM TGFEXC WHERE CODPROD = P.CODPROD AND NUTAB = 37 AND ROWNUM = 1) AS PRECO_TAB37,
        (SELECT VLRVENDA FROM TGFEXC WHERE CODPROD = P.CODPROD AND NUTAB = 35 AND ROWNUM = 1) AS PRECO_TAB35,
        (SELECT VLRVENDA FROM TGFEXC WHERE CODPROD = P.CODPROD AND NUTAB = 67 AND ROWNUM = 1) AS PRECO_TAB67,
        E.VLRVENDA AS PRECO_MAX_TOP10
      FROM TGFPRO P
      LEFT JOIN TGFGRU G ON P.CODGRUPOPROD = G.CODGRUPOPROD
      LEFT JOIN TGFVOL V ON P.CODVOL = V.CODVOL
      LEFT JOIN (
        SELECT CODPROD, MAX(VLRVENDA) as VLRVENDA 
        FROM TGFEXC 
        WHERE NUTAB IN (37, 35, 67, 42, 66, 40, 41, 49, 65, 47) 
        GROUP BY CODPROD
      ) E ON P.CODPROD = E.CODPROD
      WHERE P.ATIVO = 'S'
    `;
    if (since) {
      query += ` AND P.DTALTER >= TO_DATE('${since}', 'YYYY-MM-DD"T"HH24:MI:SS')`;
    }
    query += ` ORDER BY P.CODPROD DESC`;

    const effectiveLimit = limit !== undefined ? limit : 1000;
    if (offset > 0) {
      query += ` OFFSET ${offset} ROWS`;
    }
    if (effectiveLimit > 0) {
      query += ` FETCH FIRST ${effectiveLimit} ROWS ONLY`;
    }

    const products = await executeSankhyaQuery(query) || [];
    console.log(`[PRODUCT IMPORT] ${products.length} produtos a processar`);

    const stats = { created: 0, updated: 0, errors: 0, skipped: 0 };
    const auditLog = [];
    const delay = ms => new Promise(r => setTimeout(r, ms));

    for (const prod of products) {
      const sku = String(prod.CODPROD);
      let hsProduct = await findHubSpotProduct(token, sku);

      // Lógica de Prioridade de Preço Global (Para o campo price padrão)
      const priceDefault = prod.PRECO_MAX_TOP10 || prod.PRECO_TAB37 || prod.PRECO_TAB35 || undefined;

      // Conversão de Booleanos 'S'/'N' para string "true"/"false" (para Checkboxes/Booleans no HubSpot)
      const boolStr = (val) => (val === 'S' || val === 's') ? "true" : "false";

      // Mapeamento de Códigos de IPI para as Opções do HubSpot (Internal Names/Values)
      const mapIpiEntrada = (val) => {
        const s = val ? String(val).trim().padStart(2, '0') : "";
        if (s === '49') return '49-Outras Entradas';
        if (s === '03') return '03-Entrada Não Tributada';
        if (s === '-1') return '(-1)-Não sujeita ao IPI';
        return val ? String(val) : undefined;
      };
      const mapIpiSaida = (val) => {
        const s = val ? String(val).trim().padStart(2, '0') : "";
        if (s === '99') return '99-Outras Saídas';
        if (s === '53') return '53-Saída Não Tributada';
        if (s === '-1') return '(-1)-Não sujeita ao IPI';
        return val ? String(val) : undefined;
      };

      const properties = {
        // --- Core ---
        name: prod.DESCRPROD,
        price: priceDefault,
        hs_price_brl: priceDefault,
        hs_sku: sku,
        description: prod.COMPLDESC || undefined,
        ativo: boolStr(prod.ATIVO),

        // --- PVs (Tabelas Fixas) ---
        pv1: prod.PRECO_TAB37 || undefined,
        pv2: prod.PRECO_TAB35 || undefined,
        pv3: prod.PRECO_TAB67 || undefined,

        // --- Tributação Booleans (true/false) ---
        tem_ipi_na_venda: boolStr(prod.TEMIPIVENDA),
        tem_ipi_na_compra: boolStr(prod.TEMIPICOMPRA),
        calcular_icms: boolStr(prod.TEMICMS),
        tem_inss: boolStr(prod.TEMINSS),
        calcular_comissao: boolStr(prod.TEMCOMISSAO),
        calcular_difal: boolStr(prod.CALCDIFAL),
        atualizar_ciap: boolStr(prod.TEMCIAP),

        // --- Classificação ---
        ncm: prod.NCM ? Number(String(prod.NCM).replace(/\D/g, '')) : undefined,
        cest__codigo_especificador_st: prod.CODESPECST ? Number(prod.CODESPECST) : undefined,
        grupo_icms: prod.GRUPOICMS || undefined,
        grupo_pis: prod.GRUPOPIS || undefined,
        grupo_cofins: prod.GRUPOCOFINS || undefined,
        grupo_csll: prod.GRUPOCSSL || undefined,
        codigo_sittribipi_entrada: mapIpiEntrada(prod.CSTIPIENT),
        codigo_sittribipi_saida: mapIpiSaida(prod.CSTIPISAI),

        // --- Percentuais ---
        carga_media_trib_estadual: prod.PERCCMTEST ? Number(prod.PERCCMTEST) : undefined,
        carga_media_trib_federal: prod.PERCCMTFED ? Number(prod.PERCCMTFED) : undefined,
        carga_media_trib_importacao: prod.PERCCMTIMP ? Number(prod.PERCCMTIMP) : undefined,

        // --- Dimensões e Pesos ---
        peso_bruto: prod.PESOBRUTO ? Number(prod.PESOBRUTO) : undefined,
        unidade: prod.CODVOL || undefined,

        // --- Outros ---
        marca: prod.MARCA || undefined,
        fabricante: prod.FABRICANTE || undefined,
        cnpj_fabricante: prod.CNPJFABRICANTE ? String(prod.CNPJFABRICANTE) : undefined,
        referencia_ean: prod.REFERENCIA || undefined,
        complemento_snk: prod.COMPLDESC || undefined,
        local_padrao: prod.CODLOCALPADRAO ? String(prod.CODLOCALPADRAO) : undefined,
        grupo: prod.DESCRGRUPOPROD || undefined,
        sankhya_product_id: Number(sku),
        codprod: Number(sku)
      };

      // DEBUG: Logar o primeiro produto do batch para conferência
      if (stats.updated === 0 && stats.created === 0 && stats.errors === 0) {
        console.log(`[DEBUG PAYLOAD] SKU ${sku}:`, JSON.stringify(properties, null, 2));
      }

      // Limpar undefined
      Object.keys(properties).forEach(k => properties[k] === undefined && delete properties[k]);

      try {
        if (hsProduct) {
          // UPDATE
          await axios.patch(`https://api.hubspot.com/crm/v3/objects/products/${hsProduct.id}`, { properties }, { headers: { Authorization: `Bearer ${token}` } });
          console.log(`[UPDATE PRODUCT] SKU ${sku} -> ID ${hsProduct.id} - ${properties.name}`);
          stats.updated++;
          auditLog.push({ op: "UPDATE", sku, hubspotId: hsProduct.id });
        } else {
          // CREATE
          const createResp = await axios.post(`https://api.hubspot.com/crm/v3/objects/products`, { properties }, { headers: { Authorization: `Bearer ${token}` } });
          console.log(`[CREATE PRODUCT] ${properties.name} -> ID ${createResp.data.id}`);
          stats.created++;
          auditLog.push({ op: "CREATE", sku, hubspotId: createResp.data.id });
        }
      } catch (err) {
        const errorData = err.response?.data || {};
        const errMsg = errorData.message || err.message;
        console.error(`[ERROR PRODUCT] SKU ${sku}: ${errMsg}`);
        if (errorData.errors) {
          console.error(`[DETAIL ERROR] SKU ${sku}: ${JSON.stringify(errorData.errors)}`);
        }
        stats.errors++;
        auditLog.push({ op: "ERROR", sku, error: errMsg });
      }

      await delay(120); // Rate limit safe
    }

    console.log(`[PRODUCT IMPORT] ========== FIM: ${JSON.stringify(stats)} ==========`);
    res.json({
      status: "SUCCESS",
      stats,
      processed: products.length,
      nextOffset: offset + products.length,
      auditLog: auditLog.slice(0, 20)
    });

  } catch (err) {
    console.error(`[PRODUCT IMPORT FATAL] ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});
// ============================================================
// 🔍 DISCOVERY ENDPOINT: Sankhya Quote Tables
// ============================================================
app.get("/sankhya/discovery/quote-tables", async (req, res) => {
  try {
    const token = await getAccessToken();

    const queries = [
      {
        name: "TOPs Disponíveis (Tipos de Operação)",
        sql: `SELECT CODTIPOPER, DESCROPER, ATIVO, TIPATUALESTOQUE, ATUALFIN, BONIFICACAO 
              FROM TGFTOP 
              WHERE ATIVO = 'S' 
              ORDER BY CODTIPOPER`
      },
      {
        name: "Colunas Obrigatórias - TGFCAB",
        sql: `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_DEFAULT
              FROM USER_TAB_COLUMNS 
              WHERE TABLE_NAME = 'TGFCAB' 
              AND NULLABLE = 'N'
              ORDER BY COLUMN_ID`
      },
      {
        name: "Colunas Obrigatórias - TGFITE",
        sql: `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_DEFAULT
              FROM USER_TAB_COLUMNS 
              WHERE TABLE_NAME = 'TGFITE' 
              AND NULLABLE = 'N'
              ORDER BY COLUMN_ID`
      },
      {
        name: "Sample de TGFCAB (TOP 999 - Orçamento)",
        sql: `SELECT NUNOTA, CODPARC, CODTIPOPER, DTNEG, CODVEND, VLRNOTA, STATUSNOTA, CODCENCUS
              FROM TGFCAB 
              WHERE CODTIPOPER = 999 
              AND ROWNUM <= 5
              ORDER BY NUNOTA DESC`
      },
      {
        name: "Centros de Resultado Disponíveis",
        sql: `SELECT CODCENCUS, DESCRCENCUS FROM TSICUS WHERE ROWNUM <= 20 ORDER BY CODCENCUS`
      },
      {
        name: "CODCENCUS Mais Usados em TGFCAB",
        sql: `SELECT CODCENCUS, COUNT(*) AS QTD FROM TGFCAB WHERE CODCENCUS IS NOT NULL GROUP BY CODCENCUS ORDER BY QTD DESC FETCH FIRST 10 ROWS ONLY`
      },
      {
        name: "CODNAT Mais Usados (TOP 999)",
        sql: `SELECT CODNAT, COUNT(*) AS QTD FROM TGFCAB WHERE CODTIPOPER = 999 AND CODNAT IS NOT NULL GROUP BY CODNAT ORDER BY QTD DESC FETCH FIRST 10 ROWS ONLY`
      },
      {
        name: "Naturezas Disponíveis",
        sql: `SELECT CODNAT, DESCRNAT FROM TGFNAT WHERE ATIVO = 'S' AND ROWNUM <= 20 ORDER BY CODNAT`
      },
      {
        name: "CODTIPVENDA Mais Usados (TOP 999)",
        sql: `SELECT CODTIPVENDA, COUNT(*) AS QTD FROM TGFCAB WHERE CODTIPOPER = 999 GROUP BY CODTIPVENDA ORDER BY QTD DESC FETCH FIRST 10 ROWS ONLY`
      },
      {
        name: "Modelos de Impressão (TOP 999)",
        sql: `SELECT CODTIPOPER, CODREL, DESCRREL FROM TGFTPR WHERE CODTIPOPER = 999`
      },
      {
        name: "Mapeamento para TOP 999 (TGFMODTOP)",
        sql: `SELECT * FROM TGFMODTOP WHERE CODTIPOPER = 999`
      },
      {
        name: "Todos os Relatórios (TSIREL) - Busca por Nome",
        sql: `SELECT CODREL, NOMEREL, DESCRREL FROM TSIREL WHERE NOMEREL LIKE '%ORC%' OR NOMEREL LIKE '%PED%'`
      },
      {
        name: "Relatórios Formatados (TFPMOD) - Busca por Nome",
        sql: `SELECT CODREL, CODMOD, NOMEREL FROM TFPMOD WHERE NOMEREL LIKE '%ORC%' OR NOMEREL LIKE '%PED%'`
      },
      {
        name: "Modelos de Nota (TGFTOP)",
        sql: `SELECT CODTIPOPER, DESCROPER, CODMODNF, CODMODDOC FROM TGFTOP WHERE CODTIPOPER = 999`
      }
    ];

    const results = {};

    for (const q of queries) {
      try {
        const response = await postGatewayWithRetry({
          requestBody: { sql: q.sql }
        });

        const rb = response.data?.responseBody;
        results[q.name] = {
          success: true,
          rows: rb?.rows || [],
          fields: rb?.fieldsMetadata || []
        };
      } catch (err) {
        results[q.name] = {
          success: false,
          error: err.message
        };
      }
    }

    res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results
    });

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// ============================================================
// 🔍 DISCOVERY: Test Available Sankhya Services
// ============================================================
app.get("/sankhya/discovery/services", async (req, res) => {
  try {
    const token = await getAccessToken();

    // Lista de serviços candidatos para criar notas/orçamentos
    const services = [
      { module: "mge", name: "CACSP.incluirNota" },
      { module: "mgecom", name: "CACSP.incluirNota" },
      { module: "mge", name: "SelecaoDocumentoSP.incluirNota" },
      { module: "mgecom", name: "SelecaoDocumentoSP.incluirNota" },
      { module: "mge", name: "ServicosNfeSP.incluirNota" },
      { module: "mge", name: "CRUDServiceProvider.saveRecord" },
      { module: "mgecom", name: "CRUDServiceProvider.saveRecord" },
      { module: "mge", name: "DataSetSP.save" },
      { module: "mgecom", name: "DataSetSP.save" }
    ];

    const results = [];

    for (const svc of services) {
      const url = `${baseUrl}/gateway/v1/${svc.module}/service.sbr?serviceName=${svc.name}&outputType=json`;
      try {
        const resp = await axios.post(url, {
          serviceName: svc.name,
          requestBody: {}
        }, {
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          timeout: 5000
        });

        results.push({
          module: svc.module,
          service: svc.name,
          status: resp.data?.status,
          message: resp.data?.statusMessage?.substring(0, 100) || "OK",
          available: !resp.data?.statusMessage?.includes("Nenhum provedor")
        });
      } catch (e) {
        results.push({
          module: svc.module,
          service: svc.name,
          status: "ERROR",
          message: e.message.substring(0, 100),
          available: false
        });
      }
    }

    res.json({
      success: true,
      baseUrl,
      results,
      availableServices: results.filter(r => r.available).map(r => `${r.module}/${r.service}`)
    });

  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 🔍 DEBUG ENDPOINT: Inspect Deal Structure
// ============================================================
app.get("/hubspot/debug-deal/:dealId", async (req, res) => {
  try {
    const { dealId } = req.params;
    const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");

    // Buscar Deal com todas as associações possíveis
    const dealUrl = `https://api.hubspot.com/crm/v3/objects/deals/${dealId}?associations=companies,contacts,quotes,line_items&properties=dealname,amount,dealstage`;
    const dealResp = await axios.get(dealUrl, {
      headers: { Authorization: `Bearer ${hubspotToken}` }
    });

    const deal = dealResp.data;
    const result = {
      dealId,
      dealName: deal.properties.dealname,
      amount: deal.properties.amount,
      associations: {
        companies: deal.associations?.companies?.results || [],
        contacts: deal.associations?.contacts?.results || [],
        quotes: deal.associations?.quotes?.results || [],
        line_items: deal.associations?.line_items?.results || []
      }
    };

    // Se houver Quote, buscar os Line Items da Quote
    if (result.associations.quotes.length > 0) {
      const quoteId = result.associations.quotes[0].id;
      const quoteUrl = `https://api.hubspot.com/crm/v3/objects/quotes/${quoteId}?associations=line_items`;
      const quoteResp = await axios.get(quoteUrl, {
        headers: { Authorization: `Bearer ${hubspotToken}` }
      });

      result.quoteLineItems = quoteResp.data.associations?.line_items?.results || [];
    }

    res.json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================================
// 📝 CREATE QUOTE ENDPOINT: HubSpot Deal → Sankhya Orçamento
// ============================================================
app.post("/hubspot/create-quote", async (req, res) => {
  try {
    const { dealId } = req.body;

    if (!dealId) {
      return res.status(400).json({ success: false, error: "dealId é obrigatório" });
    }

    const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");

    // 1. Buscar dados do Deal (apenas propriedades)
    console.log(`[QUOTE] Buscando Deal ${dealId}...`);
    const dealUrl = `https://api.hubspot.com/crm/v3/objects/deals/${dealId}?properties=codemp_sankhya,sankhya_codemp,amount,dealname,closedate,tipo_negociacao,dealtype,natureza_id,hubspot_owner_id`;
    const dealResp = await axios.get(dealUrl, {
      headers: { Authorization: `Bearer ${hubspotToken}` }
    });

    const props = dealResp.data.properties;

    // 2. Extrair CodeEmp
    const codEmpRaw = props.codemp_sankhya || props.sankhya_codemp || "1";
    const codEmp = toInt("codEmp", codEmpRaw) || 1;


    // 3. Extrair propriedades Sankhya do Deal
    const codTipVendaRaw = props.tipo_negociacao;
    const codTipVenda = toInt("codTipVenda", codTipVendaRaw) || 503;

    const codTipOperRaw = props.dealtype;
    const codTipOper = toInt("codTipOper", codTipOperRaw) || 999; // Fallback 999 = Orçamento

    const codNatRaw = props.natureza_id;
    const codNat = toInt("codNat", codNatRaw) || 101001; // Fallback para natureza padrão

    console.log(`[QUOTE] Propriedades Sankhya mapeadas:`);
    console.log(`  - CODTIPOPER: ${codTipOper} (dealtype)`);
    console.log(`  - CODTIPVENDA: ${codTipVenda} (tipo_negociacao)`);
    console.log(`  - CODNAT: ${codNat} (natureza_id)`);
    console.log(`  - CODCENCUS: 101002 (hardcoded)`);

    // 3. Buscar CodParc (Company) via associations API
    const companyAssocUrl = `https://api.hubspot.com/crm/v3/objects/deals/${dealId}/associations/companies`;
    const companyAssocResp = await axios.get(companyAssocUrl, {
      headers: { Authorization: `Bearer ${hubspotToken}` }
    });

    const companyId = companyAssocResp.data.results?.[0]?.id;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "Deal não possui Company associada"
      });
    }

    const companyResp = await axios.get(
      `https://api.hubspot.com/crm/v3/objects/companies/${companyId}?properties=sankhya_codparc,codparc`,
      { headers: { Authorization: `Bearer ${hubspotToken}` } }
    );

    const codParcRaw = companyResp.data.properties.sankhya_codparc || companyResp.data.properties.codparc;
    const codParc = toInt("codParc", codParcRaw);

    if (!codParc) {
      return res.status(400).json({
        success: false,
        error: "Company não possui código Sankhya (sankhya_codparc ou codparc)"
      });
    }

    // 4. Buscar Line Items (método correto via associations API)
    console.log(`[QUOTE] Buscando Line Items do Deal ${dealId}...`);
    const lineItemsAssocUrl = `https://api.hubspot.com/crm/v3/objects/deals/${dealId}/associations/line_items`;
    const lineItemsAssocResp = await axios.get(lineItemsAssocUrl, {
      headers: { Authorization: `Bearer ${hubspotToken}` }
    });

    const lineItemIds = lineItemsAssocResp.data.results?.map(r => r.id) || [];

    if (lineItemIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Deal não possui Line Items associados"
      });
    }

    console.log(`[QUOTE] Carregando detalhes de ${lineItemIds.length} Line Items...`);
    const lineItemsResp = await axios.post(
      `https://api.hubspot.com/crm/v3/objects/line_items/batch/read`,
      {
        properties: ["hs_product_id", "quantity", "price", "name", "hs_sku"],
        inputs: lineItemIds.map(id => ({ id }))
      },
      { headers: { Authorization: `Bearer ${hubspotToken}` } }
    );

    const lineItems = lineItemsResp.data.results;

    // 5. Mapear produtos HubSpot → Sankhya
    const productItems = [];
    for (const item of lineItems) {
      const hsProductId = item.properties.hs_product_id;
      const quantity = parseFloat(item.properties.quantity) || 0; // Allow 0 quantities
      const price = parseFloat(item.properties.price) || 0;
      let sku = item.properties.hs_sku;

      // Se não veio SKU no Line Item, tenta buscar no objeto Product (se houver ID)
      if (!sku && hsProductId) {
        try {
          const prodResp = await axios.get(
            `https://api.hubspot.com/crm/v3/objects/products/${hsProductId}?properties=hs_sku`,
            { headers: { Authorization: `Bearer ${hubspotToken}` } }
          );
          sku = prodResp.data.properties.hs_sku;
        } catch (e) {
          console.error(`[QUOTE] Erro ao buscar SKU do produto ${hsProductId}: ${e.message}`);
        }
      }

      // Sanitizar SKU: extrair apenas a parte numérica (ex: "72#2" -> "72")
      if (sku) {
        sku = String(sku).split('#')[0].trim();
      }

      const codProd = toInt("codProd", sku);

      if (!codProd) {
        console.warn(`[QUOTE] Line Item ${item.id} (${item.properties.name}) não possui SKU/CODPROD válido: ${sku}`);
        continue;
      }

      // Buscar unidade do produto no Sankhya
      const prodInfoSql = `SELECT CODVOL FROM TGFPRO WHERE CODPROD = ${codProd}`;
      const prodInfoResp = await postGatewayWithRetry({ requestBody: { sql: prodInfoSql } });
      const codVol = prodInfoResp.data?.responseBody?.rows?.[0]?.[0] || "UN";

      productItems.push({
        codProd,
        codVol,
        qtdNeg: quantity,
        vlrUnit: price,
        vlrTot: quantity * price
      });
    }

    if (productItems.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Nenhum produto válido encontrado nos Line Items"
      });
    }

    // 6. Calcular totais
    const vlrNota = productItems.reduce((sum, item) => sum + item.vlrTot, 0);
    const dtneg = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dtNegFormatted = new Date().toLocaleDateString('pt-BR'); // DD/MM/YYYY

    // 7. Criar orçamento usando CRUD Service do Sankhya
    console.log(`[QUOTE] Criando orçamento via CRUD Service para CODPARC=${codParc}, CODEMP=${codEmp}, VLRNOTA=${vlrNota}...`);

    // Estrutura de dados para o orçamento (TGFCAB + TGFITE)
    const orderData = {
      cabecalho: {
        CODEMP: codEmp,
        CODPARC: codParc,
        CODTIPOPER: codTipOper, // Tipo de Operação (999=Orçamento)
        CODEMPNEGOC: codEmp,
        CODVEND: 0,
        TIPMOV: 'P', // Pedido
        DTNEG: dtNegFormatted
      },
      itens: productItems.map((item, index) => ({
        SEQUENCIA: index + 1,
        CODPROD: item.codProd,
        CODVOL: item.codVol,
        QTDNEG: item.qtdNeg,
        VLRUNIT: item.vlrUnit,
        VLRTOT: item.vlrTot
      }))
    };

    // Usar o serviço de inclusão de nota do Sankhya (módulo MGECOM)
    const INCLUIR_NOTA_URL = `${baseUrl}/gateway/v1/mgecom/service.sbr?serviceName=CACSP.incluirNota&outputType=json`;

    // Estrutura correta do payload para CACSP.incluirNota
    const notaBody = {
      requestBody: {
        nota: {
          cabecalho: {
            NUNOTA: { "$": "" },  // Vazio para criar novo
            CODEMP: { "$": codEmp },
            CODPARC: { "$": codParc },
            CODTIPOPER: { "$": codTipOper },      // Tipo de Operação: da propriedade dealtype
            CODEMPNEGOC: { "$": codEmp },
            CODVEND: { "$": 0 },                    // TODO: mapear hubspot_owner_id
            TIPMOV: { "$": "P" },
            DTNEG: { "$": dtNegFormatted },
            CODCENCUS: { "$": 101002 },             // Centro de Custo: FIXO (COMERCIAL)
            CODNAT: { "$": codNat },                // Natureza: da propriedade natureza_id
            CODTIPVENDA: { "$": codTipVenda }       // Tipo de Negociação: da propriedade tipo_negociacao
          },
          itens: {
            item: productItems.map((item, index) => ({
              NUNOTA: { "$": "" },
              SEQUENCIA: { "$": index + 1 },
              CODEMP: { "$": codEmp },
              CODPROD: { "$": item.codProd },
              CODVOL: { "$": item.codVol },
              CODLOCALORIG: { "$": 0 },   // Local de Origem: padrão
              QTDNEG: { "$": item.qtdNeg },
              VLRUNIT: { "$": item.vlrUnit },
              VLRTOT: { "$": item.vlrTot }
            }))
          }
        }
      }
    };

    let token = await getAccessToken();
    console.log(`[QUOTE] Enviando para CACSP.incluirNota: ${JSON.stringify(notaBody).substring(0, 800)}...`);

    const notaResp = await axios.post(INCLUIR_NOTA_URL, notaBody, {
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      timeout: 60000
    });

    console.log(`[QUOTE] Resposta CACSP.incluirNota: ${JSON.stringify(notaResp.data).substring(0, 500)}`);

    // Extrair NUNOTA da resposta (formato Sankhya: {$: valor})
    let nunotaRaw = notaResp.data?.responseBody?.pk?.NUNOTA
      || notaResp.data?.responseBody?.NUNOTA
      || notaResp.data?.responseBody?.nota?.NUNOTA;

    // Se veio como objeto {$: valor}, extrai o valor
    const nunota = (nunotaRaw && typeof nunotaRaw === 'object' && nunotaRaw.$)
      ? nunotaRaw.$
      : nunotaRaw;

    if (!nunota) {
      // Tentar buscar o último NUNOTA criado para o parceiro
      const getNunotaSql = `SELECT MAX(NUNOTA) AS NUNOTA FROM TGFCAB WHERE CODPARC = ${codParc} AND CODTIPOPER = 999`;
      const nunotaResp = await postGatewayWithRetry({ requestBody: { sql: getNunotaSql } });
      const fallbackNunota = nunotaResp.data?.responseBody?.rows?.[0]?.[0];

      if (!fallbackNunota) {
        console.error(`[QUOTE] Falha ao criar orçamento. Resposta completa: ${JSON.stringify(notaResp.data)}`);
        throw new Error(`Falha ao criar orçamento no Sankhya. Verifique os logs.`);
      }

      console.log(`[QUOTE] NUNOTA obtido via fallback: ${fallbackNunota}`);
      return res.json({
        success: true,
        nunota: fallbackNunota,
        codEmp,
        codParc,
        vlrNota,
        itemCount: productItems.length,
        message: `Orçamento ${fallbackNunota} criado com sucesso! (fallback)`
      });
    }

    console.log(`[QUOTE] NUNOTA gerado: ${nunota}`);

    // 8. Tentar atualizar Deal no HubSpot com NUNOTA (opcional)
    console.log(`[QUOTE] Atualizando Deal ${dealId} com NUNOTA ${nunota}...`);
    let hubspotUpdateSuccess = false;
    try {
      await axios.patch(
        `https://api.hubspot.com/crm/v3/objects/deals/${dealId}`,
        {
          properties: {
            sankhya_nunota: nunota.toString() // Propriedade customizada no HubSpot
          }
        },
        { headers: { Authorization: `Bearer ${hubspotToken}` } }
      );
      hubspotUpdateSuccess = true;
      console.log(`[QUOTE] Deal ${dealId} atualizado com NUNOTA ${nunota}`);
    } catch (hsError) {
      console.warn(`[QUOTE] Falha ao atualizar Deal no HubSpot (propriedade pode não existir): ${hsError.message}`);
      // Não falhar - o orçamento foi criado com sucesso no Sankhya
    }

    // PDF só será gerado após confirmação do orçamento (quando houver rentabilidade e estoque)
    console.log(`[QUOTE] ℹ️ PDF não gerado - orçamento precisa ser confirmado primeiro`);

    res.json({
      success: true,
      nunota,
      codEmp,
      codParc,
      vlrNota,
      itemCount: productItems.length,
      hubspotUpdated: hubspotUpdateSuccess,
      message: `Orçamento ${nunota} criado com sucesso no Sankhya! Aguardando confirmação para gerar PDF.`
    });

  } catch (error) {
    console.error("[QUOTE ERROR]", error.message);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// --- PROFITABILITY CHECK ENDPOINT ---
/**
 * GET /sankhya/check-profitability/:nunota
 * Retorna dados de rentabilidade de uma nota/orçamento usando o serviço nativo do Sankhya
 */
app.get("/sankhya/check-profitability/:nunota", async (req, res) => {
  const { nunota } = req.params;

  try {
    console.log(`[PROFITABILITY] Checking profitability for NUNOTA ${nunota}...`);

    const token = await getAccessToken();
    const url = `${baseUrl}/gateway/v1/mge/service.sbr?serviceName=LiberacaoLimitesSP.getDadosRentabilidade&outputType=json`;

    const payload = {
      serviceName: "LiberacaoLimitesSP.getDadosRentabilidade",
      requestBody: {
        NUNOTA: Number(nunota)
      }
    };

    const resp = await axios.post(url, payload, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    const data = resp.data?.responseBody;

    if (!data) {
      return res.status(404).json({
        success: false,
        error: "Dados de rentabilidade não encontrados"
      });
    }

    // Parse percentages (Brazilian format "5,992%" -> 5.992)
    const parsePercent = (str) => {
      if (!str) return 0;
      return parseFloat(String(str).replace(',', '.').replace('%', '')) || 0;
    };

    const profitability = {
      nunota: Number(nunota),
      faturamento: parseFloat(data.somaFaturamento) || 0,
      custoMercadoriaVendida: parseFloat(data.somaCustoMercadoriaVendida) || 0,
      gastoVariavel: parseFloat(data.somaGastoVariavel) || 0,
      gastoFixo: parseFloat(data.somaGastoFixo) || 0,
      lucro: parseFloat(data.somaLucro) || 0,
      margemContribuicao: parseFloat(data.margemContrib) || 0,
      percentLucro: parsePercent(data.percentLucro),
      percentMC: parsePercent(data.percentMC),
      percentCMV: parsePercent(data.percentCMV),
      percentGV: parsePercent(data.percentGV),
      percentGF: parsePercent(data.percentGF),
      isRentavel: parseFloat(data.somaLucro) > 0,
      qtdItens: parseInt(data.contItens) || 0,
      produtosComCusto: data.produtosComCusto?.entities?.entity || null,
      produtosSemCusto: data.produtosSemCusto?.entities?.entity || null
    };

    console.log(`[PROFITABILITY] NUNOTA ${nunota}: Lucro=${profitability.lucro}, %Lucro=${profitability.percentLucro}%, Rentável=${profitability.isRentavel}`);

    res.json({
      success: true,
      profitability
    });

  } catch (error) {
    console.error(`[PROFITABILITY ERROR] ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// --- QUOTE STATUS CHECK ENDPOINT ---
/**
 * GET /hubspot/quote-status/:dealId
 * Retorna status do orçamento de um Deal para controle de botões dinâmicos
 */
app.get("/hubspot/quote-status/:dealId", async (req, res) => {
  const { dealId } = req.params;

  try {
    console.log(`[QUOTE-STATUS] Checking quote status for Deal ${dealId}...`);

    // 1. Buscar Deal no HubSpot
    const dealResp = await axios.get(
      `https://api.hubspot.com/crm/v3/objects/deals/${dealId}?properties=sankhya_nunota,dealname`,
      { headers: { Authorization: `Bearer ${hubspotToken}` } }
    );

    const nunota = dealResp.data.properties?.sankhya_nunota;
    const dealname = dealResp.data.properties?.dealname;

    // Se não tem NUNOTA, ainda não tem orçamento
    if (!nunota) {
      return res.json({
        success: true,
        status: {
          dealId,
          dealname,
          hasQuote: false,
          nunota: null,
          isConfirmed: false,
          profitability: null,
          buttonAction: "CREATE_QUOTE",
          buttonLabel: "Criar Orçamento"
        }
      });
    }

    // 2. Verificar se nota está confirmada no Sankhya
    const token = await getAccessToken();
    const notaStatusSql = `SELECT STATUSNOTA, STATUSNFE, VLRNOTA FROM TGFCAB WHERE NUNOTA = ${nunota}`;
    const notaResp = await postGatewayWithRetry({ requestBody: { sql: notaStatusSql } });
    const notaRow = notaResp.data?.responseBody?.rows?.[0];

    const statusNota = notaRow?.[0] || "P"; // P = Pendente, L = Liberada, F = Fechada
    const vlrNota = parseFloat(notaRow?.[2]) || 0;
    const isConfirmed = statusNota !== "P"; // Qualquer status diferente de Pendente = confirmada

    // 3. Buscar rentabilidade
    let profitability = null;
    let isRentavel = false;

    try {
      const profResp = await axios.get(
        `http://localhost:${PORT}/sankhya/check-profitability/${nunota}`
      );
      if (profResp.data?.success) {
        profitability = profResp.data.profitability;
        isRentavel = profitability.isRentavel;
      }
    } catch (e) {
      console.warn(`[QUOTE-STATUS] Could not fetch profitability: ${e.message}`);
    }

    // 4. Determinar ação do botão
    let buttonAction, buttonLabel;

    if (!isConfirmed && isRentavel) {
      buttonAction = "CONFIRM_QUOTE";
      buttonLabel = "Confirmar Orçamento";
    } else if (!isConfirmed && !isRentavel) {
      buttonAction = "NEEDS_APPROVAL";
      buttonLabel = "Aguardando Aprovação";
    } else if (isConfirmed) {
      buttonAction = "GENERATE_PDF";
      buttonLabel = "Gerar PDF";
    } else {
      buttonAction = "VIEW_QUOTE";
      buttonLabel = "Ver Orçamento";
    }

    res.json({
      success: true,
      status: {
        dealId,
        dealname,
        hasQuote: true,
        nunota: Number(nunota),
        statusNota,
        isConfirmed,
        vlrNota,
        profitability,
        isRentavel,
        buttonAction,
        buttonLabel
      }
    });

  } catch (error) {
    console.error(`[QUOTE-STATUS ERROR] ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// --- QUOTE CONFIRMATION ENDPOINT ---
/**
 * POST /hubspot/confirm-quote
 * Confirma um orçamento no Sankhya após validar rentabilidade
 */
app.post("/hubspot/confirm-quote", async (req, res) => {
  const { dealId, nunota, forceConfirm } = req.body;

  if (!dealId || !nunota) {
    return res.status(400).json({
      success: false,
      error: "dealId e nunota são obrigatórios"
    });
  }

  try {
    console.log(`[CONFIRM-QUOTE] Confirming NUNOTA ${nunota} for Deal ${dealId}...`);

    // 1. Verificar rentabilidade
    const profResp = await axios.get(
      `http://localhost:${PORT}/sankhya/check-profitability/${nunota}`
    );

    const profitability = profResp.data?.profitability;

    if (!profitability) {
      return res.status(400).json({
        success: false,
        error: "Não foi possível verificar rentabilidade"
      });
    }

    // Se não for rentável e não forçar confirmação, bloquear
    if (!profitability.isRentavel && !forceConfirm) {
      return res.status(400).json({
        success: false,
        error: "Orçamento não é rentável (lucro negativo)",
        profitability,
        requiresApproval: true
      });
    }

    // 2. Confirmar nota no Sankhya
    // Usando o serviço CACSP.confirmarNota ou alterando STATUSNOTA diretamente
    const token = await getAccessToken();

    // Método: Atualizar STATUSNOTA para 'L' (Liberada)
    const updateSql = `UPDATE TGFCAB SET STATUSNOTA = 'L' WHERE NUNOTA = ${nunota} AND STATUSNOTA = 'P'`;

    const updateResp = await axios.post(
      `${baseUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`,
      {
        serviceName: "DbExplorerSP.executeQuery",
        requestBody: {
          sql: updateSql
        }
      },
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`[CONFIRM-QUOTE] NUNOTA ${nunota} confirmed successfully`);

    // 3. Gerar PDF automaticamente
    let pdfResult = null;
    try {
      console.log(`[CONFIRM-QUOTE] Generating PDF for NUNOTA ${nunota}...`);
      const pdfData = await generateSankhyaPDF(nunota);

      console.log(`[CONFIRM-QUOTE] Uploading PDF to HubSpot...`);
      const { fileId, url } = await uploadPDFToHubSpot(pdfData.fileName, pdfData.base64);

      console.log(`[CONFIRM-QUOTE] Attaching PDF to Deal ${dealId}...`);
      await createNoteWithPDFAttachment(dealId, fileId, nunota);

      pdfResult = { success: true, fileId, url };
      console.log(`[CONFIRM-QUOTE] ✅ PDF attached successfully!`);
    } catch (pdfErr) {
      console.warn(`[CONFIRM-QUOTE] ⚠️ PDF generation failed: ${pdfErr.message}`);
      pdfResult = { success: false, error: pdfErr.message };
    }

    res.json({
      success: true,
      nunota,
      dealId,
      confirmed: true,
      profitability,
      pdfResult,
      message: `Orçamento ${nunota} confirmado com sucesso!${pdfResult?.success ? ' PDF anexado ao Deal.' : ''}`
    });

  } catch (error) {
    console.error(`[CONFIRM-QUOTE ERROR] ${error.message}`);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// --- NEW PDF & HUBSPOT ATTACHMENT FUNCTIONS ---

/**
 * Gera um PDF no Sankhya para uma NUNOTA específica
 */
async function generateSankhyaPDF(nunota) {
  const token = await getAccessToken();
  // Usar mgecom gate (mesmo do incluirNota) e remover mgeSession da URL
  const url = `${baseUrl}/gateway/v1/mgecom/service.sbr?serviceName=ImpressaoNotasSP.imprimeDocumentos&outputType=json`;

  /* 
    Payload identificado via HAR do Sankhya Web
    1. imprimeDocumentos: Gera o relatório e retorna status 1
    2. getDocumentData: Retorna o PDF em Base64
  */
  const fileName = `${nunota}_Orcamento`;
  const payload = {
    requestBody: {
      notas: {
        pedidoWeb: false,
        portalCaixa: false,
        gerarpdf: true,
        nota: [
          {
            nuNota: Number(nunota),
            tipoImp: 1,
            impressaoDanfeSimplicado: false,
            fileName: fileName
          }
        ]
      }
    }
  };

  console.log(`[PDF] 1. Solicitando Impressão para NUNOTA ${nunota}...`);
  const resp1 = await axios.post(url, payload, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 30000
  });

  if (resp1.data.status !== '1') {
    throw new Error(`Erro ao gerar PDF (Status ${resp1.data.status}): ${resp1.data.statusMessage || JSON.stringify(resp1.data)}`);
  }

  // Passo 2: Buscar os dados do documento (Base64)
  console.log(`[PDF] 2. Buscando dados do PDF...`);
  const urlData = `${baseUrl}/gateway/v1/mgecom/service.sbr?serviceName=ImpressaoNotasSP.getDocumentData&outputType=json`;

  const payloadData = {
    requestBody: {
      params: {
        NUNOTA: Number(nunota),
        FILENAME: fileName
      }
    }
  };

  const respData = await axios.post(urlData, payloadData, {
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    timeout: 30000
  });

  const pdfBase64 = respData.data?.responseBody?.PDF;

  if (!pdfBase64) {
    throw new Error('PDF não retornado em getDocumentData');
  }

  // Retornar objeto com base64 (limpo se tiver prefixo data:application/pdf;base64,)
  // Sankhya retorna algo como: "data:application/pdf;base64,JVBERi..."
  const base64Clean = pdfBase64.replace(/^data:.+;base64,/, '');

  return {
    success: true,
    fileName: `${fileName}.pdf`,
    base64: base64Clean
  };
}

/**
 * Upload de PDF para o HubSpot Files API
 */
async function uploadPDFToHubSpot(fileName, base64Data) {
  const hubspotToken = requireEnv('HUBSPOT_ACCESS_TOKEN');
  const buffer = Buffer.from(base64Data, 'base64');

  // HubSpot Files API requer multipart/form-data
  const FormData = (await import('form-data')).default;
  const form = new FormData();

  form.append('file', buffer, {
    filename: fileName,
    contentType: 'application/pdf'
  });

  form.append('options', JSON.stringify({
    access: 'PRIVATE',
    overwrite: false
  }));

  form.append('folderPath', '/Orcamentos');

  console.log(`[HUBSPOT] Uploading PDF: ${fileName}...`);

  const response = await axios.post(
    'https://api.hubapi.com/files/v3/files',
    form,
    {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${hubspotToken}`
      },
      maxContentLength: Infinity,
      maxBodyLength: Infinity
    }
  );

  console.log(`[HUBSPOT] Upload concluído. File ID: ${response.data.id}`);

  return {
    fileId: response.data.id,
    url: response.data.url
  };
}

/**
 * Cria uma nota no HubSpot com o PDF anexado e associa ao Deal
 */
async function createNoteWithPDFAttachment(dealId, fileId, nunota) {
  const hubspotToken = requireEnv('HUBSPOT_ACCESS_TOKEN');

  const payload = {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: `Orçamento Sankhya #${nunota} anexado automaticamente.`,
      hs_attachment_ids: fileId.toString()
    },
    associations: [
      {
        to: { id: dealId },
        types: [{
          associationCategory: 'HUBSPOT_DEFINED',
          associationTypeId: 214 // Note to Deal
        }]
      }
    ]
  };

  console.log(`[HUBSPOT] Criando nota com anexo no Deal ${dealId}...`);

  const response = await axios.post(
    'https://api.hubapi.com/crm/v3/objects/notes',
    payload,
    {
      headers: {
        'Authorization': `Bearer ${hubspotToken}`,
        'Content-Type': 'application/json'
      }
    }
  );

  console.log(`[HUBSPOT] Nota criada com sucesso. Note ID: ${response.data.id}`);

  return response.data.id;
}


/**
 * Gera PDF de um orçamento Sankhya (para testes)
 */
app.get("/sankhya/generate-pdf/:nunota", async (req, res) => {
  try {
    const { nunota } = req.params;
    const result = await generateSankhyaPDF(nunota);

    // Não retornar o base64 inteiro no log/response para não travar
    res.json({
      success: true,
      fileName: result.fileName,
      base64Length: result.base64 ? result.base64.length : 0,
      preview: result.base64 ? result.base64.substring(0, 50) + '...' : null
    });
  } catch (error) {
    console.error(`[PDF Generation Error] ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * Fluxo completo: Gera PDF, faz upload no HubSpot e anexa ao Deal
 */
app.post("/sankhya/pdf/attach", async (req, res) => {
  try {
    const { dealId, nunota } = req.body;

    console.log(`\n[E2E TEST] Iniciando fluxo completo para Deal ${dealId}, NUNOTA ${nunota}`);

    // 1. Gerar PDF do Sankhya
    console.log(`[E2E TEST] Passo 1/3: Gerando PDF...`);
    const pdfData = await generateSankhyaPDF(nunota);

    // 2. Upload para HubSpot
    console.log(`[E2E TEST] Passo 2/3: Fazer upload no HubSpot...`);
    const { fileId, url } = await uploadPDFToHubSpot(pdfData.fileName, pdfData.base64);

    // 3. Criar nota com anexo associada ao Deal
    console.log(`[E2E TEST] Passo 3/3: Criando nota no Deal...`);
    const noteId = await createNoteWithPDFAttachment(dealId, fileId, nunota);

    console.log(`[E2E TEST] ✅ Fluxo concluído com sucesso!\n`);

    res.json({
      success: true,
      dealId,
      nunota,
      fileId,
      fileUrl: url,
      noteId,
      message: `PDF do orçamento ${nunota} anexado ao Deal ${dealId} com sucesso!`
    });
  } catch (error) {
    console.error(`[E2E TEST ERROR] ${error.message}`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(Number(process.env.PORT || 3000), () => {
  console.log(`🚀 API: http://localhost:${process.env.PORT || 3000}`);
  console.log("--- SYSTEM READY (v1.3 - Product Sync Support) ---");
});
