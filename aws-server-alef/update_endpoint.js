// ============================================================
// 🔄 UPDATE LINE ITEM: Update properties of a line item
// ============================================================
app.post("/hubspot/line-item/update", async (req, res) => {
    try {
        const { lineItemId, properties } = req.body;
        if (!lineItemId || !properties) return res.status(400).json({ success: false, error: "lineItemId e properties são obrigatórios" });

        const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");

        console.log(`[UPDATE-ITEM] Atualizando item ${lineItemId}...`);

        await axios.patch(`https://api.hubapi.com/crm/v3/objects/line_items/${lineItemId}`, {
            properties
        }, {
            headers: { Authorization: `Bearer ${hubspotToken}`, "Content-Type": "application/json" }
        });

        res.json({ success: true });
    } catch (error) {
        console.error(`[UPDATE-ITEM ERROR] ${error.message}`);
        res.status(500).json({ success: false, error: error.message });
    }
});
