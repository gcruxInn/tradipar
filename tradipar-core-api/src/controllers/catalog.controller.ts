import { Request, Response } from 'express';
import { catalogService } from '../services/catalog.service';

export class CatalogController {

  // GET /sankhya/stock-all-units/:codProd [DEPRECATED - Not Implemented]
  // public async getStockAllUnits(req: Request, res: Response): Promise<void> {
  //   res.status(501).json({ success: false, error: "Method not implemented" });
  // }

  // POST /sankhya/stock-all-units [DEPRECATED - Not Implemented]
  // public async getStockMultipleProducts(req: Request, res: Response): Promise<void> {
  //   res.status(501).json({ success: false, error: "Method not implemented" });
  // }

  // POST /hubspot/prices/deal
  public async getDealPrices(req: Request, res: Response): Promise<void> {
    try {
      const { objectId } = req.body;
      if (!objectId) {
        res.status(400).json({ success: false, error: "objectId é obrigatório" });
        return;
      }
      const result = await catalogService.getDealPrices(objectId);
      res.json(result);
    } catch (error: any) {
      console.error(`[CATALOG CONTROLLER ERROR] getDealPrices:`, error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /hubspot/products/search
  public async searchProducts(req: Request, res: Response): Promise<void> {
    try {
      const { query } = req.body;
      if (!query) {
        res.status(400).json({ success: false, error: "Query é obrigatória" });
        return;
      }
      const result = await catalogService.searchProducts(query);
      res.json(result);
    } catch (error: any) {
      console.error(`[CATALOG CONTROLLER ERROR]`, error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /hubspot/products/controls/:codProd
  public async getProductControls(req: Request, res: Response): Promise<void> {
    try {
      const codProd = req.params.codProd as string;
      const codEmp = req.query.codEmp as string | undefined;
      const result = await catalogService.getProductControls(codProd, codEmp);
      res.json(result);
    } catch (error: any) {
      console.error(`[CATALOG CONTROLLER ERROR]`, error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /sankhya/debug/products [DEPRECATED - Not Implemented]
  // public async debugProducts(req: Request, res: Response): Promise<void> {
  //   res.status(501).json({ success: false, error: "Method not implemented" });
  // }

  // GET /sankhya/debug/pricetables [DEPRECATED - Not Implemented]
  // public async debugPriceTables(req: Request, res: Response): Promise<void> {
  //   res.status(501).json({ success: false, error: "Method not implemented" });
  // }

  // GET /sankhya/debug/price-scan [DEPRECATED - Not Implemented]
  // public async debugPriceScan(req: Request, res: Response): Promise<void> {
  //   res.status(501).json({ success: false, error: "Method not implemented" });
  // }

  // GET /sankhya/debug/price/:sku [DEPRECATED - Not Implemented]
  // public async debugPriceBySku(req: Request, res: Response): Promise<void> {
  //   res.status(501).json({ success: false, error: "Method not implemented" });
  // }
}

export const catalogController = new CatalogController();
