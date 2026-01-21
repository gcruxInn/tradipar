package br.com.acg.hubspot.tradipar.integracao.action;

import org.cuckoo.core.ScheduledAction;
import org.cuckoo.core.ScheduledActionContext;
import org.json.JSONObject;
import br.com.sankhya.jape.EntityFacade;
import br.com.sankhya.jape.dao.JdbcWrapper;
import br.com.sankhya.jape.sql.NativeSql;
import br.com.sankhya.modelcore.util.EntityFacadeFactory;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.Timestamp;

public class GerarJsonParceiro implements ScheduledAction {

    @Override
    public void onTime(ScheduledActionContext ctx) {
        JdbcWrapper jdbc = null;
        NativeSql sql = null;
        ResultSet rs = null;
        
        BigDecimal codParc = new BigDecimal(0);

        try {
            EntityFacade dwf = EntityFacadeFactory.getDWFFacade();
            jdbc = dwf.getJdbcWrapper();
            jdbc.openSession();

            sql = new NativeSql(jdbc);
            sql.appendSql(
            	    "SELECT " +
            	    "PAR.CODPARC AS sankhya_partner_id, " +
            	    "PAR.NOMEPARC AS name, " +
            	    "PAR.RAZAOSOCIAL AS razao_social, " +
            	    "PAR.TIPPESSOA AS tipo_pessoa, " +
            	    "PAR.CGC_CPF AS cnpj, " +
            	    "PAR.CLIENTE AS is_cliente, " +
            	    "PAR.FORNECEDOR AS is_fornecedor, " +
            	    "PAR.ATIVO AS ativo_sankhya, " +
            	    "NVL(EDR.TIPO,'') || ' ' || NVL(EDR.NOMEEND,'') || ' ' || NVL(PAR.NUMEND,'') || ' - ' || NVL(BAI.NOMEBAI,'') AS address, " +
            	    "PAR.COMPLEMENTO AS complemento, " +
            	    "CID.NOMECID AS city, " +
            	    "PAR.CEP AS zip, " +
            	    "PAR.TELEFONE AS phone, " +
            	    "PAR.EMAIL AS email, " +
            	    "PAR.EMAILNFE AS email_nfe, " +
            	    "NVL(PAR.CODVEND,0) || ' - ' || NVL(VEN.APELIDO,'Sem Vendedor') AS hubspot_owner_id, " +
            	    "PAR.CODTAB AS tabela_preco_id, " +
            	    "PAR.LIMCRED AS limite_credito, " +
            	    "PAR.DTALTER AS hs_lastmodifieddate, " +
            	    "PAR.TIPOFATUR AS tipo_pagamento, " +
            	    "PAR.BLOQUEAR AS bloqueado_financeiro, " +
            	    "PAR.OBSERVACOES AS description, " +
            	    "PAR.CODGRUPO AS grupo_parceiro, " +
            	    "PAR.INSCESTADNAUF AS inscricao_estadual, " +
            	    "PAR.CLASSIFICMS AS classificacao_icms, " +
            	    "PAR.AD_SINCRHUB AS sincr_sankhya, " +
            	    "PAR.DTCAD AS createdate " +
            	    "FROM TGFPAR PAR " +
            	    "LEFT JOIN TSICID CID ON CID.CODCID = PAR.CODCID " +
            	    "LEFT JOIN TSIEND EDR ON EDR.CODEND = PAR.CODEND " +
            	    "LEFT JOIN TSIBAI BAI ON BAI.CODBAI = PAR.CODBAI " +
            	    "LEFT JOIN TGFVEN VEN ON VEN.CODVEND = PAR.CODVEND " +
            	    "WHERE PAR.CODPARC <= 500 " +
            	    "  AND PAR.ATIVO = 'S'"
            	);
            rs = sql.executeQuery();
            
            int contador = 0;

            while (rs.next()) {
                JSONObject json = new JSONObject();

                json.put("sankhya_partner_id", getString(rs, "sankhya_partner_id"));
                json.put("name", getString(rs, "name"));
                json.put("razao_social", getString(rs, "razao_social"));
                json.put("tipo_pessoa", getString(rs, "tipo_pessoa"));
                json.put("cnpj", getString(rs, "cnpj"));
                json.put("is_cliente", getString(rs, "is_cliente"));
                json.put("is_fornecedor", getString(rs, "is_fornecedor"));
                json.put("ativo_sankhya", getString(rs, "ativo_sankhya"));
                json.put("address", getString(rs, "address"));
                json.put("complemento", getString(rs, "complemento"));
                json.put("city", getString(rs, "city"));
                json.put("zip", getString(rs, "zip"));
                json.put("phone", getString(rs, "phone"));
                json.put("email", getString(rs, "email"));
                json.put("email_nfe", getString(rs, "email_nfe"));
                json.put("hubspot_owner_id", getString(rs, "hubspot_owner_id"));
                json.put("tabela_preco_id", getString(rs, "tabela_preco_id"));
                json.put("limite_credito", getBigDecimal(rs, "limite_credito"));
                json.put("hs_lastmodifieddate", formatTimestamp(rs.getTimestamp("hs_lastmodifieddate")));
                json.put("tipo_pagamento", getString(rs, "tipo_pagamento"));
                json.put("bloqueado_financeiro", getString(rs, "bloqueado_financeiro"));
                json.put("description", getString(rs, "description"));
                json.put("grupo_parceiro", getString(rs, "grupo_parceiro"));
                json.put("inscricao_estadual", getString(rs, "inscricao_estadual"));
                json.put("classificacao_icms", getString(rs, "classificacao_icms"));
                json.put("sincr_sankhya", getString(rs, "sincr_sankhya"));
                json.put("createdate", formatTimestamp(rs.getTimestamp("createdate")));
                
                codParc = rs.getBigDecimal("sankhya_partner_id");
                
                NativeSql sqlUpd = new NativeSql(jdbc);
                sqlUpd.appendSql("UPDATE TGFPAR SET AD_SINCRHUB = 'N', AD_REQUEST = '" + json.toString() + "' WHERE CODPARC = " + codParc);
                sqlUpd.executeUpdate();

                contador++;

                if (contador % 50 == 0) {
                    ctx.log("Processados " + contador + " parceiros...");
                }
            }

            ctx.log("Total de parceiros processados: " + contador);

        } catch (Exception e) {
            ctx.log("ERRO na ação GerarJsonParceiro: " + e.getMessage());
            e.printStackTrace();
            try {

            } catch (Exception ex) {
                ctx.log("Erro no rollback: " + ex.getMessage());
            }
        } finally {
           
            if (rs != null) try { rs.close(); } catch (Exception e) {}
            if (sql != null) NativeSql.releaseResources(sql); 
            if (jdbc != null) try { jdbc.closeSession(); } catch (Exception e) {}
        }
    }

    private String getString(ResultSet rs, String column) throws Exception {
        String val = rs.getString(column);
        return val == null ? null : val.trim();
    }

    private BigDecimal getBigDecimal(ResultSet rs, String column) throws Exception {
        return rs.getBigDecimal(column);
    }

    private String formatTimestamp(Timestamp ts) {
        if (ts == null) return null;
        String s = ts.toString();
        if (s.length() >= 19) {
            s = s.substring(0, 19).replace(" ", "T") + "Z";
        }
        return s;
    }
}