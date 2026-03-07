import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { sankhyaApi } from './adapters/sankhya.api';

import { orcamentoController } from './controllers/orcamento.controller';
import { quoteController } from './controllers/quote.controller';
import { catalogController } from './controllers/catalog.controller';
import { dealController } from './controllers/deal.controller';
import { syncController } from './controllers/sync.controller';
import { orderController } from './controllers/order.controller';
import { discoveryController } from './controllers/discovery.controller';

const app: Express = express();

app.use(cors());
app.use(express.json());

// Routes configuration
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'OK', message: 'Sankhya Auth API is running' });
});

// A quick route to test sankhya logic executing query
app.get('/test-sankhya', async (req: Request, res: Response) => {
  try {
    const response = await sankhyaApi.post(
      '/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json',
      {
        serviceName: "DbExplorerSP.executeQuery",
        requestBody: { sql: "SELECT 1 AS TESTE FROM DUAL" }
      }
    );
    res.json(response.data);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

// Orcamento Routes (Legacy - Header & Items sync)
app.post('/hubspot/generate-header', orcamentoController.generateHeader.bind(orcamentoController));
app.post('/hubspot/sync-quote-items', orcamentoController.syncQuoteItems.bind(orcamentoController));

// Quote Routes (Módulo 1 - Orçamento & Confirmação)
app.post('/hubspot/create-quote', quoteController.createQuote.bind(quoteController));
app.post('/hubspot/convert-to-order', quoteController.convertToOrder.bind(quoteController));
app.get('/hubspot/quote-status/:dealId', quoteController.getQuoteStatus.bind(quoteController));
app.post('/hubspot/confirm-quote', quoteController.confirmQuote.bind(quoteController));
app.get('/sankhya/check-profitability/:nunota', quoteController.checkProfitability.bind(quoteController));
app.get('/sankhya/generate-pdf/:nunota', quoteController.generatePdf.bind(quoteController));
app.post('/sankhya/pdf/attach', quoteController.attachPdf.bind(quoteController));

// Catalog Routes (Módulo 2 - Produtos, Preços e Estoque)
app.get('/sankhya/stock-all-units/:codProd', catalogController.getStockAllUnits.bind(catalogController));
app.post('/sankhya/stock-all-units', catalogController.getStockMultipleProducts.bind(catalogController));
app.post('/hubspot/prices/deal', catalogController.getDealPrices.bind(catalogController));
app.post('/hubspot/products/search', catalogController.searchProducts.bind(catalogController));
app.get('/hubspot/products/controls/:codProd', catalogController.getProductControls.bind(catalogController));
app.get('/sankhya/debug/products', catalogController.debugProducts.bind(catalogController));
app.get('/sankhya/debug/pricetables', catalogController.debugPriceTables.bind(catalogController));
app.get('/sankhya/debug/price-scan', catalogController.debugPriceScan.bind(catalogController));
app.get('/sankhya/debug/price/:sku', catalogController.debugPriceBySku.bind(catalogController));

// Deal & Line Item Routes (Módulo 3)
app.post('/hubspot/update/deal', dealController.updateDeal.bind(dealController));
app.get('/hubspot/debug-deal/:dealId', dealController.debugDeal.bind(dealController));
app.post('/hubspot/update/line-item', dealController.updateLineItemLegacy.bind(dealController));
app.post('/hubspot/line-item/add', dealController.addLineItem.bind(dealController));
app.post('/hubspot/duplicate-line-item', dealController.duplicateLineItem.bind(dealController));
app.delete('/hubspot/line-item/:id', dealController.deleteLineItem.bind(dealController));
app.post('/hubspot/line-item/update', dealController.updateLineItemProperties.bind(dealController));

// Sync & Import Routes (Módulo 4 - Sync, Import)
app.post('/sankhya/import/partners', syncController.importPartners.bind(syncController));
app.post('/sankhya/import/products', syncController.importProducts.bind(syncController));

// Discovery & Debug Routes (Módulo 5)
app.post('/debug/sql', discoveryController.debugSql.bind(discoveryController));
app.get('/sankhya/discovery/quote-tables', discoveryController.discoveryQuoteTables.bind(discoveryController));
app.get('/sankhya/discovery/services', discoveryController.discoveryServices.bind(discoveryController));
app.get('/hubspot/debug/product-properties', discoveryController.debugProductProperties.bind(discoveryController));

// Order & Approval Routes (Módulo 4 - Liberações, Pedidos)
app.get('/sankhya/liberacoes/pendentes/:nunota', orderController.getPendingApprovals.bind(orderController));
app.get('/sankhya/liberadores/buscar', orderController.searchApprovers.bind(orderController));
app.post('/sankhya/liberacoes/definir', orderController.defineApprover.bind(orderController));
app.get('/sankhya/liberacoes/status/:nunota', orderController.getApprovalStatus.bind(orderController));
app.get('/sankhya/pedido/obs/:nunota', orderController.getOrderObs.bind(orderController));
app.put('/sankhya/pedido/obs/:nunota', orderController.saveOrderObs.bind(orderController));
app.post('/sankhya/pedido/anexar', orderController.attachFileToOrder.bind(orderController));
app.post('/sankhya/pedido/confirmar/:nunota', orderController.confirmOrder.bind(orderController));
app.post('/hubspot/deal/properties', orderController.updateDealProperties.bind(orderController));

export default app;
