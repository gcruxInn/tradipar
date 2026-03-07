import { Request, Response } from 'express';
import { catalogService } from '../services/catalog.service';

export class CatalogController {

  // GET /sankhya/stock-all-units/:codProd
  public async getStockAllUnits(req: Request, res: Response): Promise<void> {
    try {
      const codProd = req.params.codProd as string;
      console.log(`[STK-ALL] Fetching stock for CODPROD ${codProd} from all units`);
      const stocks = await catalogService.getStockAllUnits(codProd);
      const totalDisponivel = stocks.reduce((sum: number, s: any) => sum + s.disponivel, 0);
      res.json({ success: true, codProd: Number(codProd), totalDisponivel, units: stocks });
    } catch (error: any) {
      console.error(`[CATALOG CONTROLLER ERROR]`, error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /sankhya/stock-all-units
  public async getStockMultipleProducts(req: Request, res: Response): Promise<void> {
    try {
      const { codProds } = req.body;
      if (!Array.isArray(codProds) || codProds.length === 0) {
        res.status(400).json({ success: false, error: "codProds deve ser um array de códigos de produto" });
        return;
      }
      console.log(`[STK-ALL] Fetching stock for ${codProds.length} products from all units`);
      const results = await catalogService.getStockMultipleProducts(codProds);
      res.json({ success: true, products: results });
    } catch (error: any) {
      console.error(`[CATALOG CONTROLLER ERROR]`, error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /hubspot/prices/deal
  public async getDealPrices(req: Request, res: Response): Promise<void> {
    try {
      const { objectId, dealId } = req.body;
      const id = objectId || dealId;
      if (!id) {
        res.status(400).json({ success: false, error: 'objectId ou dealId é obrigatório' });
        return;
      }
      const result = await catalogService.getDealPrices(String(id));
      res.json(result);
    } catch (error: any) {
      console.error(`[CATALOG CONTROLLER ERROR]`, error.message);
      res.status(500).json({ error: error.message });
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

  // GET /sankhya/debug/products
  public async debugProducts(req: Request, res: Response): Promise<void> {
    try {
      const result = await catalogService.debugProducts();
      res.json(result);
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  }

  // GET /sankhya/debug/pricetables
  public async debugPriceTables(req: Request, res: Response): Promise<void> {
    try {
      const result = await catalogService.debugPriceTables();
      res.json(result);
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  }

  // GET /sankhya/debug/price-scan
  public async debugPriceScan(req: Request, res: Response): Promise<void> {
    try {
      const result = await catalogService.debugPriceScan();
      res.json(result);
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  }

  // GET /sankhya/debug/price/:sku
  public async debugPriceBySku(req: Request, res: Response): Promise<void> {
    try {
      const sku = req.params.sku as string;
      const result = await catalogService.debugPriceBySku(sku);
      res.json(result);
    } catch (error: any) {
      res.status(500).send(error.message);
    }
  }
}

export const catalogController = new CatalogController();
