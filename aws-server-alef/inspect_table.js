const axios = require('axios');
const fs = require('fs');

// Configuração
const BASE_URL = 'http://137.131.243.179:3000'; // Ajuste se necessário

async function inspectTable(tableName) {
    try {
        console.log(`🔍 Inspecionando tabela: ${tableName}...`);

        // Simplesmente tenta um SELECT * com LIMIT 1 para pegar as colunas
        const query = `SELECT * FROM ${tableName} WHERE ROWNUM <= 1`;

        const response = await axios.post(`${BASE_URL}/sankhya/query`, { sql: query });

        if (response.data && response.data.length > 0) {
            const columns = Object.keys(response.data[0]);
            console.log(`✅ Colunas encontradas (${columns.length}):`);
            console.log(columns.join(', '));

            // Salvar em arquivo para análise
            fs.writeFileSync(`${tableName}_columns.txt`, columns.join('\n'));
            console.log(`💾 Lista salva em ${tableName}_columns.txt`);
        } else {
            console.log("⚠️ Nenhum registro encontrado ou erro na resposta.");
            console.log(response.data);
        }

    } catch (error) {
        console.error("❌ Erro ao inspecionar tabela:", error.message);
        if (error.response) console.error(error.response.data);
    }
}

inspectTable('TGFPRO');
