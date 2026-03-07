import { Request, Response } from 'express';
import { syncService } from '../services/sync.service';

export class SyncController {

  // POST /sankhya/import/partners
  public async importPartners(req: Request, res: Response): Promise<void> {
    try {
      const { since, limit, offset } = req.body;
      const result = await syncService.importPartners({ since, limit, offset });
      res.json(result);
    } catch (error: any) {
      console.error(`[IMPORT FATAL] ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }

  // POST /sankhya/import/products
  public async importProducts(req: Request, res: Response): Promise<void> {
    try {
      const { since, limit, offset } = req.body;
      const result = await syncService.importProducts({ since, limit, offset });
      res.json(result);
    } catch (error: any) {
      console.error(`[PRODUCT IMPORT FATAL] ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }
}

export const syncController = new SyncController();
