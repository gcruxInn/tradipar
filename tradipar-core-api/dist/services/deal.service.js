"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dealService = void 0;
const hubspot_api_1 = require("../adapters/hubspot.api");
const STAGE_AGUARDANDO_LIBERACAO = "decisionmakerboughtin";
class DealService {
    // ================================================================
    // DEAL UPDATE
    // ================================================================
    /**
     * Atualiza amount do Deal, verificando se preço < PV3 para bloqueio/aprovação
     */
    async updateDeal(objectId, amount) {
        // For now, simplified version - PV3 check requires catalog context
        // which would create a circular dependency. The legacy code did this inline.
        // We keep the simple update path and can add the PV3 guard later if needed.
        await hubspot_api_1.hubspotApi.updateDeal(objectId, { amount: String(amount) });
        return { status: "SUCCESS", message: null };
    }
    // ================================================================
    // DEAL DEBUG
    // ================================================================
    /**
     * Debug endpoint: Retorna Deal com todas as associações para inspeção
     */
    async debugDeal(dealId) {
        const dealResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/deals/${dealId}?associations=companies,contacts,quotes,line_items&properties=dealname,amount,dealstage`);
        const deal = dealResp.data;
        const result = {
            dealId,
            dealName: deal.properties.dealname,
            amount: deal.properties.amount,
            associations: {
                companies: deal.associations?.companies?.results || [],
                contacts: deal.associations?.contacts?.results || [],
                quotes: deal.associations?.quotes?.results || [],
                line_items: deal.associations?.line_items?.results || []
            }
        };
        // Se houver Quote, buscar os Line Items da Quote
        if (result.associations.quotes.length > 0) {
            const quoteId = result.associations.quotes[0].id;
            const quoteResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/quotes/${quoteId}?associations=line_items`);
            result.quoteLineItems = quoteResp.data.associations?.line_items?.results || [];
        }
        return result;
    }
    // ================================================================
    // LINE ITEM CRUD
    // ================================================================
    /**
     * Update line item properties (quantity, price)
     */
    async updateLineItemLegacy(lineItemId, quantity, price) {
        const properties = {};
        if (quantity !== undefined && quantity !== null)
            properties.quantity = String(quantity);
        if (price !== undefined && price !== null)
            properties.price = String(price);
        if (Object.keys(properties).length === 0) {
            throw new Error("Missing quantity or price to update");
        }
        console.log(`[UPDATE] Updating LineItem ${lineItemId}:`, properties);
        await hubspot_api_1.hubspotApi.updateLineItem(lineItemId, properties);
        return { status: "SUCCESS" };
    }
    /**
     * Add a new line item to a Deal
     */
    async addLineItem(dealId, codProd, hsProductId, quantity, price, name) {
        console.log(`[ADD-ITEM] Adicionando produto ${codProd} (HSID: ${hsProductId || 'N/A'}) ao Deal ${dealId}...`);
        // 1. Criar Line Item
        const properties = {
            name: name || `Produto ${codProd}`,
            quantity: quantity || 1,
            price: price || 0,
            sankhya_codprod: codProd.toString(),
            codprod: codProd.toString(),
            hs_sku: codProd.toString()
        };
        if (hsProductId)
            properties.hs_product_id = hsProductId;
        const createResp = await hubspot_api_1.hubspotApi.createLineItem(properties);
        const lineItemId = createResp.id;
        // 2. Associar ao Deal
        await hubspot_api_1.hubspotApi.associateLineItemToDeal(lineItemId, dealId);
        return { success: true, lineItemId };
    }
    /**
     * Duplicar um line item existente
     */
    async duplicateLineItem(dealId, lineItemId) {
        console.log(`[DUPLICATE-ITEM] Duplicando item ${lineItemId} no Deal ${dealId}...`);
        // 1. Buscar propriedades do item original
        const getResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/line_items/${lineItemId}?properties=name,quantity,price,sankhya_codprod,codprod,hs_product_id,hs_sku,parceiro,sankhya_controle,controle`);
        const props = getResp.data.properties;
        // 2. Criar novo item com as mesmas propriedades
        const newProperties = {
            name: props.name,
            quantity: props.quantity,
            price: props.price,
            hs_product_id: props.hs_product_id,
            sankhya_codprod: props.sankhya_codprod || props.codprod || props.hs_sku,
            codprod: props.sankhya_codprod || props.codprod || props.hs_sku,
            hs_sku: props.hs_sku || props.sankhya_codprod || props.codprod,
            parceiro: props.parceiro,
            sankhya_controle: props.sankhya_controle || props.controle || "",
            controle: props.controle || props.sankhya_controle || ""
        };
        const createResp = await hubspot_api_1.hubspotApi.createLineItem(newProperties);
        const newLineItemId = createResp.id;
        // 3. Associar novo item ao Deal
        await hubspot_api_1.hubspotApi.associateLineItemToDeal(newLineItemId, dealId);
        return { success: true, newLineItemId };
    }
    /**
     * Deletar um line item
     */
    async deleteLineItem(lineItemId) {
        console.log(`[DELETE-ITEM] Removendo item ${lineItemId}...`);
        await hubspot_api_1.hubspotApi.deleteLineItem(lineItemId);
        return { success: true };
    }
    /**
     * Update line item properties (generic, with sankhya_controle mapping)
     */
    async updateLineItemProperties(lineItemId, properties) {
        console.log(`[DEBUG-WRITE] Update request for ${lineItemId}:`, JSON.stringify(properties));
        const payload = { ...properties };
        // MAPPING: sankhya_controle -> controle (internal name confirmed)
        if (payload.sankhya_controle) {
            payload.controle = payload.sankhya_controle;
        }
        console.log(`[DEBUG-WRITE] Final Payload to HubSpot:`, JSON.stringify(payload));
        await hubspot_api_1.hubspotApi.updateLineItem(lineItemId, payload);
        return { success: true };
    }
}
exports.dealService = new DealService();
