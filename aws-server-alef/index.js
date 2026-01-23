import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { getAccessToken, invalidateToken } from "./sankhyaAuth.js";

dotenv.config();

const app = express();
app.use(express.json());


function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

function toInt(name, value) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${name} inválido (precisa ser inteiro): ${value}`);
  }
  return n;
}

const baseUrl = requireEnv("SANKHYA_BASE_URL");
const GATEWAY_EXECUTE_QUERY_URL =
  `${baseUrl}/gateway/v1/mge/service.sbr` +
  `?serviceName=DbExplorerSP.executeQuery&outputType=json`;

async function postGatewayWithRetry(body) {
  let token = await getAccessToken();

  try {
    const response = await axios.post(GATEWAY_EXECUTE_QUERY_URL, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });

    // VERIFICAR STATUS 3 DO SANKHYA (Sessão inválida/Não autorizado no nível MGE)
    if (response.data && response.data.status === "3") {
      console.warn("Sankhya retornou Status 3 (Não autorizado). Renovando token e tentando novamente...");
      invalidateToken();
      token = await getAccessToken();

      return await axios.post(GATEWAY_EXECUTE_QUERY_URL, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      });
    }

    return response;
  } catch (err) {
    const status = err.response?.status;

    // Se o Gateway retornar 401 (Token inválido/expirado no nível Gateway)
    if (status === 401) {
      console.warn("Gateway retornou 401. Renovando token e tentando novamente...");
      invalidateToken();
      token = await getAccessToken();

      return await axios.post(GATEWAY_EXECUTE_QUERY_URL, body, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        timeout: 20000,
      });
    }

    throw err;
  }
}

// Parser robusto para os formatos comuns do DbExplorerSP.executeQuery via Gateway
function parseDbExplorerFirstValue(data) {
  const rb = data?.responseBody;

  // Formato 1: rows: [[ "15.375" ]]
  if (Array.isArray(rb?.rows) && rb.rows.length) {
    const v = rb.rows[0]?.[0];
    return v !== undefined && v !== null ? Number(v) : null;
  }

  // Formato 2: resultSet.rows: [ { PRECO: { $: "15.375" } } ]
  const rsRows = rb?.resultSet?.rows;
  if (Array.isArray(rsRows) && rsRows.length) {
    const row0 = rsRows[0];

    // tenta coluna PRECO
    const byName = row0?.PRECO?.$;
    if (byName !== undefined && byName !== null) return Number(byName);

    // fallback: primeira coluna do objeto
    const firstObj = Object.values(row0 || {})[0];
    const byFirst = firstObj?.$;
    if (byFirst !== undefined && byFirst !== null) return Number(byFirst);

    return null;
  }

  // Formato 3: algum retorno direto
  if (typeof rb === "string" || typeof rb === "number") return Number(rb);

  return null;
}

async function consultaPreco(codProd, codParc, codEmp, seqPv) {
  const sql = `
    SELECT AD_PRECO_TRADIPAR(
      ${codProd},
      ${codParc},
      ${codEmp},
      ${seqPv}
    ) AS PRECO
    FROM DUAL
  `;

  const payload = {
    requestBody: { sql },
  };

  const response = await postGatewayWithRetry(payload);

  const preco = parseDbExplorerFirstValue(response.data);

  if (preco === null) {
    console.warn(
      `[consultaPreco] Sankhya retornou NULL para Prod=${codProd}, Parc=${codParc}, Emp=${codEmp}, PV=${seqPv}`
    );
    console.warn("Full Response Data:", JSON.stringify(response.data, null, 2));
  } else {
    console.log(`[consultaPreco] Sucesso: PV${seqPv}=${preco}`);
  }

  return preco;
}

app.post("/precos", async (req, res) => {
  try {
    const codProd = toInt("codProd", req.body.codProd);
    const codParc = toInt("codParc", req.body.codParc);
    const codEmp = toInt("codEmp", req.body.codEmp);

    const [tabela1, tabela2, tabela3] = await Promise.all([
      consultaPreco(codProd, codParc, codEmp, 1),
      consultaPreco(codProd, codParc, codEmp, 2),
      consultaPreco(codProd, codParc, codEmp, 3),
    ]);

    res.json({ pv1: tabela1, pv2: tabela2, pv3: tabela3 });
  } catch (err) {
    console.error("Erro /precos:", err.response?.data || err.message || err);

    // se for erro nosso de validação
    if (
      (err.message || "").includes("inválido") ||
      (err.message || "").includes("Variável de ambiente")
    ) {
      return res.status(400).json({ erro: err.message });
    }

    res.status(500).json({
      erro: "Erro ao consultar preços no Sankhya",
      detalhe: err.response?.data?.error?.descricao || err.response?.data || undefined,
    });
  }
});


app.post("/debug-preco", async (req, res) => {
  try {
    const codProd = toInt("codProd", req.body.codProd);
    const codParc = toInt("codParc", req.body.codParc);
    const codEmp = toInt("codEmp", req.body.codEmp);
    const seqPv = toInt("seqPv", req.body.seqPv);

    const sql = `
      SELECT AD_PRECO_TRADIPAR(
        ${codProd},
        ${codParc},
        ${codEmp},
        ${seqPv}
      ) AS PRECO
      FROM DUAL
    `;

    const payload = { requestBody: { sql } };

    const response = await postGatewayWithRetry(payload);

    // devolve o JSON bruto do Sankhya
    res.json(response.data);
  } catch (err) {
    res.status(500).json({
      erro: "Falha no debug",
      detalhe: err.response?.data || err.message
    });
  }
});

// Endpoint de Debug Completo para o Deal
app.get("/hubspot/debug/deal/:objectId", async (req, res) => {
  try {
    const { objectId } = req.params;
    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) return res.status(500).json({ error: "Token ausente" });

    // Busca Deal com Associações e Amount
    const hsUrl = `https://api.hubapi.com/crm/v3/objects/deals/${objectId}?state=true&associations=companies,line_items&properties=codemp_sankhya,sankhya_codemp,amount`;
    const dealRes = await axios.get(hsUrl, { headers: { Authorization: `Bearer ${token}` } });
    const deal = dealRes.data;

    const debugResult = {
      dealId: objectId,
      properties: deal.properties,
      associations: deal.associations || "Nenhuma associação retornada",
      lineItemsDetails: [],
      companiesDetails: []
    };

    // Helper para buscar key
    const getAssociationKey = (obj, keyName) => {
      if (obj.associations?.[keyName]) return keyName;
      if (obj.associations?.[keyName.replace("_", " ")]) return keyName.replace("_", " ");
      return null;
    };

    // Detalhes dos Itens de Linha
    const lineItemsKey = getAssociationKey(deal, "line_items");
    const lineItems = lineItemsKey ? deal.associations[lineItemsKey].results : [];

    if (lineItems) {
      for (const item of lineItems) {
        try {
          const liRes = await axios.get(`https://api.hubapi.com/crm/v3/objects/line_items/${item.id}?properties=sankhya_codprod,codprod,hs_product_id,name,price,quantity`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          debugResult.lineItemsDetails.push(liRes.data);
        } catch (e) {
          debugResult.lineItemsDetails.push({ id: item.id, error: e.message });
        }
      }
    }

    // Detalhes das Empresas
    if (deal.associations?.companies?.results) {
      for (const item of deal.associations.companies.results) {
        try {
          const compRes = await axios.get(`https://api.hubapi.com/crm/v3/objects/companies/${item.id}?properties=sankhya_codparc,codparc,name,domain`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          debugResult.companiesDetails.push(compRes.data);
        } catch (e) {
          debugResult.companiesDetails.push({ id: item.id, error: e.message });
        }
      }
    }

    res.json(debugResult);

  } catch (err) {
    res.status(500).json({ error: err.message, details: err.response?.data });
  }
});


// Endpoint dedicado para o Card HubSpot
app.post("/hubspot/prices/deal", async (req, res) => {
  console.log("--- Executando /hubspot/prices/deal ---");
  console.log("Headers:", JSON.stringify(req.headers));
  console.log("Body:", JSON.stringify(req.body));

  try {
    const { objectId } = req.body;
    if (!objectId) {
      return res.status(400).json({ error: "objectId é obrigatório" });
    }

    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) {
      console.error("HUBSPOT_ACCESS_TOKEN não configurado no .env");
      return res.status(500).json({ error: "Erro de configuração do servidor (Token)" });
    }

    // 1. Buscar Associações do Deal
    // Buscar também AMOUNT para preencher o card
    const hsUrl = `https://api.hubapi.com/crm/v3/objects/deals/${objectId}?state=true&associations=companies,line_items&properties=codemp_sankhya,sankhya_codemp,amount`;

    const hsResponse = await axios.get(hsUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const deal = hsResponse.data;
    const props = deal.properties;

    // CodEmp: Tenta do Deal
    const codEmp = props.codemp_sankhya || props.sankhya_codemp;
    const currentAmount = props.amount;

    // CodParc: Busca da Empresa associada
    let codParc = null;
    const companyId = deal.associations?.companies?.results?.[0]?.id;
    if (companyId) {
      try {
        const compRes = await axios.get(`https://api.hubapi.com/crm/v3/objects/companies/${companyId}?properties=sankhya_codparc,codparc`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        // Tenta sankhya_codparc, se não existir, tenta codparc
        codParc = compRes.data.properties.sankhya_codparc || compRes.data.properties.codparc;
      } catch (e) {
        console.warn(`Erro ao buscar Company ${companyId}: ${e.message}`);
      }
    }

    // CodProd: Busca do Item de Linha associado
    let codProd = null;

    // Tenta encontrar a chave correta para line items (hubspot pode retornar "line_items" ou "line items")
    let lineItemsKey = "line_items";
    if (deal.associations && deal.associations["line items"]) {
      lineItemsKey = "line items";
    }

    const lineItemId = deal.associations?.[lineItemsKey]?.results?.[0]?.id;
    if (lineItemId) {
      try {
        // Busca LineItem com sankhya_codprod, codprod e hs_product_id
        const lineRes = await axios.get(`https://api.hubapi.com/crm/v3/objects/line_items/${lineItemId}?properties=sankhya_codprod,codprod,name,hs_product_id`, {
          headers: { Authorization: `Bearer ${token}` }
        });

        const lineProps = lineRes.data.properties;
        codProd = lineProps.sankhya_codprod || lineProps.codprod;

        // Se não achou na LineItem, mas tem hs_product_id, busca no Produto
        if (!codProd && lineProps.hs_product_id) {
          console.log(`Buscando código no Produto Base ${lineProps.hs_product_id}...`);
          const prodRes = await axios.get(`https://api.hubapi.com/crm/v3/objects/products/${lineProps.hs_product_id}?properties=sankhya_codprod,codprod`, {
            headers: { Authorization: `Bearer ${token}` }
          });
          codProd = prodRes.data.properties.sankhya_codprod || prodRes.data.properties.codprod;
        }

      } catch (e) {
        console.warn(`Erro ao buscar LineItem ${lineItemId}: ${e.message}`);
      }
    }

    console.log(`Dados Recuperados: Deal=${objectId}, Emp=${codEmp}, Parc=${codParc} (Comp ${companyId}), Prod=${codProd} (Line ${lineItemId}), Amount=${currentAmount}`);

    if (!codProd || !codParc || !codEmp) {
      return res.json({
        status: "MISSING_DATA",
        message: "Dados incompletos (Verifique Parceiro na Empresa e Produtos)",
        details: { codProd, codParc, codEmp }
      });
    }

    // 2. Consultar Preços
    const pCodProd = toInt("codProd", codProd);
    const pCodParc = toInt("codParc", codParc);
    const pCodEmp = toInt("codEmp", codEmp);

    const [pv1, pv2, pv3] = await Promise.all([
      consultaPreco(pCodProd, pCodParc, pCodEmp, 1),
      consultaPreco(pCodProd, pCodParc, pCodEmp, 2),
      consultaPreco(pCodProd, pCodParc, pCodEmp, 3),
    ]);

    return res.json({
      status: "SUCCESS",
      prices: { pv1, pv2, pv3 },
      currentAmount: currentAmount // Retorna o valor atual para o front
    });

  } catch (err) {
    console.error("Erro /hubspot/prices/deal:", err.message);
    // Erro do HubSpot
    if (err.response?.status === 404) {
      return res.status(404).json({ error: "Negócio não encontrado no HubSpot" });
    }

    res.status(500).json({
      amount: "Erro interno",
      error: err.message
    });
  }
});


// Novo Endpoint para Atualizar Dados do Deal (Amount)
app.post("/hubspot/update/deal", async (req, res) => {
  try {
    const { objectId, amount } = req.body;

    if (!objectId) {
      return res.status(400).json({ error: "objectId é obrigatório" });
    }
    if (amount === undefined || amount === null) {
      return res.status(400).json({ error: "amount é obrigatório" });
    }

    const token = process.env.HUBSPOT_ACCESS_TOKEN;
    if (!token) {
      return res.status(500).json({ error: "Erro de configuração do servidor (Token)" });
    }

    console.log(`Atualizando Deal ${objectId} com amount=${amount}`);

    const hsUrl = `https://api.hubapi.com/crm/v3/objects/deals/${objectId}`;

    const hsResponse = await axios.patch(hsUrl, {
      properties: {
        amount: String(amount)
      }
    }, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json"
      }
    });

    return res.json({
      status: "SUCCESS",
      data: hsResponse.data
    });

  } catch (err) {
    console.error("Erro /hubspot/update/deal:", err.message);
    res.status(500).json({
      error: "Erro ao atualizar Deal",
      details: err.response?.data || err.message
    });
  }
});


app.listen(Number(process.env.PORT || 3000), () => {
  console.log(`🚀 API rodando em http://localhost:${process.env.PORT || 3000}`);
});
