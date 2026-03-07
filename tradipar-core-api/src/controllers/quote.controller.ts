import { Request, Response } from 'express';
import { quoteService } from '../services/quote.service';

export class QuoteController {
  
  public async createQuote(req: Request, res: Response): Promise<void> {
    try {
      const { dealId } = req.body;
      if (!dealId) {
        res.status(400).json({ success: false, error: 'dealId é obrigatório' });
        return;
      }

      const result = await quoteService.createQuote(dealId);
      res.json(result);
    } catch (error: any) {
      console.error('[QUOTE CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async convertToOrder(req: Request, res: Response): Promise<void> {
    try {
      const { objectId } = req.body;
      if (!objectId) {
        res.status(400).json({ success: false, error: 'objectId é obrigatório' });
        return;
      }

      const result = await quoteService.convertToOrder(objectId);
      res.json(result);
    } catch (error: any) {
      console.error('[QUOTE CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async getQuoteStatus(req: Request, res: Response): Promise<void> {
    try {
      const dealId = req.params.dealId as string;
      const result = await quoteService.getQuoteStatus(dealId);
      res.json(result);
    } catch (error: any) {
      console.error('[QUOTE CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async confirmQuote(req: Request, res: Response): Promise<void> {
    try {
      const { dealId, nunota, forceConfirm } = req.body;
      if (!dealId || !nunota) {
        res.status(400).json({ success: false, error: 'dealId e nunota são obrigatórios' });
        return;
      }

      const result = await quoteService.confirmQuote(dealId, Number(nunota), forceConfirm);
      res.json(result);
    } catch (error: any) {
      console.error('[QUOTE CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async checkProfitability(req: Request, res: Response): Promise<void> {
    try {
      const nunota = req.params.nunota as string;
      const result = await quoteService.getProfitabilityInternal(nunota);
      if (result.success) {
        res.json(result);
      } else {
        res.status(500).json(result);
      }
    } catch (error: any) {
      console.error('[QUOTE CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async generatePdf(req: Request, res: Response): Promise<void> {
    try {
      const nunota = req.params.nunota as string;
      const result = await quoteService.generateSankhyaPDF(nunota);
      
      res.json({
        success: true,
        fileName: result.fileName,
        base64Length: result.base64 ? result.base64.length : 0,
        preview: result.base64 ? result.base64.substring(0, 50) + '...' : null
      });
    } catch (error: any) {
      console.error('[QUOTE CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  public async attachPdf(req: Request, res: Response): Promise<void> {
    try {
      const { dealId, nunota } = req.body;
      if (!dealId || !nunota) {
        res.status(400).json({ success: false, error: 'dealId e nunota são obrigatórios' });
        return;
      }

      const result = await quoteService.attachPdfToHubspot(dealId, nunota);
      res.json(result);
    } catch (error: any) {
      console.error('[QUOTE CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export const quoteController = new QuoteController();
