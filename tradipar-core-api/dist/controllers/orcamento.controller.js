"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orcamentoController = exports.OrcamentoController = void 0;
const orcamento_service_1 = require("../services/orcamento.service");
const quote_service_1 = require("../services/quote.service");
class OrcamentoController {
    async generateHeader(req, res) {
        const { dealId } = req.body;
        if (!dealId) {
            res.status(400).json({ success: false, error: "O campo 'dealId' é obrigatório no corpo da requisição." });
            return;
        }
        try {
            const result = await orcamento_service_1.orcamentoService.generateHeader(dealId);
            res.status(200).json({
                success: true,
                nunota: result.nunota,
                codnat: result.codnat,
                message: `Cabeçalho criado com sucesso! NUNOTA: ${result.nunota}, CODNAT: ${result.codnat}`
            });
        }
        catch (error) {
            console.error(`[OrcamentoController] Error generating header for deal ${dealId}:`, error.message);
            // We log the detailed message but we can abstract it or return it directly relying on the internal architecture
            res.status(500).json({
                success: false,
                error: error.message || 'Erro inesperado na geração do Cabeçalho Sankhya. Verifique os logs da core-api.'
            });
        }
    }
    async syncQuoteItems(req, res) {
        const { dealId, nunota } = req.body;
        if (!dealId || !nunota) {
            res.status(400).json({ success: false, error: "Missing dealId or nunota" });
            return;
        }
        try {
            const syncResult = await orcamento_service_1.orcamentoService.syncQuoteItems(dealId, nunota);
            // Após sincronizar, buscar o status atualizado (incluindo rentabilidade) para o frontend
            const statusResult = await quote_service_1.quoteService.getQuoteStatus(dealId);
            // Always return 200 so hubspot.fetch doesn't throw.
            // The frontend checks res.success to differentiate.
            res.status(200).json({
                ...syncResult,
                quoteStatus: statusResult.success ? statusResult.status : null
            });
        }
        catch (error) {
            console.error(`[OrcamentoController] Error syncing items for deal ${dealId}:`, error.message);
            res.status(500).json({
                success: false,
                error: error.message || 'Erro inesperado na sincronização de itens do Sankhya.'
            });
        }
    }
}
exports.OrcamentoController = OrcamentoController;
exports.orcamentoController = new OrcamentoController();
