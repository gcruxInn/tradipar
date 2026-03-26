"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogController = exports.CatalogController = void 0;
const catalog_service_1 = require("../services/catalog.service");
class CatalogController {
    // GET /sankhya/stock-all-units/:codProd [DEPRECATED - Not Implemented]
    // public async getStockAllUnits(req: Request, res: Response): Promise<void> {
    //   res.status(501).json({ success: false, error: "Method not implemented" });
    // }
    // POST /sankhya/stock-all-units [DEPRECATED - Not Implemented]
    // public async getStockMultipleProducts(req: Request, res: Response): Promise<void> {
    //   res.status(501).json({ success: false, error: "Method not implemented" });
    // }
    // POST /hubspot/prices/deal [DEPRECATED - Not Implemented]
    // public async getDealPrices(req: Request, res: Response): Promise<void> {
    //   res.status(501).json({ success: false, error: "Method not implemented" });
    // }
    // POST /hubspot/products/search
    async searchProducts(req, res) {
        try {
            const { query } = req.body;
            if (!query) {
                res.status(400).json({ success: false, error: "Query é obrigatória" });
                return;
            }
            const result = await catalog_service_1.catalogService.searchProducts(query);
            res.json(result);
        }
        catch (error) {
            console.error(`[CATALOG CONTROLLER ERROR]`, error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // GET /hubspot/products/controls/:codProd
    async getProductControls(req, res) {
        try {
            const codProd = req.params.codProd;
            const codEmp = req.query.codEmp;
            const result = await catalog_service_1.catalogService.getProductControls(codProd, codEmp);
            res.json(result);
        }
        catch (error) {
            console.error(`[CATALOG CONTROLLER ERROR]`, error.message);
            res.status(200).json({ success: false, error: error.message });
        }
    }
}
exports.CatalogController = CatalogController;
exports.catalogController = new CatalogController();
