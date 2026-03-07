"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteController = exports.QuoteController = void 0;
const quote_service_1 = require("../services/quote.service");
class QuoteController {
    async createQuote(req, res) {
        try {
            const { dealId } = req.body;
            if (!dealId) {
                res.status(400).json({ success: false, error: 'dealId é obrigatório' });
                return;
            }
            const result = await quote_service_1.quoteService.createQuote(dealId);
            res.json(result);
        }
        catch (error) {
            console.error('[QUOTE CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async convertToOrder(req, res) {
        try {
            const { objectId } = req.body;
            if (!objectId) {
                res.status(400).json({ success: false, error: 'objectId é obrigatório' });
                return;
            }
            const result = await quote_service_1.quoteService.convertToOrder(objectId);
            res.json(result);
        }
        catch (error) {
            console.error('[QUOTE CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async getQuoteStatus(req, res) {
        try {
            const dealId = req.params.dealId;
            const result = await quote_service_1.quoteService.getQuoteStatus(dealId);
            res.json(result);
        }
        catch (error) {
            console.error('[QUOTE CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async confirmQuote(req, res) {
        try {
            const { dealId, nunota, forceConfirm } = req.body;
            if (!dealId || !nunota) {
                res.status(400).json({ success: false, error: 'dealId e nunota são obrigatórios' });
                return;
            }
            const result = await quote_service_1.quoteService.confirmQuote(dealId, Number(nunota), forceConfirm);
            res.json(result);
        }
        catch (error) {
            console.error('[QUOTE CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async checkProfitability(req, res) {
        try {
            const nunota = req.params.nunota;
            const result = await quote_service_1.quoteService.getProfitabilityInternal(nunota);
            if (result.success) {
                res.json(result);
            }
            else {
                res.status(500).json(result);
            }
        }
        catch (error) {
            console.error('[QUOTE CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async generatePdf(req, res) {
        try {
            const nunota = req.params.nunota;
            const result = await quote_service_1.quoteService.generateSankhyaPDF(nunota);
            res.json({
                success: true,
                fileName: result.fileName,
                base64Length: result.base64 ? result.base64.length : 0,
                preview: result.base64 ? result.base64.substring(0, 50) + '...' : null
            });
        }
        catch (error) {
            console.error('[QUOTE CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async attachPdf(req, res) {
        try {
            const { dealId, nunota } = req.body;
            if (!dealId || !nunota) {
                res.status(400).json({ success: false, error: 'dealId e nunota são obrigatórios' });
                return;
            }
            const result = await quote_service_1.quoteService.attachPdfToHubspot(dealId, nunota);
            res.json(result);
        }
        catch (error) {
            console.error('[QUOTE CONTROLLER ERROR]', error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
exports.QuoteController = QuoteController;
exports.quoteController = new QuoteController();
