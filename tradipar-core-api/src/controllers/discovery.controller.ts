import { Request, Response } from 'express';
import { discoveryService } from '../services/discovery.service';

export class DiscoveryController {

  // POST /debug/sql
  public async debugSql(req: Request, res: Response): Promise<void> {
    try {
      const { sql } = req.body;
      if (!sql) { res.status(400).json({ error: "sql é obrigatório" }); return; }
      const result = await discoveryService.debugSql(sql);
      res.json(result);
    } catch (error: any) {
      console.error(`[DISCOVERY ERROR] debugSql: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }

  // GET /sankhya/discovery/quote-tables
  public async discoveryQuoteTables(req: Request, res: Response): Promise<void> {
    try {
      const result = await discoveryService.discoveryQuoteTables();
      res.json(result);
    } catch (error: any) {
      console.error(`[DISCOVERY ERROR] discoveryQuoteTables: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /sankhya/discovery/services
  public async discoveryServices(req: Request, res: Response): Promise<void> {
    try {
      const result = await discoveryService.discoveryServices();
      res.json(result);
    } catch (error: any) {
      console.error(`[DISCOVERY ERROR] discoveryServices: ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /hubspot/debug/product-properties
  public async debugProductProperties(req: Request, res: Response): Promise<void> {
    try {
      const result = await discoveryService.debugProductProperties();
      res.json(result);
    } catch (error: any) {
      console.error(`[DISCOVERY ERROR] debugProductProperties: ${error.message}`);
      res.status(500).json({ error: error.message, detail: error.response?.data });
    }
  }
}

export const discoveryController = new DiscoveryController();
