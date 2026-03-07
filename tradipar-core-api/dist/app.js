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
const catalog_controller_1 = require("./controllers/catalog.controller");
const deal_controller_1 = require("./controllers/deal.controller");
const sync_controller_1 = require("./controllers/sync.controller");
const order_controller_1 = require("./controllers/order.controller");
const discovery_controller_1 = require("./controllers/discovery.controller");
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
// Catalog Routes (Módulo 2 - Produtos, Preços e Estoque)
app.get('/sankhya/stock-all-units/:codProd', catalog_controller_1.catalogController.getStockAllUnits.bind(catalog_controller_1.catalogController));
app.post('/sankhya/stock-all-units', catalog_controller_1.catalogController.getStockMultipleProducts.bind(catalog_controller_1.catalogController));
app.post('/hubspot/prices/deal', catalog_controller_1.catalogController.getDealPrices.bind(catalog_controller_1.catalogController));
app.post('/hubspot/products/search', catalog_controller_1.catalogController.searchProducts.bind(catalog_controller_1.catalogController));
app.get('/hubspot/products/controls/:codProd', catalog_controller_1.catalogController.getProductControls.bind(catalog_controller_1.catalogController));
app.get('/sankhya/debug/products', catalog_controller_1.catalogController.debugProducts.bind(catalog_controller_1.catalogController));
app.get('/sankhya/debug/pricetables', catalog_controller_1.catalogController.debugPriceTables.bind(catalog_controller_1.catalogController));
app.get('/sankhya/debug/price-scan', catalog_controller_1.catalogController.debugPriceScan.bind(catalog_controller_1.catalogController));
app.get('/sankhya/debug/price/:sku', catalog_controller_1.catalogController.debugPriceBySku.bind(catalog_controller_1.catalogController));
// Deal & Line Item Routes (Módulo 3)
app.post('/hubspot/update/deal', deal_controller_1.dealController.updateDeal.bind(deal_controller_1.dealController));
app.get('/hubspot/debug-deal/:dealId', deal_controller_1.dealController.debugDeal.bind(deal_controller_1.dealController));
app.post('/hubspot/update/line-item', deal_controller_1.dealController.updateLineItemLegacy.bind(deal_controller_1.dealController));
app.post('/hubspot/line-item/add', deal_controller_1.dealController.addLineItem.bind(deal_controller_1.dealController));
app.post('/hubspot/duplicate-line-item', deal_controller_1.dealController.duplicateLineItem.bind(deal_controller_1.dealController));
app.delete('/hubspot/line-item/:id', deal_controller_1.dealController.deleteLineItem.bind(deal_controller_1.dealController));
app.post('/hubspot/line-item/update', deal_controller_1.dealController.updateLineItemProperties.bind(deal_controller_1.dealController));
// Sync & Import Routes (Módulo 4 - Sync, Import)
app.post('/sankhya/import/partners', sync_controller_1.syncController.importPartners.bind(sync_controller_1.syncController));
app.post('/sankhya/import/products', sync_controller_1.syncController.importProducts.bind(sync_controller_1.syncController));
// Discovery & Debug Routes (Módulo 5)
app.post('/debug/sql', discovery_controller_1.discoveryController.debugSql.bind(discovery_controller_1.discoveryController));
app.get('/sankhya/discovery/quote-tables', discovery_controller_1.discoveryController.discoveryQuoteTables.bind(discovery_controller_1.discoveryController));
app.get('/sankhya/discovery/services', discovery_controller_1.discoveryController.discoveryServices.bind(discovery_controller_1.discoveryController));
app.get('/hubspot/debug/product-properties', discovery_controller_1.discoveryController.debugProductProperties.bind(discovery_controller_1.discoveryController));
// Order & Approval Routes (Módulo 4 - Liberações, Pedidos)
app.get('/sankhya/liberacoes/pendentes/:nunota', order_controller_1.orderController.getPendingApprovals.bind(order_controller_1.orderController));
app.get('/sankhya/liberadores/buscar', order_controller_1.orderController.searchApprovers.bind(order_controller_1.orderController));
app.post('/sankhya/liberacoes/definir', order_controller_1.orderController.defineApprover.bind(order_controller_1.orderController));
app.get('/sankhya/liberacoes/status/:nunota', order_controller_1.orderController.getApprovalStatus.bind(order_controller_1.orderController));
app.get('/sankhya/pedido/obs/:nunota', order_controller_1.orderController.getOrderObs.bind(order_controller_1.orderController));
app.put('/sankhya/pedido/obs/:nunota', order_controller_1.orderController.saveOrderObs.bind(order_controller_1.orderController));
app.post('/sankhya/pedido/anexar', order_controller_1.orderController.attachFileToOrder.bind(order_controller_1.orderController));
app.post('/sankhya/pedido/anexar-pdf', order_controller_1.orderController.attachGeneratedPdfToOrder.bind(order_controller_1.orderController));
app.post('/sankhya/pedido/confirmar/:nunota', order_controller_1.orderController.confirmOrder.bind(order_controller_1.orderController));
app.post('/hubspot/deal/properties', order_controller_1.orderController.updateDealProperties.bind(order_controller_1.orderController));
exports.default = app;
