import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import bodyParser from "body-parser";
import { getAccessToken, invalidateToken } from "./sankhyaAuth.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3005;

app.use(bodyParser.json());

// Mapeamento de Status do HubSpot (Internal ID -> Label AmigÃ¡vel)
const DEAL_STAGE_MAP = {
  "appointmentscheduled": "Agendado / NegociaÃ§Ã£o",
  "decisionmakerboughtin": "Aguardando LiberaÃ§Ã£o",
  "contractsent": "Aguardando Assinatura",
  "closedwon": "Fechado Ganho",
  "closedlost": "Perdido",
  "presentationscheduled": "Pedido Gerado"
};

// CONFIGURAÃ‡Ã•ES DE ESTÃGIOS (HUBSPOT INTERNAL IDS)
const STAGE_AGUARDANDO_LIBERACAO = "decisionmakerboughtin"; // Tomador de decisÃ£o envolvido
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

// --- Helper: Fix Encoding (ISO-8859-1 -> UTF-8) ---
function fixEncoding(str) {
  if (!str) return str;
  try {
    // Detect double-encoded UTF-8 (common in legacy aggregators)
    if (str.match(/[ÃÂ][\x80-\xBF]/)) {
      return Buffer.from(str, 'binary').toString('utf8');
    }
  } catch (e) { return str; }
  return str;
}

function toInt(name, value) {
  if (value === null || value === undefined || value === "" || value === "undefined") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${name} invÃ¡lido (precisa ser inteiro): ${value}`);
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
  const hsUrl = `https://api.hubspot.com/crm/v3/objects/deals/${objectId}?state=true&associations=companies,contacts,quotes,line_items&properties=codemp_sankhya,sankhya_codemp,amount,codigo_vendedor_sankhya,hubspot_owner_id,ordem_de_compra_anexo,dealstage,orcamento_sankhya`;
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

  // Debug das associações para entender o que o HubSpot está retornando
  const assocKeys = deal.associations ? Object.keys(deal.associations) : [];
  console.log(`[DISCOVERY] Deal associations keys: ${assocKeys.join(', ')}`);

  // HubSpot can return 'line_items' or 'line items' (with space) depending on the API version/context
  const rawLineItems = deal.associations?.line_items?.results ||
    deal.associations?.['line items']?.results ||
    deal.associations?.lineitems?.results || [];

  const lineItemIds = rawLineItems.map(r => r.id);

  if (lineItemIds.length > 0) {
    // Fetch details in batches or parallel
    await Promise.all(lineItemIds.map(async (id) => {
      try {
        const itemUrl = `https://api.hubspot.com/crm/v3/objects/line_items/${id}?properties=sankhya_codprod,codprod,hs_product_id,quantity,name,price,hs_sku,sankhya_controle,controle`;
        const resp = await axios.get(itemUrl, { headers: { Authorization: `Bearer ${token}` } });
        const lp = resp.data.properties;


        // Tentamos pegar o código do produto de múltiplas propriedades comuns
        let codProd = lp.sankhya_codprod || lp.codprod || lp.hs_sku;

        if (!codProd && lp.hs_product_id) {
          const pResp = await axios.get(`https://api.hubspot.com/crm/v3/objects/products/${lp.hs_product_id}?properties=sankhya_codprod,codprod,hs_sku`, { headers: { Authorization: `Bearer ${token}` } });
          const pp = pResp.data.properties;
          codProd = pp.sankhya_codprod || pp.codprod || pp.hs_sku;
        }

        if (codProd) {
          items.push({
            id,
            name: fixEncoding(lp.name) || `Item ${id}`,
            codProd: toInt("codProd", codProd),
            quantity: Number(lp.quantity || 0),
            quantity: Number(lp.quantity || 0),
            currentPrice: lp.price ? Number(lp.price) : null,
            sankhyaControle: lp.sankhya_controle || lp.controle || null // Persist Lote
          });
        } else {
          console.warn(`[DISCOVERY] Item ${id} não possui CODPROD definido (sankhya_codprod, codprod ou hs_sku).`);
        }
      } catch (e) {
        console.error(`[DISCOVERY] Erro ao buscar detalhes do item ${id}:`, e.message);
      }
    }));
  }
  console.log(`[DISCOVERY] Items fully processed: ${items.length}`);

  // 5. Quote Discovery (LÃ³gica: Ãšltima modificada, nÃ£o expirada)
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

  // 4.1. Enrich Items with Sankhya Data (CONTROLE, PERCLUCRO)
  if (props.orcamento_sankhya && items.length > 0) {
    try {
      const nunotaEnrich = props.orcamento_sankhya;
      console.log(`[DISCOVERY] Enriching items for NUNOTA ${nunotaEnrich}...`);
      const sqlItens = `SELECT CODPROD, CONTROLE, PERCLUCRO FROM TGFITE WHERE NUNOTA = ${nunotaEnrich}`;
      const tokenSankhya = await getAccessToken();
      const queryResp = await axios.post(`${baseUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`, {
        serviceName: "DbExplorerSP.executeQuery",
        requestBody: { sql: sqlItens }
      }, { headers: { Authorization: `Bearer ${tokenSankhya}` } });

      const rowData = queryResp.data?.responseBody?.rows;
      if (rowData && rowData.length > 0) {
        // Map rows for faster lookup
        const sankhyaMap = {};
        rowData.forEach(row => {
          const cp = row[0]; // CODPROD
          sankhyaMap[cp] = {
            controle: row[1],
            profitability: parseFloat(String(row[2]).replace(',', '.')) || 0
          };
        });

        // Update items
        items.forEach(item => {
          if (sankhyaMap[item.codProd]) {
            item.sankhyaControle = sankhyaMap[item.codProd].controle;
            item.sankhyaProfitability = sankhyaMap[item.codProd].profitability;
          }
        });
      }
    } catch (e) {
      console.warn("[DISCOVERY] Erro ao enriquecer itens via TGFITE:", e.message);
    }
  }

  console.log(`[DISCOVERY] Raw Data: Deal=${objectId}, Emp=${codEmp}, Parc=${codParcRaw}, Items=${items.length}, QuoteAssoc=${activeQuote?.id || 'Nenhuma'}, PropOrcamento=${props.orcamento_sankhya || 'Nenhum'}`);
  // LÓGICA DE VÍNCULO: Priorizar orcamento_sankhya (link definitivo)
  // Se não houver, tentar nunota (legado/temporário)
  const orcamentoSankhya = toInt("orcamento_sankhya", props.orcamento_sankhya || props.sankhya_orcamento);
  const nunotaFound = toInt("nunota", props.nunota);

  const nunota = orcamentoSankhya || nunotaFound;


  console.log(`[DISCOVERY] Final Context: CodParc=${codParcRaw}, CodEmp=${codEmp}, Items=${items.length}, Link=${nunota} (Src: ${orcamentoSankhya ? 'Orcamento' : 'NuNota'})`);

  // FIX ENCODING: Propriedades de texto que podem vir corrompidas do HubSpot/IntegraÃ§Ã£o
  if (props.fase_negociacao) props.fase_negociacao = fixEncoding(props.fase_negociacao);
  if (props.dealstage) props.dealstage = fixEncoding(props.dealstage);

  return {
    objectId,
    codParc: toInt("codParc", codParcRaw),
    codEmp,
    codVendedor,
    items,
    activeQuote,
    nunota: props.orcamento_sankhya,
    props
  };
}

const baseUrl = requireEnv("SANKHYA_BASE_URL");
const GATEWAY_EXECUTE_QUERY_URL = `${baseUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`;

// --- CACHE (Simple In-Memory) ---
const STK_CACHE = new Map();
const CACHE_TTL_MS = 5000;

async function postGatewayWithRetry(body) {
  let token = await getAccessToken();
  try {
    const response = await axios.post(GATEWAY_EXECUTE_QUERY_URL, body, { headers: { Authorization: `Bearer ${token}` }, timeout: 20000 });
    if (response.data && response.data.status === "3") {
      invalidateToken();
      token = await getAccessToken(); // O lock em getAccessToken silencia os redundantes
      console.log("[AUTH] SessÃ£o renovada com sucesso.");
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

// Optimized: Fetch all 3 prices in one query
async function consultaTodosPrecos(codProd, codParc, codEmp) {
  const sql = `
    SELECT 
      AD_PRECO_TRADIPAR(${codProd}, ${codParc}, ${codEmp}, 1) AS PV1,
      AD_PRECO_TRADIPAR(${codProd}, ${codParc}, ${codEmp}, 2) AS PV2,
      AD_PRECO_TRADIPAR(${codProd}, ${codParc}, ${codEmp}, 3) AS PV3
    FROM DUAL
  `;
  const response = await postGatewayWithRetry({ requestBody: { sql } });

  // Custom parsing because it returns one row with 3 columns
  const rb = response.data?.responseBody;
  let row = null;
  if (rb?.rows && rb.rows.length) row = rb.rows[0];
  else if (rb?.resultSet?.rows && rb.resultSet.rows.length) {
    // Helper to extract value from object format { $: "value" }
    const r = rb.resultSet.rows[0];
    row = [r.PV1?.$ || r.PV1, r.PV2?.$ || r.PV2, r.PV3?.$ || r.PV3];
  }

  if (row) {
    return {
      pv1: Number(row[0] || 0),
      pv2: Number(row[1] || 0),
      pv3: Number(row[2] || 0)
    };
  }
  return { pv1: 0, pv2: 0, pv3: 0 };
}

async function consultaEstoque(codProd, codEmp) {
  const cacheKey = `${codProd}-${codEmp}`;
  if (STK_CACHE.has(cacheKey)) {
    const { val, ts } = STK_CACHE.get(cacheKey);
    if (Date.now() - ts < CACHE_TTL_MS) return val;
  }

  try {
    const sql = `SELECT SUM(ESTOQUE - RESERVADO) AS DISPONIVEL FROM TGFEST WHERE CODPROD = ${codProd} AND CODEMP = ${codEmp}`;
    // console.log(`[STK] SQL: ${sql}`); // VERBOSE
    const response = await postGatewayWithRetry({ requestBody: { sql } });

    // Safer parsing
    let val = 0;
    try {
      val = parseDbExplorerFirstValue(response.data) || 0;
    } catch (e) { console.warn(`[STK] Parse error for ${codProd}:`, e.message); }

    STK_CACHE.set(cacheKey, { val, ts: Date.now() });
    return val;

  } catch (e) {
    console.error(`[STK] Error querying stock for ${codProd}:`, e.message);
    return 0; // Fallback to 0 instead of crash
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
      error: "codProds deve ser um array de cÃ³digos de produto"
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

    // Helper for Concurrency Limiting
    const processInChunks = async (items, chunkSize, processFn) => {
      const results = [];
      for (let i = 0; i < items.length; i += chunkSize) {
        const chunk = items.slice(i, i + chunkSize);
        // Process chunk in parallel
        const chunkResults = await Promise.all(chunk.map(processFn));
        results.push(...chunkResults);
      }
      return results;
    };

    // Optimization: Process in chunks of 5 items to avoid connection saturation
    const processedItems = await processInChunks(ctx.items, 5, async (item) => {
      // Optimized: Fetch prices in 1 call instead of 3
      const [prices, estoque, estoqueOutraEmpresa] = await Promise.all([
        consultaTodosPrecos(item.codProd, ctx.codParc, ctx.codEmp),
        consultaEstoque(item.codProd, ctx.codEmp),
        otherCodEmp ? consultaEstoque(item.codProd, otherCodEmp) : Promise.resolve(0),
      ]);

      return {
        ...item,
        prices: prices, // Already { pv1, pv2, pv3 }
        stock: estoque,
        stockContext: (otherCodEmp && estoqueOutraEmpresa > 0)
          ? `${empresaNome?.substring(0, 10) || 'A'}: ${estoque} | ${otherCompany?.nomeFantasia?.substring(0, 10) || 'B'}: ${estoqueOutraEmpresa}`
          : `Estoque SNK: ${estoque}`,
        stockOther: estoqueOutraEmpresa,
        stockOtherContext: otherCompany?.nomeFantasia || otherCompany?.razaoSocial || "Outra Unidade"
      };
    });

    // Verificar corte global (se algum item nÃ£o tem estoque)
    const hasStockCut = processedItems.some(i => i.stock < i.quantity);
    if (hasStockCut) console.warn(`[CORTE] Deal ${objectId} tem itens com falta de estoque.`);

    return res.json({
      status: "SUCCESS",
      items: processedItems,
      currentAmount: ctx.props.amount,
      currentStage: ctx.props.dealstage,
      stageLabel: DEAL_STAGE_MAP[ctx.props.dealstage] || ctx.props.dealstage, // Status AmigÃ¡vel
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
        warningMsg = "PreÃ§o < PV3. Enviado p/ aprovaÃ§Ã£o.";
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
      return res.status(400).json({ error: "PO nÃ£o anexado." });
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

// --- IMPORTAÃ‡ÃƒO SANKHYA -> HUBSPOT (Enterprise Grade) ---

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
  console.log("[IMPORT] ========== INÃCIO DA IMPORTAÃ‡ÃƒO ==========");
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  const { since, limit, offset = 0 } = req.body; // since = ISO date, offset for pagination

  try {
    // 1. Query Sankhya - TODOS os campos disponÃ­veis (baseado em GerarJsonParceiro.java)
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

    // Default limit de 1000 se nÃ£o especificado (evita timeout em full syncs muito grandes)
    const effectiveLimit = limit !== undefined ? limit : 1000;

    // Pagination: OFFSET + FETCH (Oracle 12c+)
    if (offset > 0) {
      query += ` OFFSET ${offset} ROWS`;
    }
    if (effectiveLimit > 0) {
      query += ` FETCH FIRST ${effectiveLimit} ROWS ONLY`;
    }

    console.log(`[IMPORT] Limit efetivo: ${effectiveLimit === 1000 ? '1000 (padrÃ£o)' : effectiveLimit}`);

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

      // === DEDUPLICAÃ‡ÃƒO COM HIERARQUIA ===
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

      // === MAPEAR TODAS AS PROPRIEDADES DISPONÃVEIS ===
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
        tipo_de_pessoa: parc.TIPPESSOA === 'J' ? 'JurÃ­dica' : 'FÃ­sica'
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
// DEBUG: Endpoint para ver colunas disponÃ­veis
app.get("/sankhya/debug/products", async (req, res) => {
  try {
    const result = await executeSankhyaQuery("SELECT * FROM TGFPRO WHERE ROWNUM <= 1");
    res.json(result);
  } catch (error) {
    res.status(500).send(error.message);
  }
});
// DEBUG: Endpoint para ver tabelas de preÃ§o
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
  console.log("[PRODUCT IMPORT] ========== INÃCIO DA IMPORTAÃ‡ÃƒO ==========");
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

      // LÃ³gica de Prioridade de PreÃ§o Global (Para o campo price padrÃ£o)
      const priceDefault = prod.PRECO_MAX_TOP10 || prod.PRECO_TAB37 || prod.PRECO_TAB35 || undefined;

      // ConversÃ£o de Booleanos 'S'/'N' para string "true"/"false" (para Checkboxes/Booleans no HubSpot)
      const boolStr = (val) => (val === 'S' || val === 's') ? "true" : "false";

      // Mapeamento de CÃ³digos de IPI para as OpÃ§Ãµes do HubSpot (Internal Names/Values)
      const mapIpiEntrada = (val) => {
        const s = val ? String(val).trim().padStart(2, '0') : "";
        if (s === '49') return '49-Outras Entradas';
        if (s === '03') return '03-Entrada NÃ£o Tributada';
        if (s === '-1') return '(-1)-NÃ£o sujeita ao IPI';
        return val ? String(val) : undefined;
      };
      const mapIpiSaida = (val) => {
        const s = val ? String(val).trim().padStart(2, '0') : "";
        if (s === '99') return '99-Outras SaÃ­das';
        if (s === '53') return '53-SaÃ­da NÃ£o Tributada';
        if (s === '-1') return '(-1)-NÃ£o sujeita ao IPI';
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

        // --- TributaÃ§Ã£o Booleans (true/false) ---
        tem_ipi_na_venda: boolStr(prod.TEMIPIVENDA),
        tem_ipi_na_compra: boolStr(prod.TEMIPICOMPRA),
        calcular_icms: boolStr(prod.TEMICMS),
        tem_inss: boolStr(prod.TEMINSS),
        calcular_comissao: boolStr(prod.TEMCOMISSAO),
        calcular_difal: boolStr(prod.CALCDIFAL),
        atualizar_ciap: boolStr(prod.TEMCIAP),

        // --- ClassificaÃ§Ã£o ---
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

        // --- DimensÃµes e Pesos ---
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

      // DEBUG: Logar o primeiro produto do batch para conferÃªncia
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
// ðŸ” DISCOVERY ENDPOINT: Sankhya Quote Tables
// ============================================================
app.get("/sankhya/discovery/quote-tables", async (req, res) => {
  try {
    const token = await getAccessToken();

    const queries = [
      {
        name: "TOPs DisponÃ­veis (Tipos de OperaÃ§Ã£o)",
        sql: `SELECT CODTIPOPER, DESCROPER, ATIVO, TIPATUALESTOQUE, ATUALFIN, BONIFICACAO 
              FROM TGFTOP 
              WHERE ATIVO = 'S' 
              ORDER BY CODTIPOPER`
      },
      {
        name: "Colunas ObrigatÃ³rias - TGFCAB",
        sql: `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_DEFAULT
              FROM USER_TAB_COLUMNS 
              WHERE TABLE_NAME = 'TGFCAB' 
              AND NULLABLE = 'N'
              ORDER BY COLUMN_ID`
      },
      {
        name: "Colunas ObrigatÃ³rias - TGFITE",
        sql: `SELECT COLUMN_NAME, DATA_TYPE, NULLABLE, DATA_DEFAULT
              FROM USER_TAB_COLUMNS 
              WHERE TABLE_NAME = 'TGFITE' 
              AND NULLABLE = 'N'
              ORDER BY COLUMN_ID`
      },
      {
        name: "Sample de TGFCAB (TOP 999 - OrÃ§amento)",
        sql: `SELECT NUNOTA, CODPARC, CODTIPOPER, DTNEG, CODVEND, VLRNOTA, STATUSNOTA, CODCENCUS
              FROM TGFCAB 
              WHERE CODTIPOPER = 999 
              AND ROWNUM <= 5
              ORDER BY NUNOTA DESC`
      },
      {
        name: "Centros de Resultado DisponÃ­veis",
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
        name: "Naturezas DisponÃ­veis",
        sql: `SELECT CODNAT, DESCRNAT FROM TGFNAT WHERE ATIVO = 'S' AND ROWNUM <= 20 ORDER BY CODNAT`
      },
      {
        name: "CODTIPVENDA Mais Usados (TOP 999)",
        sql: `SELECT CODTIPVENDA, COUNT(*) AS QTD FROM TGFCAB WHERE CODTIPOPER = 999 GROUP BY CODTIPVENDA ORDER BY QTD DESC FETCH FIRST 10 ROWS ONLY`
      },
      {
        name: "Modelos de ImpressÃ£o (TOP 999)",
        sql: `SELECT CODTIPOPER, CODREL, DESCRREL FROM TGFTPR WHERE CODTIPOPER = 999`
      },
      {
        name: "Mapeamento para TOP 999 (TGFMODTOP)",
        sql: `SELECT * FROM TGFMODTOP WHERE CODTIPOPER = 999`
      },
      {
        name: "Todos os RelatÃ³rios (TSIREL) - Busca por Nome",
        sql: `SELECT CODREL, NOMEREL, DESCRREL FROM TSIREL WHERE NOMEREL LIKE '%ORC%' OR NOMEREL LIKE '%PED%'`
      },
      {
        name: "RelatÃ³rios Formatados (TFPMOD) - Busca por Nome",
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
// ðŸ” DISCOVERY: Test Available Sankhya Services
// ============================================================
app.get("/sankhya/discovery/services", async (req, res) => {
  try {
    const token = await getAccessToken();

    // Lista de serviÃ§os candidatos para criar notas/orÃ§amentos
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
// ðŸ” DEBUG ENDPOINT: Inspect Deal Structure
// ============================================================
app.get("/hubspot/debug-deal/:dealId", async (req, res) => {
  try {
    const { dealId } = req.params;
    const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");

    // Buscar Deal com todas as associaÃ§Ãµes possÃ­veis
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
// ðŸ“ CREATE QUOTE ENDPOINT: HubSpot Deal â†’ Sankhya OrÃ§amento
// ============================================================
app.post("/hubspot/create-quote", async (req, res) => {
  try {
    const { dealId } = req.body;

    if (!dealId) {
      return res.status(400).json({ success: false, error: "dealId Ã© obrigatÃ³rio" });
    }

    const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");

    // 1. Buscar dados do Deal (apenas propriedades)
    console.log(`[QUOTE] Buscando Deal ${dealId}...`);
    const dealUrl = `https://api.hubspot.com/crm/v3/objects/deals/${dealId}?properties=codemp_sankhya,sankhya_codemp,amount,dealname,closedate,tipo_negociacao,dealtype,natureza_id,hubspot_owner_id,observacao,observacao_frete,observacao_interna`;
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
    const codTipOper = toInt("codTipOper", codTipOperRaw) || 999; // Fallback 999 = OrÃ§amento

    const codNatRaw = props.natureza_id;
    const codNat = toInt("codNat", codNatRaw) || 101001; // Fallback para natureza padrÃ£o

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
        error: "Deal nÃ£o possui Company associada"
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
        error: "Company nÃ£o possui cÃ³digo Sankhya (sankhya_codparc ou codparc)"
      });
    }

    // 4. Buscar Line Items (mÃ©todo correto via associations API)
    console.log(`[QUOTE] Buscando Line Items do Deal ${dealId}...`);
    const lineItemsAssocUrl = `https://api.hubspot.com/crm/v3/objects/deals/${dealId}/associations/line_items`;
    const lineItemsAssocResp = await axios.get(lineItemsAssocUrl, {
      headers: { Authorization: `Bearer ${hubspotToken}` }
    });

    const lineItemIds = lineItemsAssocResp.data.results?.map(r => r.id) || [];

    if (lineItemIds.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Deal nÃ£o possui Line Items associados"
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

    // 5. Mapear produtos HubSpot â†’ Sankhya
    const productItems = [];
    for (const item of lineItems) {
      const hsProductId = item.properties.hs_product_id;
      const quantity = parseFloat(item.properties.quantity) || 0; // Allow 0 quantities
      const price = parseFloat(item.properties.price) || 0;
      let sku = item.properties.hs_sku;

      // Se nÃ£o veio SKU no Line Item, tenta buscar no objeto Product (se houver ID)
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

      // Sanitizar SKU: extrair apenas a parte numÃ©rica (ex: "72#2" -> "72")
      if (sku) {
        sku = String(sku).split('#')[0].trim();
      }

      const codProd = toInt("codProd", sku);

      if (!codProd) {
        console.warn(`[QUOTE] Line Item ${item.id} (${item.properties.name}) nÃ£o possui SKU/CODPROD vÃ¡lido: ${sku}`);
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
        error: "Nenhum produto vÃ¡lido encontrado nos Line Items"
      });
    }

    // 6. Calcular totais
    const vlrNota = productItems.reduce((sum, item) => sum + item.vlrTot, 0);
    const dtneg = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const dtNegFormatted = new Date().toLocaleDateString('pt-BR'); // DD/MM/YYYY

    // 7. Criar orÃ§amento usando CRUD Service do Sankhya
    console.log(`[QUOTE] Criando orÃ§amento via CRUD Service para CODPARC=${codParc}, CODEMP=${codEmp}, VLRNOTA=${vlrNota}...`);

    // Estrutura de dados para o orÃ§amento (TGFCAB + TGFITE)
    const orderData = {
      cabecalho: {
        CODEMP: codEmp,
        CODPARC: codParc,
        CODTIPOPER: codTipOper, // Tipo de OperaÃ§Ã£o (999=OrÃ§amento)
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

    // Usar o serviÃ§o de inclusÃ£o de nota do Sankhya (mÃ³dulo MGECOM)
    const INCLUIR_NOTA_URL = `${baseUrl}/gateway/v1/mgecom/service.sbr?serviceName=CACSP.incluirNota&outputType=json`;

    // Estrutura correta do payload para CACSP.incluirNota
    const notaBody = {
      requestBody: {
        nota: {
          cabecalho: {
            NUNOTA: { "$": "" },  // Vazio para criar novo
            CODEMP: { "$": codEmp },
            CODPARC: { "$": codParc },
            CODTIPOPER: { "$": codTipOper },      // Tipo de OperaÃ§Ã£o: da propriedade dealtype
            CODEMPNEGOC: { "$": codEmp },
            CODVEND: { "$": 0 },                    // TODO: mapear hubspot_owner_id
            TIPMOV: { "$": "P" },
            DTNEG: { "$": dtNegFormatted },
            CODCENCUS: { "$": 101002 },             // Centro de Custo: FIXO (COMERCIAL)
            CODNAT: { "$": codNat },                // Natureza: da propriedade natureza_id
            CODTIPVENDA: { "$": codTipVenda },       // Tipo de NegociaÃ§Ã£o: da propriedade tipo_negociacao
            OBSERVACAO: { "$": props.observacao || "" },
            AD_OBSFRETE: { "$": props.observacao_frete || "" },
            AD_OBSERVACAOINTERNA: { "$": props.observacao_interna || "" }
          },
          itens: {
            item: productItems.map((item, index) => ({
              NUNOTA: { "$": "" },
              SEQUENCIA: { "$": index + 1 },
              CODEMP: { "$": codEmp },
              CODPROD: { "$": item.codProd },
              CODVOL: { "$": item.codVol },
              CODLOCALORIG: { "$": 0 },   // Local de Origem: padrÃ£o
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
      // Tentar buscar o Ãºltimo NUNOTA criado para o parceiro
      const getNunotaSql = `SELECT MAX(NUNOTA) AS NUNOTA FROM TGFCAB WHERE CODPARC = ${codParc} AND CODTIPOPER = 999`;
      const nunotaResp = await postGatewayWithRetry({ requestBody: { sql: getNunotaSql } });
      const fallbackNunota = nunotaResp.data?.responseBody?.rows?.[0]?.[0];

      if (!fallbackNunota) {
        console.error(`[QUOTE] Falha ao criar orÃ§amento. Resposta completa: ${JSON.stringify(notaResp.data)}`);
        throw new Error(`Falha ao criar orÃ§amento no Sankhya. Verifique os logs.`);
      }

      console.log(`[QUOTE] NUNOTA obtido via fallback: ${fallbackNunota}`);
      return res.json({
        success: true,
        nunota: fallbackNunota,
        codEmp,
        codParc,
        vlrNota,
        itemCount: productItems.length,
        message: `OrÃ§amento ${fallbackNunota} criado com sucesso! (fallback)`
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
            orcamento_sankhya: nunota.toString() // Propriedade customizada no HubSpot
          }
        },
        { headers: { Authorization: `Bearer ${hubspotToken}` } }
      );
      hubspotUpdateSuccess = true;
      console.log(`[QUOTE] Deal ${dealId} atualizado com NUNOTA ${nunota}`);
    } catch (hsError) {
      console.warn(`[QUOTE] Falha ao atualizar Deal no HubSpot (propriedade pode nÃ£o existir): ${hsError.message}`);
      // NÃ£o falhar - o orÃ§amento foi criado com sucesso no Sankhya
    }

    // PDF sÃ³ serÃ¡ gerado apÃ³s confirmaÃ§Ã£o do orÃ§amento (quando houver rentabilidade e estoque)
    console.log(`[QUOTE] â„¹ï¸ PDF nÃ£o gerado - orÃ§amento precisa ser confirmado primeiro`);

    res.json({
      success: true,
      nunota,
      codEmp,
      codParc,
      vlrNota,
      itemCount: productItems.length,
      hubspotUpdated: hubspotUpdateSuccess,
      message: `OrÃ§amento ${nunota} criado com sucesso no Sankhya! Aguardando confirmaÃ§Ã£o para gerar PDF.`
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

// --- PROFITABILITY SHARED LOGIC ---
async function getProfitabilityInternal(nunota, codemp = null) {
  try {
    console.log(`[PROFITABILITY INTERNAL] Fetching profitability for NUNOTA ${nunota}, CODEMP ${codemp}...`);
    const token = await getAccessToken();
    const url = `${baseUrl}/gateway/v1/mge/service.sbr?serviceName=LiberacaoLimitesSP.getDadosRentabilidade&outputType=json`;

    const paramsObj = { nuNota: Number(nunota) };
    if (codemp) {
      paramsObj.CODEMP = Number(codemp);
    }

    const payload = {
      serviceName: "LiberacaoLimitesSP.getDadosRentabilidade",
      requestBody: {
        params: paramsObj
      }
    };

    console.log(`[PROFITABILITY] Calling Sankhya service with payload:`, JSON.stringify(payload));

    const resp = await axios.post(url, payload, {
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    console.log(`[PROFITABILITY] Raw response status: ${resp.status}`);
    console.log(`[PROFITABILITY] Full response data:`, JSON.stringify(resp.data));

    const data = resp.data?.responseBody;

    if (!data) {
      console.warn(`[PROFITABILITY] No responseBody found for NUNOTA ${nunota}`);
      console.warn(`[PROFITABILITY] Response keys:`, Object.keys(resp.data || {}));
      return { success: false, error: "Dados de rentabilidade nÃ£o encontrados no Sankhya" };
    }

    console.log(`[PROFITABILITY DEBUG] responseBody keys:`, Object.keys(data));

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
      qtdItens: parseInt(data.contItens) || 0
    };

    console.log(`[PROFITABILITY SUCCESS] NUNOTA ${nunota}: Lucro=${profitability.lucro}, RentÃ¡vel=${profitability.isRentavel}`);
    return { success: true, profitability };
  } catch (error) {
    console.error(`[PROFITABILITY INTERNAL ERROR] ${error.message}`);
    return { success: false, error: error.message };
  }
}

// --- PROFITABILITY CHECK ENDPOINT ---
/**
 * GET /sankhya/check-profitability/:nunota
 */
app.get("/sankhya/check-profitability/:nunota", async (req, res) => {
  const { nunota } = req.params;
  const result = await getProfitabilityInternal(nunota);
  if (result.success) {
    res.json(result);
  } else {
    res.status(500).json(result);
  }
});

// --- QUOTE STATUS CHECK ENDPOINT ---
/**
 * GET /hubspot/quote-status/:dealId
 * Retorna status do orÃ§amento de um Deal para controle de botÃµes dinÃ¢micos
 */
app.get("/hubspot/quote-status/:dealId", async (req, res) => {
  const { dealId } = req.params;

  try {
    console.log(`[QUOTE-STATUS] Checking quote status for Deal ${dealId}...`);

    const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");

    // 1. Buscar Deal no HubSpot
    const dealUrl =
      `https://api.hubspot.com/crm/v3/objects/deals/${dealId}?properties=orcamento_sankhya,dealname`;

    const dealResp = await axios.get(dealUrl, {
      headers: { Authorization: `Bearer ${process.env.HUBSPOT_ACCESS_TOKEN}` }
    });

    const nunota = dealResp.data.properties?.orcamento_sankhya;
    const dealname = dealResp.data.properties?.dealname;

    // Se nÃ£o tem NUNOTA, ainda nÃ£o tem orÃ§amento
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
          buttonLabel: "Criar OrÃ§amento"
        }
      });
    }

    // 2. Verificar se nota estÃ¡ confirmada no Sankhya
    const token = await getAccessToken();
    const notaStatusSql = `SELECT STATUSNOTA, STATUSNFE, VLRNOTA, CONFIRMADA, CODEMP FROM TGFCAB WHERE NUNOTA = ${nunota}`;
    const notaResp = await postGatewayWithRetry({ requestBody: { sql: notaStatusSql } });
    const notaRow = notaResp.data?.responseBody?.rows?.[0];

    const statusNota = notaRow?.[0] || "P";
    const vlrNota = parseFloat(notaRow?.[2]) || 0;
    const confirmada = notaRow?.[3] || "N";
    const codemp = notaRow?.[4];

    // Consideramos confirmado se STATUSNOTA nÃ£o for P OU se a coluna CONFIRMADA for 'S'
    const isConfirmed = statusNota !== "P" || confirmada === "S";

    // 3. Buscar rentabilidade
    let profitability = null;
    let isRentavel = false;
    let profitabilityError = null;

    try {
      const profResult = await getProfitabilityInternal(nunota, codemp);
      if (profResult.success) {
        profitability = profResult.profitability;
        isRentavel = profitability.isRentavel;
      } else {
        console.warn(`[QUOTE-STATUS] Could not fetch profitability: ${profResult.error}`);
        profitabilityError = profResult.error;
      }
    } catch (e) {
      console.warn(`[QUOTE-STATUS] Exception fetching profitability: ${e.message}`);
      profitabilityError = e.message;
    }

    // 4. Determinar aÃ§Ã£o do botÃ£o
    let buttonAction, buttonLabel;

    if (!isConfirmed && isRentavel) {
      buttonAction = "CONFIRM_QUOTE";
      buttonLabel = "Confirmar OrÃ§amento";
    } else if (!isConfirmed && !isRentavel) {
      buttonAction = "NEEDS_APPROVAL";
      buttonLabel = "Aguardando AprovaÃ§Ã£o";
    } else if (isConfirmed) {
      buttonAction = "GENERATE_PDF";
      buttonLabel = "Gerar PDF";
    } else {
      buttonAction = "VIEW_QUOTE";
      buttonLabel = "Ver OrÃ§amento";
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
        profitabilityError,
        isRentavel,
        recalc_needed: (profitability && profitability.lucro === 0 && profitability.qtdItens > 0),
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
 * Confirma um orÃ§amento no Sankhya apÃ³s validar rentabilidade
 */
app.post("/hubspot/confirm-quote", async (req, res) => {
  const { dealId, nunota, forceConfirm } = req.body;

  if (!dealId || !nunota) {
    return res.status(400).json({
      success: false,
      error: "dealId e nunota sÃ£o obrigatÃ³rios"
    });
  }

  try {
    console.log(`[CONFIRM-QUOTE] Confirming NUNOTA ${nunota} for Deal ${dealId}...`);

    // 1. Verificar rentabilidade
    const profResult = await getProfitabilityInternal(nunota);
    const profitability = profResult.profitability;

    if (!profitability) {
      return res.status(400).json({
        success: false,
        error: "NÃ£o foi possÃ­vel verificar rentabilidade"
      });
    }

    // Se nÃ£o for rentÃ¡vel e nÃ£o forÃ§ar confirmaÃ§Ã£o, bloquear
    if (!profitability.isRentavel && !forceConfirm) {
      return res.status(400).json({
        success: false,
        error: "OrÃ§amento nÃ£o Ã© rentÃ¡vel (lucro negativo)",
        profitability,
        requiresApproval: true
      });
    }

    // 2. Confirmar nota no Sankhya via SQL UPDATE
    const token = await getAccessToken();

    // SQL UPDATE Solution (Direct Database Update)
    // Why: ServiceController APIs not available in current Sankhya libraries
    // Trade-off: Doesn't trigger all business rules but updates status successfully
    console.log(`[CONFIRM-QUOTE] Using SQL UPDATE to confirm NUNOTA ${nunota}...`);

    const sqlQuery = `UPDATE TGFCAB SET STATUSNOTA = 'L' WHERE NUNOTA = ${nunota} AND STATUSNOTA = 'P'`;

    const confirmPayload = {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: {
        sql: sqlQuery
      }
    };

    const confirmResp = await axios.post(
      `${baseUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`,
      confirmPayload,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`[CONFIRM-QUOTE] SQL UPDATE response:`, JSON.stringify(confirmResp.data));

    // Check for success
    if (confirmResp.data.status !== "1") {
      throw new Error(`SQL UPDATE failed: ${JSON.stringify(confirmResp.data)}`);
    }

    // Verify rows affected (should be in response)
    const rowsAffected = confirmResp.data.responseBody?.rows || 0;
    if (rowsAffected === 0) {
      throw new Error(`NUNOTA ${nunota} not found or already confirmed`);
    }

    console.log(`[CONFIRM-QUOTE] NUNOTA ${nunota} confirmed successfully via SQL UPDATE (${rowsAffected} rows affected)`);

    // 2.2. Atualizar Deal no HubSpot com a confirmaÃ§Ã£o (sankhya_nunota)
    console.log(`[CONFIRM-QUOTE] Marcando Deal ${dealId} como confirmado no HubSpot...`);
    try {
      await axios.patch(
        `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
        { properties: { sankhya_nunota: nunota.toString() } },
        { headers: { Authorization: `Bearer ${token}` } }
      );
    } catch (hsError) {
      console.warn(`[CONFIRM-QUOTE] Falha ao preencher sankhya_nunota: ${hsError.message}`);
    }

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
      console.log(`[CONFIRM-QUOTE] âœ… PDF attached successfully!`);
    } catch (pdfErr) {
      console.warn(`[CONFIRM-QUOTE] âš ï¸ PDF generation failed: ${pdfErr.message}`);
      pdfResult = { success: false, error: pdfErr.message };
    }

    res.json({
      success: true,
      nunota,
      dealId,
      confirmed: true,
      profitability,
      pdfResult,
      message: `OrÃ§amento ${nunota} confirmado com sucesso!${pdfResult?.success ? ' PDF anexado ao Deal.' : ''}`
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
 * Gera um PDF no Sankhya para uma NUNOTA especÃ­fica
 */
async function generateSankhyaPDF(nunota) {
  const token = await getAccessToken();
  // Usar mgecom gate (mesmo do incluirNota) e remover mgeSession da URL
  const url = `${baseUrl}/gateway/v1/mgecom/service.sbr?serviceName=ImpressaoNotasSP.imprimeDocumentos&outputType=json`;

  /* 
    Payload identificado via HAR do Sankhya Web
    1. imprimeDocumentos: Gera o relatÃ³rio e retorna status 1
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

  console.log(`[PDF] 1. Solicitando ImpressÃ£o para NUNOTA ${nunota}...`);
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
    throw new Error('PDF nÃ£o retornado em getDocumentData');
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

  console.log(`[HUBSPOT] Upload concluÃ­do. File ID: ${response.data.id}`);

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
      hs_note_body: `OrÃ§amento Sankhya #${nunota} anexado automaticamente.`,
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
 * Gera PDF de um orÃ§amento Sankhya (para testes)
 */
app.get("/sankhya/generate-pdf/:nunota", async (req, res) => {
  try {
    const { nunota } = req.params;
    const result = await generateSankhyaPDF(nunota);

    // NÃ£o retornar o base64 inteiro no log/response para nÃ£o travar
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

    console.log(`[E2E TEST] âœ… Fluxo concluÃ­do com sucesso!\n`);

    res.json({
      success: true,
      dealId,
      nunota,
      fileId,
      fileUrl: url,
      noteId,
      message: `PDF do orÃ§amento ${nunota} anexado ao Deal ${dealId} com sucesso!`
    });
  } catch (error) {
    console.error(`[E2E TEST ERROR] ${error.message}`, error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// ðŸ”¨ GENERATE HEADER ENDPOINT: Create quote header without items
// ============================================================
app.post("/hubspot/generate-header", async (req, res) => {
  try {
    const { dealId } = req.body;

    if (!dealId) {
      return res.status(400).json({ success: false, error: "dealId Ã© obrigatÃ³rio" });
    }

    const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");

    // 1. Buscar dados do Deal
    console.log(`[GENERATE-HEADER] Buscando Deal ${dealId}...`);
    const dealUrl = `https://api.hubspot.com/crm/v3/objects/deals/${dealId}?properties=codemp_sankhya,sankhya_codemp,dealname,closedate,tipo_negociacao,dealtype,hubspot_owner_id,observacao,observacao_frete,observacao_interna`;
    const dealResp = await axios.get(dealUrl, {
      headers: { Authorization: `Bearer ${hubspotToken}` }
    });

    const props = dealResp.data.properties;

    // 2. Extrair CodeEmp
    const codEmpRaw = props.codemp_sankhya || props.sankhya_codemp || "1";
    const codEmp = toInt("codEmp", codEmpRaw) || 1;

    // 3. Buscar CodParc (Company)
    const companyAssocUrl = `https://api.hubspot.com/crm/v3/objects/deals/${dealId}/associations/companies`;
    const companyAssocResp = await axios.get(companyAssocUrl, {
      headers: { Authorization: `Bearer ${hubspotToken}` }
    });

    const companyId = companyAssocResp.data.results?.[0]?.id;
    if (!companyId) {
      return res.status(400).json({
        success: false,
        error: "Deal nÃ£o possui Company/Parceiro associado"
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
        error: "Company nÃ£o possui cÃ³digo Sankhya (sankhya_codparc ou codparc)"
      });
    }

    // 4. Buscar defaults do Parceiro (TGFPAR) para simular comportamento da tela
    console.log(`[GENERATE-HEADER] Buscando defaults do Parceiro ${codParc}...`);
    const parcQuery = {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: {
        sql: `SELECT CODTIPVENDA, CODVEND, AD_CODNAT FROM TGFPAR WHERE CODPARC = ${codParc}`
      }
    };

    // Default values
    let parcTipVenda = null;
    let parcVend = null;
    let parcNat = null;

    try {
      const parcResp = await postGatewayWithRetry(parcQuery);
      const row = parcResp.data.responseBody?.rows?.[0];
      if (row) {
        parcTipVenda = row[0];
        parcVend = row[1];
        parcNat = row[2]; // Custom field often used for default nature
        console.log(`[GENERATE-HEADER] Defaults do Parceiro: CODTIPVENDA=${parcTipVenda}, CODVEND=${parcVend}, AD_CODNAT=${parcNat}`);
      }
    } catch (e) {
      console.warn(`[GENERATE-HEADER] Erro ao buscar defaults do parceiro: ${e.message}`);
    }

    // 5. Preparar dados do cabeÃ§alho (Prioridade: Deal > Parceiro > Default System)
    const codTipOperRaw = props.dealtype;
    const codTipOper = toInt("codTipOper", codTipOperRaw) || 999;

    // Tipo de NegociaÃ§Ã£o: Deal prop > Parceiro default > 503
    const codTipVendaRaw = props.tipo_negociacao;
    const codTipVenda = toInt("codTipVenda", codTipVendaRaw) || (parcTipVenda ? parseInt(parcTipVenda) : 503);

    // Vendedor: HubSpot Owner mapped > Parceiro default > 0
    // const ownerIdRaw = props.hubspot_owner_id;
    // const ownerId = ownerIdRaw ? parseInt(ownerIdRaw) : null;
    const codVend = parcVend ? parseInt(parcVend) : 0;

    // Natureza: Se vier do parceiro, usamos no UPDATE depois

    // Data de NegociaÃ§Ã£o: Hoje
    const dtNeg = new Date().toLocaleDateString('pt-BR'); // DD/MM/YYYY

    console.log(`[GENERATE-HEADER] Criando cabeÃ§alho final:`, {
      CODEMP: codEmp,
      CODPARC: codParc,
      CODTIPOPER: codTipOper,
      CODTIPVENDA: codTipVenda,
      CODVEND: codVend,
      DTNEG: dtNeg
    });

    // 6. Criar cabeÃ§alho via CRUD (apenas campos obrigatÃ³rios)
    const token = await getAccessToken();

    const INCLUIR_NOTA_URL = `${baseUrl}/gateway/v1/mgecom/service.sbr?serviceName=CACSP.incluirNota&outputType=json`;

    const notaBody = {
      requestBody: {
        nota: {
          cabecalho: {
            NUNOTA: { "$": "" },
            CODEMP: { "$": codEmp },
            CODPARC: { "$": codParc },
            CODTIPOPER: { "$": codTipOper },
            CODEMPNEGOC: { "$": codEmp },
            CODVEND: { "$": codVend },
            TIPMOV: { "$": "P" },
            DTNEG: { "$": dtNeg },
            CODCENCUS: { "$": 101002 },
            CODTIPVENDA: { "$": codTipVenda },
            CODNAT: { "$": parcNat || "101001" },
            OBSERVACAO: { "$": props.observacao || "" },
            AD_OBSFRETE: { "$": props.observacao_frete || "" },
            AD_OBSERVACAOINTERNA: { "$": props.observacao_interna || "" }
          }
        }
      }
    };
    const createResp = await axios.post(
      INCLUIR_NOTA_URL,
      notaBody,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    console.log(`[GENERATE-HEADER] CACSP response:`, JSON.stringify(createResp.data));

    if (createResp.data.status !== "1") {
      throw new Error(`Erro ao criar cabeÃ§alho: ${JSON.stringify(createResp.data)}`);
    }

    // 7. Extrair NUNOTA do response
    const nunota = parseInt(createResp.data.responseBody?.pk?.NUNOTA?.$ || createResp.data.responseBody?.nota?.cabecalho?.NUNOTA?.$);

    if (!nunota) {
      throw new Error("NUNOTA nÃ£o retornado apÃ³s criaÃ§Ã£o");
    }

    console.log(`[GENERATE-HEADER] CabeÃ§alho criado: NUNOTA ${nunota}`);

    // 8. Buscar CODNAT do orÃ§amento criado (auto-preenchido pelo Sankhya)
    const queryPayload = {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: {
        sql: `SELECT CODNAT FROM TGFCAB WHERE NUNOTA = ${nunota}`
      }
    };

    const queryResp = await axios.post(
      `${baseUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`,
      queryPayload,
      {
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        }
      }
    );

    const codNat = queryResp.data.responseBody?.rows?.[0]?.[0];

    if (!codNat) {
      console.warn(`[GENERATE-HEADER] CODNAT nÃ£o encontrado para NUNOTA ${nunota}`);
    }

    console.log(`[GENERATE-HEADER] CODNAT auto-preenchido: ${codNat}`);

    // 9. Atualizar propriedades do Deal no HubSpot
    const updateProps = {
      orcamento_sankhya: nunota.toString(),
      natureza_id: codNat ? codNat.toString() : "101001" // fallback
    };

    await axios.patch(
      `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
      { properties: updateProps },
      { headers: { Authorization: `Bearer ${hubspotToken}` } }
    );

    console.log(`[GENERATE-HEADER] Deal ${dealId} atualizado com NUNOTA ${nunota} e natureza_id ${codNat}`);

    // 10. Retornar sucesso
    res.json({
      success: true,
      nunota,
      codnat: codNat,
      message: `CabeÃ§alho criado com sucesso! NUNOTA: ${nunota}, CODNAT: ${codNat}`
    });

  } catch (error) {
    console.error(`[GENERATE-HEADER ERROR] ${error.message}`, error);
    res.status(500).json({
      success: false,
      error: error.message,
      details: error.response?.data
    });
  }
});

// ============================================================
// ðŸ” SEARCH PRODUCTS: Search Sankhya products for adding
// ============================================================
app.post("/hubspot/products/search", async (req, res) => {
  try {
    const { query } = req.body;
    if (!query) return res.status(400).json({ success: false, error: "Query Ã© obrigatÃ³ria" });

    console.log(`[PROD-SEARCH] Buscando produtos no HubSpot CRM para: "${query}"...`);
    const hubspotToken = process.env.HUBSPOT_ACCESS_TOKEN;

    const searchUrl = "https://api.hubapi.com/crm/v3/objects/products/search";
    const searchBody = {
      filterGroups: [
        {
          filters: [
            { propertyName: "name", operator: "CONTAINS_TOKEN", value: `*${query}*` }
          ]
        },
        {
          filters: [
            { propertyName: "description", operator: "CONTAINS_TOKEN", value: `*${query}*` }
          ]
        },
        {
          filters: [
            { propertyName: "hs_sku", operator: "EQ", value: query }
          ]
        }
      ],
      properties: ["name", "hs_sku", "description", "sankhya_product_id"],
      limit: 20
    };

    const searchResp = await axios.post(searchUrl, searchBody, {
      headers: { Authorization: `Bearer ${hubspotToken}`, "Content-Type": "application/json" }
    });

    const products = (searchResp.data?.results || []).map(p => ({
      codProd: p.properties.hs_sku || p.properties.sankhya_product_id,
      hs_product_id: p.id,
      name: p.properties.name,
      controle: "" // NÃ£o disponÃ­vel no Hubspot sem consulta ao estoque
    })).filter(p => p.codProd); // Garantir que temos o cÃ³digo para adicionar

    console.log(`[PROD-SEARCH] Encontrados ${products.length} produtos no HubSpot.`);
    res.json({ success: true, products });
  } catch (error) {
    console.error(`[PROD-SEARCH ERROR] ${error.response?.data ? JSON.stringify(error.response.data) : error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// âž• ADD LINE ITEM: Create line item in HubSpot
// ============================================================
app.post("/hubspot/line-item/add", async (req, res) => {
  try {
    const { dealId, codProd, hs_product_id, quantity, price, name } = req.body;
    if (!dealId || !codProd) return res.status(400).json({ success: false, error: "dealId e codProd são obrigatórios" });

    const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");

    console.log(`[ADD-ITEM] Adicionando produto ${codProd} (HSID: ${hs_product_id || 'N/A'}) ao Deal ${dealId}...`);

    // 1. Criar Line Item
    const createResp = await axios.post("https://api.hubapi.com/crm/v3/objects/line_items", {
      properties: {
        hs_product_id: hs_product_id || undefined,
        name: name || `Produto ${codProd}`,
        quantity: quantity || 1,
        price: price || 0,
        sankhya_codprod: codProd.toString(),
        codprod: codProd.toString(), // Tenta ambos os nomes comuns
        hs_sku: codProd.toString()   // Backup se não houver hs_product_id
      }
    }, { headers: { Authorization: `Bearer ${hubspotToken}` } });

    const lineItemId = createResp.data.id;

    // 2. Associar ao Deal
    await axios.put(`https://api.hubapi.com/crm/v3/objects/line_items/${lineItemId}/associations/deals/${dealId}/line_item_to_deal`, {}, {
      headers: { Authorization: `Bearer ${hubspotToken}` }
    });

    res.json({ success: true, lineItemId });
  } catch (error) {
    console.error(`[ADD-ITEM ERROR] ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// ðŸ“‘ DUPLICATE LINE ITEM: Clone existing line item
// ============================================================
app.post("/hubspot/duplicate-line-item", async (req, res) => {
  try {
    const { dealId, lineItemId } = req.body;
    if (!dealId || !lineItemId) return res.status(400).json({ success: false, error: "dealId e lineItemId sÃ£o obrigatÃ³rios" });

    const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");

    console.log(`[DUPLICATE-ITEM] Duplicando item ${lineItemId} no Deal ${dealId}...`);

    // 1. Buscar propriedades do item original
    const getResp = await axios.get(`https://api.hubapi.com/crm/v3/objects/line_items/${lineItemId}?properties=name,quantity,price,sankhya_codprod,codprod,hs_product_id,hs_sku,cod_parceiro`, {
      headers: { Authorization: `Bearer ${hubspotToken}` }
    });
    const props = getResp.data.properties;

    // 2. Criar novo item
    const createResp = await axios.post("https://api.hubapi.com/crm/v3/objects/line_items", {
      properties: {
        name: props.name,
        quantity: props.quantity,
        price: props.price,
        hs_product_id: props.hs_product_id,
        sankhya_codprod: props.sankhya_codprod || props.codprod || props.hs_sku,
        codprod: props.sankhya_codprod || props.codprod || props.hs_sku,
        hs_sku: props.hs_sku || props.sankhya_codprod || props.codprod,
        cod_parceiro: props.cod_parceiro // Copy CodParceiro explicitly
      }
    }, { headers: { Authorization: `Bearer ${hubspotToken}` } });

    const newLineItemId = createResp.data.id;

    // 3. Associar novo item ao Deal
    await axios.put(`https://api.hubapi.com/crm/v3/objects/line_items/${newLineItemId}/associations/deals/${dealId}/line_item_to_deal`, {}, {
      headers: { Authorization: `Bearer ${hubspotToken}` }
    });

    res.json({ success: true, newLineItemId });
  } catch (error) {
    console.error(`[DUPLICATE-ITEM ERROR] ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 🗑️ DELETE LINE ITEM: Remove line item from HubSpot
// ============================================================
app.delete("/hubspot/line-item/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");
    console.log(`[DELETE-ITEM] Removendo item ${id}...`);
    await axios.delete(`https://api.hubapi.com/crm/v3/objects/line_items/${id}`, {
      headers: { Authorization: `Bearer ${hubspotToken}` }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[DELETE-ITEM ERROR] ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 📦 PRODUCT CONTROLS: Fetch available batches/lots for a product
// ============================================================
app.get("/hubspot/products/controls/:codProd", async (req, res) => {
  try {
    const { codProd } = req.params;
    const { codEmp } = req.query;
    console.log(`[PROD-CONTROLS] Buscando lotes para produto ${codProd}...`);
    const token = await getAccessToken();
    let sql = `
      SELECT CONTROLE, SUM(ESTOQUE - RESERVADO) as SALDO 
      FROM TGFEST 
      WHERE CODPROD = ${codProd} 
        ${codEmp ? `AND CODEMP = ${codEmp}` : ''}
      GROUP BY CONTROLE
      HAVING SUM(ESTOQUE - RESERVADO) > 0
      ORDER BY CONTROLE
    `;
    const queryResp = await axios.post(`${baseUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`, {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: { sql }
    }, { headers: { Authorization: `Bearer ${token}` } });
    const rows = queryResp.data?.responseBody?.rows || [];
    const controls = rows.map(r => ({ controle: r[0], saldo: parseFloat(r[1]) }));
    res.json({ success: true, controls });
  } catch (error) {
    console.error(`[PROD-CONTROLS ERROR] ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================
// 🔄 UPDATE LINE ITEM: Update properties of a line item
// ============================================================
app.post("/hubspot/line-item/update", async (req, res) => {
  try {
    const { lineItemId, properties } = req.body;
    if (!lineItemId || !properties) return res.status(400).json({ success: false, error: "lineItemId e properties são obrigatórios" });

    const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");

    console.log(`[DEBUG-WRITE] Update request for ${lineItemId}:`, JSON.stringify(properties));

    // MAPPING: Ensure correct property name for HubSpot
    // Frontend sends 'sankhya_controle', but we handle 'controle' too just in case
    const payload = { ...properties };

    // MAPPING CORRECTION: User confirmed internal name is 'controle'
    // If frontend sends 'sankhya_controle', we MUST map it to 'controle'
    if (payload.sankhya_controle) {
      payload.controle = payload.sankhya_controle;
      // We verify if we should keep sankhya_controle. 
      // If it doesn't exist in HubSpot updates might confuse it, but usually fine.
      // Let's explicitly favor 'controle'.
    }

    console.log(`[DEBUG-WRITE] Final Payload to HubSpot:`, JSON.stringify(payload));

    await axios.patch(`https://api.hubapi.com/crm/v3/objects/line_items/${lineItemId}`, {
      properties: payload
    }, {
      headers: { Authorization: `Bearer ${hubspotToken}`, "Content-Type": "application/json" }
    });
    res.json({ success: true });
  } catch (error) {
    console.error(`[UPDATE-ITEM ERROR] ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(Number(process.env.PORT || 3000), () => {
  console.log(`ðŸš€ API: http://localhost:${process.env.PORT || 3000}`);
  console.log("--- SYSTEM READY (v1.3 - Product Sync Support) ---");
});
