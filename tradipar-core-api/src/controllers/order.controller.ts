import { Request, Response } from 'express';
import { orderService } from '../services/order.service';

export class OrderController {

  // GET /sankhya/liberacoes/pendentes/:nunota
  public async getPendingApprovals(req: Request, res: Response): Promise<void> {
    try {
      const nunota = req.params.nunota as string;
      const result = await orderService.getPendingApprovals(nunota);
      res.json(result);
    } catch (error: any) {
      console.error(`[LIBERACOES ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /sankhya/liberadores/buscar
  public async searchApprovers(req: Request, res: Response): Promise<void> {
    try {
      const q = req.query.q as string | undefined;
      const limit = req.query.limit ? Number(req.query.limit) : 20;
      const result = await orderService.searchApprovers(q, limit);
      res.json(result);
    } catch (error: any) {
      console.error(`[LIBERADORES ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /sankhya/liberacoes/definir
  public async defineApprover(req: Request, res: Response): Promise<void> {
    try {
      const { nunota, codusuLiber, codevento } = req.body;
      if (!nunota || !codusuLiber || !codevento) {
        res.status(400).json({ success: false, error: "nunota, codusuLiber e codevento são obrigatórios" });
        return;
      }
      const result = await orderService.defineApprover(nunota, codusuLiber, codevento);
      res.json(result);
    } catch (error: any) {
      console.error(`[LIBERACOES DEFINIR ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /sankhya/liberacoes/status/:nunota
  public async getApprovalStatus(req: Request, res: Response): Promise<void> {
    try {
      const nunota = req.params.nunota as string;
      const result = await orderService.getApprovalStatus(nunota);
      res.json(result);
    } catch (error: any) {
      console.error(`[LIBERACOES STATUS ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // GET /sankhya/pedido/obs/:nunota
  public async getOrderObs(req: Request, res: Response): Promise<void> {
    try {
      const nunota = req.params.nunota as string;
      const result = await orderService.getOrderObs(nunota);
      res.json(result);
    } catch (error: any) {
      console.error(`[PEDIDO OBS GET ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // PUT /sankhya/pedido/obs/:nunota
  public async saveOrderObs(req: Request, res: Response): Promise<void> {
    try {
      const nunota = req.params.nunota as string;
      const { obs } = req.body;
      if (!obs) { res.status(400).json({ success: false, error: "obs é obrigatória" }); return; }
      const result = await orderService.saveOrderObs(nunota, obs);
      res.json(result);
    } catch (error: any) {
      console.error(`[PEDIDO OBS PUT ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /sankhya/pedido/anexar
  public async attachFileToOrder(req: Request, res: Response): Promise<void> {
    try {
      const { nunota, descricao, fileBase64, fileName } = req.body;
      if (!nunota || !fileBase64 || !fileName) {
        res.status(400).json({ success: false, error: "nunota, fileBase64 e fileName são obrigatórios" });
        return;
      }
      const result = await orderService.attachFileToOrder(nunota, fileBase64, fileName, descricao);
      res.json(result);
    } catch (error: any) {
      console.error(`[PEDIDO ANEXAR ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /sankhya/pedido/confirmar/:nunota
  public async confirmOrder(req: Request, res: Response): Promise<void> {
    try {
      const nunota = req.params.nunota as string;
      const { dealId } = req.body;
      if (!nunota || !dealId) {
        res.status(400).json({ success: false, error: "nunota e dealId são obrigatórios" });
        return;
      }
      const result = await orderService.confirmOrder(nunota, dealId);
      res.json(result);
    } catch (error: any) {
      console.error(`[PEDIDO CONFIRMAR ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // POST /hubspot/deal/properties
  public async updateDealProperties(req: Request, res: Response): Promise<void> {
    try {
      const { dealId, properties } = req.body;
      if (!dealId || !properties) {
        res.status(400).json({ success: false, error: "dealId e properties são obrigatórios" });
        return;
      }
      const result = await orderService.updateDealProperties(dealId, properties);
      res.json(result);
    } catch (error: any) {
      console.error(`[DEAL PROPS ERROR] ${error.message}`);
      res.status(500).json({ success: false, error: error.response?.data?.message || error.message });
    }
  }
}

export const orderController = new OrderController();
