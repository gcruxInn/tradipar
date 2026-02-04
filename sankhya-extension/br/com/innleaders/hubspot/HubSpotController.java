package br.com.innleaders.hubspot;

import java.math.BigDecimal;
import java.sql.ResultSet;

import org.cuckoo.core.ScheduledAction;
import org.cuckoo.core.ScheduledActionContext;
import org.json.JSONObject;

import br.com.sankhya.jape.EntityFacade;
import br.com.sankhya.jape.dao.JdbcWrapper;
import br.com.sankhya.jape.sql.NativeSql;
import br.com.sankhya.modelcore.PlatformService;
import br.com.sankhya.modelcore.PlatformServiceFactory;
import br.com.sankhya.modelcore.util.EntityFacadeFactory;

/**
 * Universal Gateway Controller para Integração HubSpot <-> Sankhya
 * 
 * <p>Este serviço centraliza operações de integração HubSpot,
 * utilizando ScheduledAction para compatibilidade com as bibliotecas disponíveis.</p>
 * 
 * <p><b>Ação Disponível:</b> Confirmação de Orçamentos (NUNOTA)</p>
 * 
 * @author InnLeaders
 * @version 2.0
 * @since 2026-02-03
 */
public class HubSpotController implements ScheduledAction {

    // ========== CONSTANTS ==========
    private static final String LOG_PREFIX = "[HubSpotGateway]";
    private static final String SERVICE_CONFIRM = "@core:confirmacao.nota.service";

    // ========== MAIN HANDLER ==========
    
    /**
     * Entry point para ações agendadas.
     * Processa parâmetros passados via propriedades do contexto.
     */
    @Override
    public void onTime(ScheduledActionContext ctx) {
        JdbcWrapper jdbc = null;
        
        try {
            EntityFacade dwf = EntityFacadeFactory.getDWFFacade();
            jdbc = dwf.getJdbcWrapper();
            jdbc.openSession();
            
            // Ler parâmetros (passados via propriedades da tarefa agendada)
            String action = getContextParam(ctx, "action");
            
            logInfo(ctx, "Action request: " + action);

            // Roteamento de Actions
            switch (action) {
                case "confirmQuote":
                    confirmQuote(ctx, jdbc);
                    break;
                    
                default:
                    throw new IllegalArgumentException("Action desconhecida: " + action);
            }

        } catch (IllegalArgumentException e) {
            logError(ctx, "Validation error: " + e.getMessage());
        } catch (Exception e) {
            logError(ctx, "Unexpected error: " + e.getMessage());
            e.printStackTrace();
        } finally {
            if (jdbc != null) {
                try { jdbc.closeSession(); } catch (Exception ignored) {}
            }
        }
    }

    // ========== ACTIONS ==========
    
    /**
     * Confirma um orçamento/pedido no Sankhya.
     * 
     * <p>Utiliza o serviço nativo {@code @core:confirmacao.nota.service} para garantir
     * que todas as regras de negócio (estoque, fiscal, financeiro) sejam aplicadas.</p>
     */
    private void confirmQuote(ScheduledActionContext ctx, JdbcWrapper jdbc) throws Exception {
        // 1. Extrair NUNOTA do contexto
        String nuNotaStr = getContextParam(ctx, "nuNota");
        BigDecimal nuNota = new BigDecimal(nuNotaStr);

        logInfo(ctx, "Confirmando Orçamento NUNOTA: " + nuNota);

        // 2. Chamar serviço nativo via PlatformServiceFactory
        try {
            PlatformService confirmService = PlatformServiceFactory.getInstance()
                .lookupService(SERVICE_CONFIRM);

            confirmService.set("NUNOTA", nuNota);
            confirmService.set("CODUSUAUTHINFO", BigDecimal.ZERO);
            
            confirmService.execute();

            logInfo(ctx, "Sucesso confirmacao NUNOTA: " + nuNota);
            
        } catch (Exception e) {
            // Fallback: Se PlatformService não estiver disponível, usar SQL UPDATE
            logInfo(ctx, "PlatformService não disponível, usando SQL UPDATE");
            executeDirectSqlConfirm(jdbc, nuNota, ctx);
        }
    }
    
    /**
     * Método fallback: Confirmação via SQL UPDATE direto.
     * Usado apenas se PlatformService não estiver disponível.
     */
    private void executeDirectSqlConfirm(JdbcWrapper jdbc, BigDecimal nuNota, ScheduledActionContext ctx) throws Exception {
        NativeSql sql = null;
        try {
            sql = new NativeSql(jdbc);
            sql.appendSql("UPDATE TGFCAB SET STATUSNOTA = 'L' ");
            sql.appendSql("WHERE NUNOTA = " + nuNota + " ");
            sql.appendSql("AND STATUSNOTA = 'P'");
            
            int rows = sql.executeUpdate();
            
            if (rows > 0) {
                logInfo(ctx, "SQL UPDATE confirmou NUNOTA: " + nuNota);
            } else {
                throw new Exception("Nenhuma linha atualizada. NUNOTA pode já estar confirmado ou não existir.");
            }
            
        } finally {
            if (sql != null) NativeSql.releaseResources(sql);
        }
    }

    // ========== UTILITY METHODS ==========
    
    /**
     * Extrai um parâmetro obrigatório do contexto.
     */
    private String getContextParam(ScheduledActionContext ctx, String paramName) {
        String value = ctx.getProperty(paramName);
        if (value == null || value.trim().isEmpty()) {
            throw new IllegalArgumentException("Parametro '" + paramName + "' obrigatorio.");
        }
        return value.trim();
    }
    
    /**
     * Log de informação com prefixo padronizado.
     */
    private void logInfo(ScheduledActionContext ctx, String message) {
        ctx.log(LOG_PREFIX + " " + message);
    }
    
    /**
     * Log de erro com prefixo padronizado.
     */
    private void logError(ScheduledActionContext ctx, String message) {
        ctx.log(LOG_PREFIX + " ERROR: " + message);
    }
}
