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
                sql: `SELECT NUNOTA, CODPARC, CODTIPOPER, DTNEG, CODVEND, VLRNOTA, STATUSNOTA, OBSERVACAO
              FROM TGFCAB 
              WHERE CODTIPOPER = 999 
              AND ROWNUM <= 5
              ORDER BY NUNOTA DESC`
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
