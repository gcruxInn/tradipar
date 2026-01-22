package br.com.acg.hubspot.tradipar.integracao.action;

import java.sql.ResultSet;
import java.sql.ResultSetMetaData;

import org.cuckoo.core.ScheduledAction;
import org.cuckoo.core.ScheduledActionContext;

import br.com.sankhya.jape.EntityFacade;
import br.com.sankhya.jape.dao.JdbcWrapper;
import br.com.sankhya.jape.sql.NativeSql;
import br.com.sankhya.modelcore.util.EntityFacadeFactory;

/**
 * DIAGNOSTIC PROBE v1.2 - Schema Discovery (Corrigido)
 * 
 * @author ACG HubSpot Integration
 */
public class DiagnosticoPrecos implements ScheduledAction {

    @Override
    public void onTime(ScheduledActionContext ctx) {

        JdbcWrapper jdbc = null;

        try {
            EntityFacade dwf = EntityFacadeFactory.getDWFFacade();
            jdbc = dwf.getJdbcWrapper();
            jdbc.openSession();

            ctx.log("========================================");
            ctx.log("  DIAGNOSTICO PRECOS - TRADIPAR v1.2");
            ctx.log("========================================");

            // PROBE 1: Descobrir estrutura TGFTAB
            ctx.log("");
            ctx.log("[PROBE 1] ESTRUTURA TGFTAB");
            ctx.log("----------------------------------------");
            executarProbeSchema(jdbc, ctx,
                "SELECT * FROM TGFTAB WHERE ROWNUM <= 1"
            );

            // PROBE 2: Listar todas as tabelas de preco
            ctx.log("");
            ctx.log("[PROBE 2] TABELAS DE PRECO (SEM FILTRO)");
            ctx.log("----------------------------------------");
            executarProbe(jdbc, ctx,
                "SELECT NUTAB, DESCRTAB FROM TGFTAB WHERE ROWNUM <= 20"
            );

            // PROBE 3: Estrutura TGFPRO
            ctx.log("");
            ctx.log("[PROBE 3] ESTRUTURA TGFPRO (PRODUTO)");
            ctx.log("----------------------------------------");
            executarProbeSchema(jdbc, ctx,
                "SELECT * FROM TGFPRO WHERE ROWNUM <= 1"
            );

            // PROBE 4: Dados de um produto especifico
            ctx.log("");
            ctx.log("[PROBE 4] PRODUTO 16303 - CAMPOS PRECO");
            ctx.log("----------------------------------------");
            executarProbe(jdbc, ctx,
                "SELECT CODPROD, DESCRPROD FROM TGFPRO WHERE CODPROD = 16303"
            );

            // PROBE 5: Dados TGFEXC com registro
            ctx.log("");
            ctx.log("[PROBE 5] TGFEXC - AMOSTRA DADOS");
            ctx.log("----------------------------------------");
            executarProbe(jdbc, ctx,
                "SELECT * FROM TGFEXC WHERE ROWNUM <= 3"
            );

            // PROBE 6: Parametros gerais
            ctx.log("");
            ctx.log("[PROBE 6] TSIPAR - TODOS PARAMETROS");
            ctx.log("----------------------------------------");
            executarProbe(jdbc, ctx,
                "SELECT CHAVE, TEXTO FROM TSIPAR WHERE ROWNUM <= 10"
            );

            // PROBE 7: Estrutura TGFCUS (Custo)
            ctx.log("");
            ctx.log("[PROBE 7] ESTRUTURA TGFCUS (CUSTO)");
            ctx.log("----------------------------------------");
            executarProbeSchema(jdbc, ctx,
                "SELECT * FROM TGFCUS WHERE ROWNUM <= 1"
            );

            ctx.log("");
            ctx.log("========================================");
            ctx.log("  DIAGNOSTICO v1.2 CONCLUIDO");
            ctx.log("========================================");

        } catch (Exception e) {
            ctx.log("ERRO CRITICO: " + e.getMessage());
        } finally {
            if (jdbc != null) {
                try { jdbc.closeSession(); } catch (Exception ignored) {}
            }
        }
    }

    private void executarProbe(JdbcWrapper jdbc, ScheduledActionContext ctx, String sqlQuery) {
        NativeSql sql = null;
        ResultSet rs = null;
        try {
            sql = new NativeSql(jdbc);
            sql.appendSql(sqlQuery);
            rs = sql.executeQuery();

            ResultSetMetaData meta = rs.getMetaData();
            int colCount = meta.getColumnCount();

            StringBuilder header = new StringBuilder();
            for (int i = 1; i <= colCount; i++) {
                header.append(meta.getColumnName(i));
                if (i < colCount) header.append(" | ");
            }
            ctx.log(header.toString());

            int rowCount = 0;
            while (rs.next()) {
                StringBuilder row = new StringBuilder();
                for (int i = 1; i <= colCount; i++) {
                    Object val = rs.getObject(i);
                    String strVal = (val == null) ? "NULL" : val.toString();
                    if (strVal.length() > 25) strVal = strVal.substring(0, 22) + "...";
                    row.append(strVal);
                    if (i < colCount) row.append(" | ");
                }
                ctx.log(row.toString());
                rowCount++;
            }
            ctx.log("Total: " + rowCount + " registros");

        } catch (Exception e) {
            ctx.log("ERRO: " + e.getMessage());
        } finally {
            try { if (rs != null) rs.close(); } catch (Exception ignored) {}
            if (sql != null) NativeSql.releaseResources(sql);
        }
    }

    private void executarProbeSchema(JdbcWrapper jdbc, ScheduledActionContext ctx, String sqlQuery) {
        NativeSql sql = null;
        ResultSet rs = null;
        try {
            sql = new NativeSql(jdbc);
            sql.appendSql(sqlQuery);
            rs = sql.executeQuery();

            ResultSetMetaData meta = rs.getMetaData();
            int colCount = meta.getColumnCount();

            ctx.log("Colunas: " + colCount);
            for (int i = 1; i <= colCount; i++) {
                ctx.log("  [" + i + "] " + meta.getColumnName(i) + " (" + meta.getColumnTypeName(i) + ")");
            }

        } catch (Exception e) {
            ctx.log("ERRO: " + e.getMessage());
        } finally {
            try { if (rs != null) rs.close(); } catch (Exception ignored) {}
            if (sql != null) NativeSql.releaseResources(sql);
        }
    }
}
