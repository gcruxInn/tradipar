import express, { Express, Request, Response } from 'express';
import cors from 'cors';
import { sankhyaApi } from './adapters/sankhya.api';

import { orcamentoController } from './controllers/orcamento.controller';
import { quoteController } from './controllers/quote.controller';

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

export default app;
