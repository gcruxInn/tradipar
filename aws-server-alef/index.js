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
    return await axios.post(GATEWAY_EXECUTE_QUERY_URL, body, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      timeout: 20000,
    });
  } catch (err) {
    const status = err.response?.status;

    // Se token expirou, tenta 1 vez renovando
    if (status === 401) {
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

  // Se ainda vier null, loga o responseBody para debug (não trava)
  if (preco === null) {
    console.warn(
      "DbExplorer retornou formato inesperado/sem valor. responseBody=",
      JSON.stringify(response.data?.responseBody, null, 2)
    );
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

    res.json({ tabela1, tabela2, tabela3 });
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
    const codEmp  = toInt("codEmp",  req.body.codEmp);
    const seqPv   = toInt("seqPv",   req.body.seqPv);

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




app.listen(Number(process.env.PORT || 3000), () => {
  console.log(`🚀 API rodando em http://localhost:${process.env.PORT || 3000}`);
});
