"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dealController = exports.DealController = void 0;
const deal_service_1 = require("../services/deal.service");
class DealController {
    // POST /hubspot/update/deal
    async updateDeal(req, res) {
        try {
            const { objectId, amount } = req.body;
            if (!objectId) {
                res.status(400).json({ success: false, error: 'objectId é obrigatório' });
                return;
            }
            const result = await deal_service_1.dealService.updateDeal(objectId, amount);
            res.json(result);
        }
        catch (error) {
            console.error('[DEAL CONTROLLER ERROR]', error.message);
            res.status(500).json({ error: error.message });
        }
    }
    // GET /hubspot/debug-deal/:dealId
    async debugDeal(req, res) {
        try {
            const dealId = req.params.dealId;
            const result = await deal_service_1.dealService.debugDeal(dealId);
            res.json(result);
        }
        catch (error) {
            console.error('[DEAL CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // POST /hubspot/update/line-item (legacy: quantity + price update)
    async updateLineItemLegacy(req, res) {
        try {
            const { lineItemId, quantity, price } = req.body;
            if (!lineItemId) {
                res.status(400).json({ error: "Missing lineItemId" });
                return;
            }
            const result = await deal_service_1.dealService.updateLineItemLegacy(lineItemId, quantity, price);
            res.json(result);
        }
        catch (error) {
            console.error('[DEAL CONTROLLER ERROR]', error.message);
            res.status(500).json({ error: error.message });
        }
    }
    // POST /hubspot/line-item/add
    async addLineItem(req, res) {
        try {
            const { dealId, codProd, hs_product_id, quantity, price, name } = req.body;
            if (!dealId || !codProd) {
                res.status(400).json({ success: false, error: "dealId e codProd são obrigatórios" });
                return;
            }
            const result = await deal_service_1.dealService.addLineItem(dealId, codProd, hs_product_id, quantity, price, name);
            res.json(result);
        }
        catch (error) {
            console.error('[DEAL CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // POST /hubspot/duplicate-line-item
    async duplicateLineItem(req, res) {
        try {
            const { dealId, lineItemId } = req.body;
            if (!dealId || !lineItemId) {
                res.status(400).json({ success: false, error: "dealId e lineItemId são obrigatórios" });
                return;
            }
            const result = await deal_service_1.dealService.duplicateLineItem(dealId, lineItemId);
            res.json(result);
        }
        catch (error) {
            console.error('[DEAL CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // DELETE /hubspot/line-item/:id
    async deleteLineItem(req, res) {
        try {
            const id = req.params.id;
            const result = await deal_service_1.dealService.deleteLineItem(id);
            res.json(result);
        }
        catch (error) {
            console.error('[DEAL CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // POST /hubspot/line-item/update (generic property update)
    async updateLineItemProperties(req, res) {
        try {
            const { lineItemId, properties } = req.body;
            if (!lineItemId || !properties) {
                res.status(400).json({ success: false, error: "lineItemId e properties são obrigatórios" });
                return;
            }
            const result = await deal_service_1.dealService.updateLineItemProperties(lineItemId, properties);
            res.json(result);
        }
        catch (error) {
            console.error('[DEAL CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
exports.DealController = DealController;
exports.dealController = new DealController();
