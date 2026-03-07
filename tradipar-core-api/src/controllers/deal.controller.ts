import { Request, Response } from 'express';
import { dealService } from '../services/deal.service';

export class DealController {

  // POST /hubspot/update/deal
  public async updateDeal(req: Request, res: Response): Promise<void> {
    try {
      const { objectId, amount } = req.body;
      if (!objectId) {
        res.status(400).json({ success: false, error: 'objectId é obrigatório' });
        return;
      }
      const result = await dealService.updateDeal(objectId, amount);
      res.json(result);
    } catch (error: any) {
      console.error('[DEAL CONTROLLER ERROR]', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // GET /hubspot/debug-deal/:dealId
  public async debugDeal(req: Request, res: Response): Promise<void> {
    try {
      const dealId = req.params.dealId as string;
      const result = await dealService.debugDeal(dealId);
      res.json(result);
    } catch (error: any) {
      console.error('[DEAL CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /hubspot/update/line-item (legacy: quantity + price update)
  public async updateLineItemLegacy(req: Request, res: Response): Promise<void> {
    try {
      const { lineItemId, quantity, price } = req.body;
      if (!lineItemId) {
        res.status(400).json({ error: "Missing lineItemId" });
        return;
      }
      const result = await dealService.updateLineItemLegacy(lineItemId, quantity, price);
      res.json(result);
    } catch (error: any) {
      console.error('[DEAL CONTROLLER ERROR]', error.message);
      res.status(500).json({ error: error.message });
    }
  }

  // POST /hubspot/line-item/add
  public async addLineItem(req: Request, res: Response): Promise<void> {
    try {
      const { dealId, codProd, hs_product_id, quantity, price, name } = req.body;
      if (!dealId || !codProd) {
        res.status(400).json({ success: false, error: "dealId e codProd são obrigatórios" });
        return;
      }
      const result = await dealService.addLineItem(dealId, codProd, hs_product_id, quantity, price, name);
      res.json(result);
    } catch (error: any) {
      console.error('[DEAL CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /hubspot/duplicate-line-item
  public async duplicateLineItem(req: Request, res: Response): Promise<void> {
    try {
      const { dealId, lineItemId } = req.body;
      if (!dealId || !lineItemId) {
        res.status(400).json({ success: false, error: "dealId e lineItemId são obrigatórios" });
        return;
      }
      const result = await dealService.duplicateLineItem(dealId, lineItemId);
      res.json(result);
    } catch (error: any) {
      console.error('[DEAL CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // DELETE /hubspot/line-item/:id
  public async deleteLineItem(req: Request, res: Response): Promise<void> {
    try {
      const id = req.params.id as string;
      const result = await dealService.deleteLineItem(id);
      res.json(result);
    } catch (error: any) {
      console.error('[DEAL CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /hubspot/line-item/update (generic property update)
  public async updateLineItemProperties(req: Request, res: Response): Promise<void> {
    try {
      const { lineItemId, properties } = req.body;
      if (!lineItemId || !properties) {
        res.status(400).json({ success: false, error: "lineItemId e properties são obrigatórios" });
        return;
      }
      const result = await dealService.updateLineItemProperties(lineItemId, properties);
      res.json(result);
    } catch (error: any) {
      console.error('[DEAL CONTROLLER ERROR]', error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export const dealController = new DealController();
