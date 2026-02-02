// ============================================================
// 📝 CREATE QUOTE ENDPOINT: HubSpot Deal → Sankhya Orçamento
// ============================================================
app.post("/hubspot/create-quote", async (req, res) => {
    try {
        const { dealId } = req.body;

        if (!dealId) {
            return res.status(400).json({ success: false, error: "dealId é obrigatório" });
        }

        const hubspotToken = requireEnv("HUBSPOT_ACCESS_TOKEN");

        // 1. Buscar dados do Deal e associações
        console.log(`[QUOTE] Buscando Deal ${dealId}...`);
        const dealUrl = `https://api.hubspot.com/crm/v3/objects/deals/${dealId}?associations=companies,line_items&properties=codemp_sankhya,sankhya_codemp,amount,dealname,closedate`;
        const dealResp = await axios.get(dealUrl, {
            headers: { Authorization: `Bearer ${hubspotToken}` }
        });

        const deal = dealResp.data;
        const props = deal.properties;

        // 2. Extrair CodeEmp
        const codEmpRaw = props.codemp_sankhya || props.sankhya_codemp || "1";
        const codEmp = toInt("codEmp", codEmpRaw) || 1;

        // 3. Buscar CodParc (Company)
        const companyId = deal.associations?.companies?.results?.[0]?.id;
        if (!companyId) {
            return res.status(400).json({
                success: false,
                error: "Deal não possui Company associada"
            });
        }

        const companyResp = await axios.get(
            `https://api.hubspot.com/crm/v3/objects/companies/${companyId}?properties=sankhya_codparc,codparc`,
            { headers: { Authorization: `Bearer ${hubspotToken}` } }
        );

        const codParcRaw = companyResp.data.properties.sankhya_codparc || companyResp.data.properties.codparc;
        const codParc = toInt("codParc", codParcRaw);

        if (!codParc) {
            return res.status(400).json({
                success: false,
                error: "Company não possui código Sankhya (sankhya_codparc ou codparc)"
            });
        }

        // 4. Buscar Line Items
        const lineItemIds = deal.associations?.line_items?.results?.map(li => li.id) || [];

        if (lineItemIds.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Deal não possui Line Items"
            });
        }

        console.log(`[QUOTE] Buscando ${lineItemIds.length} Line Items...`);
        const lineItemsResp = await axios.post(
            `https://api.hubspot.com/crm/v3/objects/line_items/batch/read`,
            {
                properties: ["hs_product_id", "quantity", "price", "name"],
                inputs: lineItemIds.map(id => ({ id }))
            },
            { headers: { Authorization: `Bearer ${hubspotToken}` } }
        );

        const lineItems = lineItemsResp.data.results;

        // 5. Mapear produtos HubSpot → Sankhya (buscar CODPROD via hs_sku)
        const productItems = [];
        for (const item of lineItems) {
            const hsProductId = item.properties.hs_product_id;
            const quantity = parseFloat(item.properties.quantity) || 1;
            const price = parseFloat(item.properties.price) || 0;

            // Buscar produto no HubSpot para pegar o SKU
            const prodResp = await axios.get(
                `https://api.hubspot.com/crm/v3/objects/products/${hsProductId}?properties=hs_sku`,
                { headers: { Authorization: `Bearer ${hubspotToken}` } }
            );

            const sku = prodResp.data.properties.hs_sku;
            const codProd = toInt("codProd", sku);

            if (!codProd) {
                console.warn(`[QUOTE] Produto ${hsProductId} não possui SKU válido`);
                continue;
            }

            // Buscar unidade do produto no Sankhya
            const prodInfoSql = `SELECT CODVOL FROM TGFPRO WHERE CODPROD = ${codProd}`;
            const prodInfoResp = await postGatewayWithRetry({ requestBody: { sql: prodInfoSql } });
            const codVol = prodInfoResp.data?.responseBody?.rows?.[0]?.[0] || "UN";

            productItems.push({
                codProd,
                codVol,
                qtdNeg: quantity,
                vlrUnit: price,
                vlrTot: quantity * price
            });
        }

        if (productItems.length === 0) {
            return res.status(400).json({
                success: false,
                error: "Nenhum produto válido encontrado nos Line Items"
            });
        }

        // 6. Calcular totais
        const vlrNota = productItems.reduce((sum, item) => sum + item.vlrTot, 0);
        const dtneg = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

        // 7. Inserir TGFCAB (Cabeçalho)
        console.log(`[QUOTE] Criando cabeçalho (TGFCAB)...`);
        const insertCabSql = `
      INSERT INTO TGFCAB (
        CODEMP, CODPARC, CODTIPOPER, DTNEG, CODEMPNEGOC, 
        CODVEND, VLRNOTA, STATUSNOTA, DHTIPOPER, DHTIPVENDA, TIPMOV,
        PENDENTE, APROVADO, DTALTER
      ) VALUES (
        ${codEmp}, ${codParc}, 999, TO_DATE('${dtneg}', 'YYYY-MM-DD'), ${codEmp},
        0, ${vlrNota}, 'P', SYSDATE, TO_DATE('01/01/1998', 'DD/MM/YYYY'), 'P',
        'N', 'N', SYSDATE
      )
    `;

        await postGatewayWithRetry({ requestBody: { sql: insertCabSql } });

        // 8. Buscar o NUNOTA gerado
        const getNunotaSql = `
      SELECT MAX(NUNOTA) AS NUNOTA 
      FROM TGFCAB 
      WHERE CODPARC = ${codParc} AND CODTIPOPER = 999
    `;
        const nunotaResp = await postGatewayWithRetry({ requestBody: { sql: getNunotaSql } });
        const nunota = nunotaResp.data?.responseBody?.rows?.[0]?.[0];

        if (!nunota) {
            throw new Error("Falha ao obter NUNOTA do orçamento criado");
        }

        console.log(`[QUOTE] NUNOTA gerado: ${nunota}`);

        // 9. Inserir TGFITE (Itens)
        console.log(`[QUOTE] Inserindo ${productItems.length} itens (TGFITE)...`);
        for (let i = 0; i < productItems.length; i++) {
            const item = productItems[i];
            const sequencia = i + 1;

            const insertIteSql = `
        INSERT INTO TGFITE (
          NUNOTA, SEQUENCIA, CODEMP, CODPROD, CODVOL,
          QTDNEG, VLRUNIT, VLRTOT, STATUSNOTA, PENDENTE,
          CONTROLE, USOPROD, ATUALESTOQUE, RESERVA, FATURAR
        ) VALUES (
          ${nunota}, ${sequencia}, ${codEmp}, ${item.codProd}, '${item.codVol}',
          ${item.qtdNeg}, ${item.vlrUnit}, ${item.vlrTot}, 'P', 'N',
          ' ', 'V', -1, 'N', 'S'
        )
      `;

            await postGatewayWithRetry({ requestBody: { sql: insertIteSql } });
        }

        // 10. Atualizar Deal no HubSpot com NUNOTA
        console.log(`[QUOTE] Atualizando Deal ${dealId} com NUNOTA...`);
        await axios.patch(
            `https://api.hubspot.com/crm/v3/objects/deals/${dealId}`,
            {
                properties: {
                    sankhya_quote_number: nunota.toString()
                }
            },
            { headers: { Authorization: `Bearer ${hubspotToken}` } }
        );

        res.json({
            success: true,
            nunota,
            codEmp,
            codParc,
            vlrNota,
            itemCount: productItems.length,
            message: `Orçamento ${nunota} criado com sucesso!`
        });

    } catch (error) {
        console.error("[QUOTE ERROR]", error.message);
        res.status(500).json({
            success: false,
            error: error.message,
            stack: error.stack
        });
    }
});
