"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteController = exports.QuoteController = void 0;
const quote_service_1 = require("../services/quote.service");
class QuoteController {
    async getQuoteStatus(req, res) {
        const { dealId } = req.params;
        console.log(`[QuoteController] getQuoteStatus called for dealId:`, dealId);
        if (!dealId) {
            res.status(400).json({ success: false, error: "Missing dealId" });
            return;
        }
        try {
            const result = await quote_service_1.quoteService.getQuoteStatus(dealId);
            console.log(`[QuoteController] Outbound Status for ${dealId}:`, JSON.stringify(result.status));
            res.status(200).json(result);
        }
        catch (error) {
            console.error(`[QuoteController] Error getting status for deal ${dealId}:`, error.message);
            // HTTP 200 para HubSpot ler o JSON (proxy bloqueia 5xx)
            res.status(200).json({ success: false, error: error.message });
        }
    }
    async createQuote(req, res) {
        try {
            const result = await quote_service_1.quoteService.createQuote(req.body);
            res.status(200).json(result);
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async confirmQuote(req, res) {
        const { dealId, nunota } = req.body;
        try {
            const result = await quote_service_1.quoteService.confirmQuote(dealId, nunota);
            res.status(200).json(result);
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async convertToOrder(req, res) {
        try {
            const result = await quote_service_1.quoteService.convertToOrder(req.body);
            res.status(200).json(result);
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async checkProfitability(req, res) {
        try {
            const result = await quote_service_1.quoteService.getProfitabilityInternal(req.params.nunota);
            res.status(200).json(result);
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async generatePdf(req, res) {
        const { nunota } = req.params;
        try {
            const result = await quote_service_1.quoteService.generateSankhyaPDF(nunota);
            res.status(200).json(result);
        }
        catch (error) {
            console.error(`[QuoteController] Error generating PDF for nunota ${nunota}:`, error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    async attachPdf(req, res) {
        const { dealId, pdfFileId } = req.body;
        try {
            // Versão corrigida para o nome correto no service
            const result = await quote_service_1.quoteService.attachPdfToHubspot(dealId, pdfFileId);
            res.status(200).json(result);
        }
        catch (error) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
exports.QuoteController = QuoteController;
exports.quoteController = new QuoteController();
