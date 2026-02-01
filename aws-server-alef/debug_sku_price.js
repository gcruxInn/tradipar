import { getAccessToken } from "./sankhyaAuth.js";
import axios from "axios";
import dotenv from "dotenv";
dotenv.config();

const SANKHYA_BASE_URL = process.env.SANKHYA_API_URL || "http://137.131.243.179:8180";

async function run() {
    console.log("🔍 Investigando SKU 19991...");
    try {
        const token = await getAccessToken();
        console.log("🔑 Token obtido:", token);

        const sql = `SELECT * FROM TGFEXC WHERE CODPROD = 19991`;

        console.log("📡 Executando SQL no Sankhya:", sql);

        const serviceUrl = `${SANKHYA_BASE_URL}/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`;
        const body = {
            serviceName: "DbExplorerSP.executeQuery",
            requestBody: { sql: { $: sql } }
        };

        const res = await axios.post(serviceUrl, body, {
            headers: {
                "Content-Type": "application/json",
                "Cookie": `JSESSIONID=${token}`
            }
        });

        console.log("📄 Resultado RAW:", JSON.stringify(res.data, null, 2));

    } catch (e) {
        console.error("❌ Erro:", e.message);
        if (e.response) console.error("Detalhes:", e.response.data);
    }
}

run();
