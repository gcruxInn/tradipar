import { Request, Response } from 'express';
import { quoteService } from '../services/quote.service';

export class QuoteController {

  public async getQuoteStatus(req: Request, res: Response): Promise<void> {
    const { dealId } = req.params;
    console.log(`[QuoteController] getQuoteStatus called for dealId:`, dealId);

    if (!dealId) {
      res.status(400).json({ success: false, error: "Missing dealId" });
      return;
    }

    try {
      const result = await quoteService.getQuoteStatus(dealId as string);
      console.log(`[QuoteController] Outbound Status for ${dealId}:`, JSON.stringify(result.status));
      res.status(200).json(result);
    } catch (error: any) {
      console.error(`[QuoteController] Error getting status for deal ${dealId}:`, error.message);
      // HTTP 200 para HubSpot ler o JSON (proxy bloqueia 5xx)
      res.status(200).json({ success: false, error: error.message });
    }
  }

  public async createQuote(req: Request, res: Response): Promise<void> {
    try {
      const result = await quoteService.createQuote(req.body);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async confirmQuote(req: Request, res: Response): Promise<void> {
    const { dealId, nunota } = req.body;
    try {
      const result = await quoteService.confirmQuote(dealId, nunota);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async convertToOrder(req: Request, res: Response): Promise<void> {
    try {
      const result = await quoteService.convertToOrder(req.body);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async checkProfitability(req: Request, res: Response): Promise<void> {
    try {
      const result = await quoteService.getProfitabilityInternal(req.params.nunota as string);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async generatePdf(req: Request, res: Response): Promise<void> {
    const { nunota } = req.params;
    try {
      const result = await quoteService.generateSankhyaPDF(nunota as string);
      res.status(200).json(result);
    } catch (error: any) {
      console.error(`[QuoteController] Error generating PDF for nunota ${nunota}:`, error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async attachPdf(req: Request, res: Response): Promise<void> {
    const { dealId, pdfFileId } = req.body;
    try {
      // Versão corrigida para o nome correto no service
      const result = await quoteService.attachPdfToHubspot(dealId, pdfFileId);
      res.status(200).json(result);
    } catch (error: any) {
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /hubspot/deal/:dealId/attachments
  public async getDealAttachments(req: Request, res: Response): Promise<void> {
    const dealId = req.params.dealId as string;
    try {
      const result = await quoteService.getDealAttachments(dealId);
      res.json(result);
    } catch (error: any) {
      console.error(`[QUOTE CONTROLLER] Error fetching attachments for ${dealId}:`, error.message);
      res.status(200).json({ success: false, attachments: [], error: error.message });
    }
  }
}

export const quoteController = new QuoteController();
