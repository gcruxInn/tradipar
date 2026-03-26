"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.discoveryController = exports.DiscoveryController = void 0;
const discovery_service_1 = require("../services/discovery.service");
class DiscoveryController {
    // POST /debug/sql
    async debugSql(req, res) {
        try {
            const { sql } = req.body;
            if (!sql) {
                res.status(400).json({ error: "sql é obrigatório" });
                return;
            }
            const result = await discovery_service_1.discoveryService.debugSql(sql);
            res.json(result);
        }
        catch (error) {
            console.error(`[DISCOVERY ERROR] debugSql: ${error.message}`);
            res.status(500).json({ error: error.message });
        }
    }
    // GET /sankhya/discovery/quote-tables
    async discoveryQuoteTables(req, res) {
        try {
            const result = await discovery_service_1.discoveryService.discoveryQuoteTables();
            res.json(result);
        }
        catch (error) {
            console.error(`[DISCOVERY ERROR] discoveryQuoteTables: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // GET /sankhya/discovery/services
    async discoveryServices(req, res) {
        try {
            const result = await discovery_service_1.discoveryService.discoveryServices();
            res.json(result);
        }
        catch (error) {
            console.error(`[DISCOVERY ERROR] discoveryServices: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // GET /hubspot/debug/product-properties
    async debugProductProperties(req, res) {
        try {
            const result = await discovery_service_1.discoveryService.debugProductProperties();
            res.json(result);
        }
        catch (error) {
            console.error(`[DISCOVERY ERROR] debugProductProperties: ${error.message}`);
            res.status(500).json({ error: error.message, detail: error.response?.data });
        }
    }
    // GET /sankhya/discovery/delivery-routes
    async discoverySankhyaDeliveryRoutes(req, res) {
        try {
            const result = await discovery_service_1.discoveryService.discoverySankhyaDeliveryRoutes();
            res.json(result);
        }
        catch (error) {
            console.error(`[DISCOVERY ERROR] discoverySankhyaDeliveryRoutes: ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
exports.DiscoveryController = DiscoveryController;
exports.discoveryController = new DiscoveryController();
