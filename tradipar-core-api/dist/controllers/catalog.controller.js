"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.catalogController = exports.CatalogController = void 0;
const catalog_service_1 = require("../services/catalog.service");
class CatalogController {
    // GET /sankhya/stock-all-units/:codProd
    async getStockAllUnits(req, res) {
        try {
            const codProd = req.params.codProd;
            console.log(`[STK-ALL] Fetching stock for CODPROD ${codProd} from all units`);
            const stocks = await catalog_service_1.catalogService.getStockAllUnits(codProd);
            const totalDisponivel = stocks.reduce((sum, s) => sum + s.disponivel, 0);
            res.json({ success: true, codProd: Number(codProd), totalDisponivel, units: stocks });
        }
        catch (error) {
            console.error(`[CATALOG CONTROLLER ERROR]`, error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // POST /sankhya/stock-all-units
    async getStockMultipleProducts(req, res) {
        try {
            const { codProds } = req.body;
            if (!Array.isArray(codProds) || codProds.length === 0) {
                res.status(400).json({ success: false, error: "codProds deve ser um array de códigos de produto" });
                return;
            }
            console.log(`[STK-ALL] Fetching stock for ${codProds.length} products from all units`);
            const results = await catalog_service_1.catalogService.getStockMultipleProducts(codProds);
            res.json({ success: true, products: results });
        }
        catch (error) {
            console.error(`[CATALOG CONTROLLER ERROR]`, error.message);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // POST /hubspot/prices/deal
    async getDealPrices(req, res) {
        try {
            const { objectId, dealId } = req.body;
            const id = objectId || dealId;
            if (!id) {
                res.status(400).json({ success: false, error: 'objectId ou dealId é obrigatório' });
                return;
            }
            const result = await catalog_service_1.catalogService.getDealPrices(String(id));
            res.json(result);
        }
        catch (error) {
            console.error(`[CATALOG CONTROLLER ERROR]`, error.message);
            res.status(500).json({ error: error.message });
        }
    }
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
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // GET /sankhya/debug/products
    async debugProducts(req, res) {
        try {
            const result = await catalog_service_1.catalogService.debugProducts();
            res.json(result);
        }
        catch (error) {
            res.status(500).send(error.message);
        }
    }
    // GET /sankhya/debug/pricetables
    async debugPriceTables(req, res) {
        try {
            const result = await catalog_service_1.catalogService.debugPriceTables();
            res.json(result);
        }
        catch (error) {
            res.status(500).send(error.message);
        }
    }
    // GET /sankhya/debug/price-scan
    async debugPriceScan(req, res) {
        try {
            const result = await catalog_service_1.catalogService.debugPriceScan();
            res.json(result);
        }
        catch (error) {
            res.status(500).send(error.message);
        }
    }
    // GET /sankhya/debug/price/:sku
    async debugPriceBySku(req, res) {
        try {
            const sku = req.params.sku;
            const result = await catalog_service_1.catalogService.debugPriceBySku(sku);
            res.json(result);
        }
        catch (error) {
            res.status(500).send(error.message);
        }
    }
}
exports.CatalogController = CatalogController;
exports.catalogController = new CatalogController();
