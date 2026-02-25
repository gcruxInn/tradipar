const axios = require('axios');
require('dotenv').config({ path: '../../../../aws-server-alef/.env' });
const sankhyaUrl = process.env.SANKHYA_BASE_URL;

async function getAccessToken() {
    const credInfo = {
        client_id: process.env.SANKHYA_CLIENT_ID,
        client_secret: process.env.SANKHYA_CLIENT_SECRET,
        "x-token": process.env.SANKHYA_XTOKEN,
        grant_type: "client_credentials"
    };

    const qs = require('qs');
    const resp = await axios.post(`${sankhyaUrl}/gateway/v1/auth/token`, qs.stringify(credInfo), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });
    return resp.data.access_token;
}

async function run() {
    try {
        const t = await getAccessToken();
        console.log("Token OK");

        // Simulating the NUNOTA 9999999 -- let's find the NUNOTA for this by querying the Database for an item matching 111.046
        const sql = `SELECT MAX(NUNOTA) FROM TGFITE WHERE CODPROD = 8569 AND QTDNEG = 54`;
        const resQuery = await axios.post(`${sankhyaUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`, {
            serviceName: "DbExplorerSP.executeQuery", requestBody: { sql }
        }, { headers: { Authorization: `Bearer ${t}` } });

        const nunota = resQuery.data?.responseBody?.rows?.[0]?.[0];
        console.log("NUNOTA:", nunota);
        if (!nunota) return;

        const resRentab = await axios.post(`${sankhyaUrl}/gateway/v1/mge/service.sbr?serviceName=LiberacaoLimitesSP.getDadosRentabilidade&outputType=json`, {
            serviceName: "LiberacaoLimitesSP.getDadosRentabilidade",
            requestBody: { params: { nuNota: Number(nunota) } }
        }, { headers: { Authorization: `Bearer ${t}` } });

        console.log("RENTAB:", JSON.stringify(resRentab.data, null, 2));

        const resCab = await axios.post(`${sankhyaUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`, {
            serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: `SELECT VLRNOTA FROM TGFCAB WHERE NUNOTA=${nunota}` }
        }, { headers: { Authorization: `Bearer ${t}` } });
        console.log("VLRNOTA from TGFCAB:", JSON.stringify(resCab.data.responseBody.rows[0]));
    } catch (e) {
        console.error(e.response?.data || e.message);
    }
}
run();
