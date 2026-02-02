// ============================================================
// 🔧 HELPER: Add Line Items to Deal (for testing)
// ============================================================
app.post("/hubspot/add-line-items-to-deal", async (req, res) => {
    try {
        const { dealId, items } = req.body;
        /*
        Expected format:
        {
          "dealId": "54609985328",
          "items": [
            { "productId": "40075806219", "quantity": 1, "price": 37.37 },
            { "productId": "40128306594", "quantity": 1, "price": 446.76 }
          ]
        }
        */

        if (!dealId || !items || items.length === 0) {
            return res.status(400).json({
                success: false,
                error: "dealId e items[] são obrigatórios"
            });
        }

        const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");
        const createdLineItems = [];

        for (const item of items) {
            // 1. Criar Line Item
            const createResp = await axios.post(
                `https://api.hubspot.com/crm/v3/objects/line_items`,
                {
                    properties: {
                        hs_product_id: item.productId,
                        quantity: item.quantity.toString(),
                        price: item.price.toString()
                    }
                },
                { headers: { Authorization: `Bearer ${hubspotToken}`, "Content-Type": "application/json" } }
            );

            const lineItemId = createResp.data.id;

            // 2. Associar ao Deal
            await axios.put(
                `https://api.hubspot.com/crm/v3/objects/line_items/${lineItemId}/associations/deals/${dealId}/line_item_to_deal`,
                {},
                { headers: { Authorization: `Bearer ${hubspotToken}` } }
            );

            createdLineItems.push({
                lineItemId,
                productId: item.productId,
                quantity: item.quantity,
                price: item.price
            });
        }

        res.json({
            success: true,
            dealId,
            createdLineItems,
            message: `${createdLineItems.length} Line Items associados ao Deal ${dealId}`
        });

    } catch (error) {
        console.error("[ADD LINE ITEMS ERROR]", error.response?.data || error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            details: error.response?.data
        });
    }
});
