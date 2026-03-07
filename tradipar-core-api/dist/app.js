"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const sankhya_api_1 = require("./adapters/sankhya.api");
const orcamento_controller_1 = require("./controllers/orcamento.controller");
const quote_controller_1 = require("./controllers/quote.controller");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
// Routes configuration
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', message: 'Sankhya Auth API is running' });
});
// A quick route to test sankhya logic executing query
app.get('/test-sankhya', async (req, res) => {
    try {
        const response = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
            serviceName: "DbExplorerSP.executeQuery",
            requestBody: { sql: "SELECT 1 AS TESTE FROM DUAL" }
        });
        res.json(response.data);
    }
    catch (error) {
        res.status(500).json({ error: error.message });
    }
});
// Orcamento Routes (Legacy - Header & Items sync)
app.post('/hubspot/generate-header', orcamento_controller_1.orcamentoController.generateHeader.bind(orcamento_controller_1.orcamentoController));
app.post('/hubspot/sync-quote-items', orcamento_controller_1.orcamentoController.syncQuoteItems.bind(orcamento_controller_1.orcamentoController));
// Quote Routes (Módulo 1 - Orçamento & Confirmação)
app.post('/hubspot/create-quote', quote_controller_1.quoteController.createQuote.bind(quote_controller_1.quoteController));
app.post('/hubspot/convert-to-order', quote_controller_1.quoteController.convertToOrder.bind(quote_controller_1.quoteController));
app.get('/hubspot/quote-status/:dealId', quote_controller_1.quoteController.getQuoteStatus.bind(quote_controller_1.quoteController));
app.post('/hubspot/confirm-quote', quote_controller_1.quoteController.confirmQuote.bind(quote_controller_1.quoteController));
app.get('/sankhya/check-profitability/:nunota', quote_controller_1.quoteController.checkProfitability.bind(quote_controller_1.quoteController));
app.get('/sankhya/generate-pdf/:nunota', quote_controller_1.quoteController.generatePdf.bind(quote_controller_1.quoteController));
app.post('/sankhya/pdf/attach', quote_controller_1.quoteController.attachPdf.bind(quote_controller_1.quoteController));
exports.default = app;
