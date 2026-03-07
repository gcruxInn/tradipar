"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderController = exports.OrderController = void 0;
const order_service_1 = require("../services/order.service");
class OrderController {
    // GET /sankhya/liberacoes/pendentes/:nunota
    async getPendingApprovals(req, res) {
        try {
            const nunota = req.params.nunota;
            const result = await order_service_1.orderService.getPendingApprovals(nunota);
            res.json(result);
        }
        catch (error) {
            console.error(`[LIBERACOES ERROR] ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // GET /sankhya/liberadores/buscar
    async searchApprovers(req, res) {
        try {
            const q = req.query.q;
            const limit = req.query.limit ? Number(req.query.limit) : 20;
            const result = await order_service_1.orderService.searchApprovers(q, limit);
            res.json(result);
        }
        catch (error) {
            console.error(`[LIBERADORES ERROR] ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // POST /sankhya/liberacoes/definir
    async defineApprover(req, res) {
        try {
            const { nunota, codusuLiber, codevento } = req.body;
            if (!nunota || !codusuLiber || !codevento) {
                res.status(400).json({ success: false, error: "nunota, codusuLiber e codevento são obrigatórios" });
                return;
            }
            const result = await order_service_1.orderService.defineApprover(nunota, codusuLiber, codevento);
            res.json(result);
        }
        catch (error) {
            console.error(`[LIBERACOES DEFINIR ERROR] ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // GET /sankhya/liberacoes/status/:nunota
    async getApprovalStatus(req, res) {
        try {
            const nunota = req.params.nunota;
            const result = await order_service_1.orderService.getApprovalStatus(nunota);
            res.json(result);
        }
        catch (error) {
            console.error(`[LIBERACOES STATUS ERROR] ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // GET /sankhya/pedido/obs/:nunota
    async getOrderObs(req, res) {
        try {
            const nunota = req.params.nunota;
            const result = await order_service_1.orderService.getOrderObs(nunota);
            res.json(result);
        }
        catch (error) {
            console.error(`[PEDIDO OBS GET ERROR] ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // PUT /sankhya/pedido/obs/:nunota
    async saveOrderObs(req, res) {
        try {
            const nunota = req.params.nunota;
            const { obs } = req.body;
            if (!obs) {
                res.status(400).json({ success: false, error: "obs é obrigatória" });
                return;
            }
            const result = await order_service_1.orderService.saveOrderObs(nunota, obs);
            res.json(result);
        }
        catch (error) {
            console.error(`[PEDIDO OBS PUT ERROR] ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // POST /sankhya/pedido/anexar
    async attachFileToOrder(req, res) {
        try {
            const { nunota, descricao, fileBase64, fileName } = req.body;
            if (!nunota || !fileBase64 || !fileName) {
                res.status(400).json({ success: false, error: "nunota, fileBase64 e fileName são obrigatórios" });
                return;
            }
            const result = await order_service_1.orderService.attachFileToOrder(nunota, fileBase64, fileName, descricao);
            res.json(result);
        }
        catch (error) {
            console.error(`[PEDIDO ANEXAR ERROR] ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // POST /sankhya/pedido/confirmar/:nunota
    async confirmOrder(req, res) {
        try {
            const nunota = req.params.nunota;
            const { dealId } = req.body;
            if (!nunota || !dealId) {
                res.status(400).json({ success: false, error: "nunota e dealId são obrigatórios" });
                return;
            }
            const result = await order_service_1.orderService.confirmOrder(nunota, dealId);
            res.json(result);
        }
        catch (error) {
            console.error(`[PEDIDO CONFIRMAR ERROR] ${error.message}`);
            res.status(500).json({ success: false, error: error.message });
        }
    }
    // POST /hubspot/deal/properties
    async updateDealProperties(req, res) {
        try {
            const { dealId, properties } = req.body;
            if (!dealId || !properties) {
                res.status(400).json({ success: false, error: "dealId e properties são obrigatórios" });
                return;
            }
            const result = await order_service_1.orderService.updateDealProperties(dealId, properties);
            res.json(result);
        }
        catch (error) {
            console.error(`[DEAL PROPS ERROR] ${error.message}`);
            res.status(500).json({ success: false, error: error.response?.data?.message || error.message });
        }
    }
}
exports.OrderController = OrderController;
exports.orderController = new OrderController();
