"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncController = exports.SyncController = void 0;
const sync_service_1 = require("../services/sync.service");
class SyncController {
    // POST /sankhya/import/partners
    async importPartners(req, res) {
        try {
            const { since, limit, offset } = req.body;
            const result = await sync_service_1.syncService.importPartners({ since, limit, offset });
            res.json(result);
        }
        catch (error) {
            console.error(`[IMPORT FATAL] ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }
    // POST /sankhya/import/products
    async importProducts(req, res) {
        try {
            const { since, limit, offset } = req.body;
            const result = await sync_service_1.syncService.importProducts({ since, limit, offset });
            res.json(result);
        }
        catch (error) {
            console.error(`[PRODUCT IMPORT FATAL] ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }
}
exports.SyncController = SyncController;
exports.syncController = new SyncController();
