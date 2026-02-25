const axios = require('axios');
require('dotenv').config();
const qs = require('qs');

const sankhyaUrl = process.env.SANKHYA_BASE_URL;

async function run() {
    console.log("Starting...");
    const credInfo = {
        client_id: process.env.SANKHYA_CLIENT_ID,
        client_secret: process.env.SANKHYA_CLIENT_SECRET,
        "x-token": process.env.SANKHYA_XTOKEN,
        grant_type: "client_credentials"
    };

    const resp = await axios.post(`${sankhyaUrl}/gateway/v1/auth/token`, qs.stringify(credInfo), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    const t = resp.data.access_token;

    console.log("Token acquired.");

    // Find NUNOTA where CODPROD=8566 and QTDNEG=2 (from the user's report)
    const sql = `SELECT MAX(NUNOTA) FROM TGFITE WHERE CODPROD = 8566 AND QTDNEG = 2`;
    const resQuery = await axios.post(`${sankhyaUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`, {
        serviceName: "DbExplorerSP.executeQuery", requestBody: { sql }
    }, { headers: { Authorization: `Bearer ${t}` } });

    const nunota = resQuery.data?.responseBody?.rows?.[0]?.[0];
    console.log("Found NUNOTA:", nunota);
    if (!nunota) return;

    const resRentab = await axios.post(`${sankhyaUrl}/gateway/v1/mge/service.sbr?serviceName=LiberacaoLimitesSP.getDadosRentabilidade&outputType=json`, {
        serviceName: "LiberacaoLimitesSP.getDadosRentabilidade",
        requestBody: { params: { nuNota: Number(nunota) } }
    }, { headers: { Authorization: `Bearer ${t}` } });

    console.log("Rentab Data:", JSON.stringify(resRentab.data.responseBody, null, 2));

    const sqlCab = `SELECT VLRNOTA FROM TGFCAB WHERE NUNOTA = ${nunota}`;
    const resCab = await axios.post(`${sankhyaUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`, {
        serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: sqlCab }
    }, { headers: { Authorization: `Bearer ${t}` } });

    console.log("TGFCAB:", resCab.data.responseBody.rows[0]);
}

run().catch(e => console.error(e));
