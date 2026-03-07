import { Request, Response } from 'express';
import { orcamentoService } from '../services/orcamento.service';

export class OrcamentoController {
  
  public async generateHeader(req: Request, res: Response): Promise<void> {
    const { dealId } = req.body;

    if (!dealId) {
      res.status(400).json({ success: false, error: "O campo 'dealId' é obrigatório no corpo da requisição." });
      return;
    }

    try {
      const result = await orcamentoService.generateHeader(dealId);
      
      res.status(200).json({
        success: true,
        nunota: result.nunota,
        codnat: result.codnat,
        message: `Cabeçalho criado com sucesso! NUNOTA: ${result.nunota}, CODNAT: ${result.codnat}`
      });
      
    } catch (error: any) {
      console.error(`[OrcamentoController] Error generating header for deal ${dealId}:`, error.message);
      
      // We log the detailed message but we can abstract it or return it directly relying on the internal architecture
      res.status(500).json({
        success: false,
        error: error.message || 'Erro inesperado na geração do Cabeçalho Sankhya. Verifique os logs da core-api.'
      });
    }
  }

  public async syncQuoteItems(req: Request, res: Response): Promise<void> {
    const { dealId, nunota } = req.body;

    if (!dealId || !nunota) {
      res.status(400).json({ success: false, error: "Missing dealId or nunota" });
      return;
    }

    try {
      const result = await orcamentoService.syncQuoteItems(dealId, nunota);
      
      if (result.success) {
        res.status(200).json(result);
      } else {
        res.status(400).json(result);
      }
      
    } catch (error: any) {
      console.error(`[OrcamentoController] Error syncing items for deal ${dealId}:`, error.message);
      
      res.status(500).json({
        success: false,
        error: error.message || 'Erro inesperado na sincronização de itens do Sankhya.'
      });
    }
  }

}

export const orcamentoController = new OrcamentoController();
