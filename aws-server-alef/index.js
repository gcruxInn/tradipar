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
    console.error(`[QUERY ERROR] ${err.message}`);
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

app.post("/sankhya/import/products", async (req, res) => {
  console.log("[PRODUCT IMPORT] ========== INÍCIO DA IMPORTAÇÃO ==========");
  const token = process.env.HUBSPOT_ACCESS_TOKEN;
  const { since, limit, offset = 0 } = req.body;

  try {
    let query = `
      SELECT CODPROD, DESCRPROD, COMPLDESC, CODVOL, ATIVO, REFERENCIA, PESOLIQ, DTALTER 
      FROM TGFPRO 
      WHERE ATIVO = 'S'
    `;
    if (since) {
      query += ` AND DTALTER >= TO_DATE('${since}', 'YYYY-MM-DD"T"HH24:MI:SS')`;
    }
    query += ` ORDER BY CODPROD DESC`;

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

      // 1. Tentar encontrar por SKU (Deduplicação)
      let hsProduct = await findHubSpotProduct(token, sku);

      const properties = {
        name: prod.DESCRPROD,
        hs_sku: sku,
        description: prod.COMPLDESC || undefined
      };

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
        const errMsg = err.response?.data?.message || err.message;
        console.error(`[ERROR PRODUCT] SKU ${sku}: ${errMsg}`);
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

app.listen(Number(process.env.PORT || 3000), () => {
  console.log(`🚀 API: http://localhost:${process.env.PORT || 3000}`);
  console.log("--- SYSTEM READY (v1.3 - Product Sync Support) ---");
});
