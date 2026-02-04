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
        const { codEmp } = req.query; // Pode ser passado opcionalmente

        console.log(`[PROD-CONTROLS] Buscando lotes para produto ${codProd} (Emp: ${codEmp || 'Todas'})...`);
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
        const controls = rows.map(r => ({
            controle: r[0],
            saldo: parseFloat(r[1])
        }));

        res.json({ success: true, controls });
    } catch (error) {
        console.error(`[PROD-CONTROLS ERROR] ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});
