package br.com.acg.hubspot.tradipar.integracao.action;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.math.BigDecimal;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import org.cuckoo.core.ScheduledAction;
import org.cuckoo.core.ScheduledActionContext;
import org.json.JSONArray;
import org.json.JSONObject;

import br.com.acg.hubspot.tradipar.integracao.config.Auth;
import br.com.sankhya.jape.EntityFacade;
import br.com.sankhya.jape.dao.JdbcWrapper;
import br.com.sankhya.jape.sql.NativeSql;
import br.com.sankhya.modelcore.util.EntityFacadeFactory;

public class PostProducts implements ScheduledAction {

    private static final String URL_BASE =
        "https://api.hubapi.com/crm/v3/objects/products";

    private static final String URL_SEARCH =
    	    "https://api.hubapi.com/crm/v3/objects/products/search";



    @Override
    public void onTime(ScheduledActionContext ctx) {

        JdbcWrapper jdbc = null;
        NativeSql sql = null;
        java.sql.ResultSet rs = null;

        try {
            EntityFacade dwf = EntityFacadeFactory.getDWFFacade();
            jdbc = dwf.getJdbcWrapper();
            jdbc.openSession();

            sql = new NativeSql(jdbc);
            sql.appendSql("SELECT \r\n"
            		+ "    EST.CODPROD,\r\n"
            		+ "    PRO.DESCRPROD,\r\n"
            		+ "    PRO.COMPLDESC,\r\n"
            		+ "    PRO.MARCA,\r\n"
            		+ "    PRO.ATIVO,\r\n"
            		+ "    PRO.REFERENCIA,\r\n"
            		+ "    PRO.CODVOL,\r\n"
            		+ "    EST.CODEMP,\r\n"
            		+ "    EMP.NOMEFANTASIA,\r\n"
            		+ "    EST.CONTROLE,\r\n"
            		+ "    NVL(SUM(EST.ESTOQUE), 0) AS ESTOQUE,\r\n"
            		+ "    NVL(SUM(EST.RESERVADO), 0) AS RESERVADO,\r\n"
            		+ "    (NVL(SUM(EST.ESTOQUE), 0) - NVL(SUM(EST.RESERVADO), 0)) AS ESTOQUE_REAL\r\n"
            		+ "FROM TGFEST EST\r\n"
            		+ "INNER JOIN TGFPRO PRO ON PRO.CODPROD = EST.CODPROD\r\n"
            		+ "INNER JOIN TSIEMP EMP ON EMP.CODEMP = EST.CODEMP\r\n"
            		+ "WHERE PRO.ATIVO = 'S' AND EST.ESTOQUE > 0 AND EST.CODLOCAL = 101000 AND PRO.CODPROD IN (16303,72,74,80,81,4723)\r\n"
            		+ "GROUP BY \r\n"
            		+ "    EST.CODPROD,\r\n"
            		+ "    PRO.DESCRPROD,\r\n"
            		+ "    PRO.MARCA,\r\n"
            		+ "    PRO.REFERENCIA,\r\n"
            		+ "    PRO.CODVOL,\r\n"
            		+ "    PRO.COMPLDESC,\r\n"
            		+ "    EST.CONTROLE,\r\n"
            		+ "    EST.CODEMP,\r\n"
            		+ "    PRO.ATIVO,\r\n"
            		+ "    EMP.NOMEFANTASIA\r\n"
            		+ "ORDER BY \r\n"
            		+ "    PRO.DESCRPROD");

            rs = sql.executeQuery();
            int criados = 0;
            int atualizados = 0;

            while (rs.next()) {

                BigDecimal codProd = rs.getBigDecimal("CODPROD");
                String descrprod = rs.getString("DESCRPROD");
                String compldesc = rs.getString("COMPLDESC");
                String referencia = rs.getString("REFERENCIA");
                String empresa = rs.getString("NOMEFANTASIA");
                String ativo = rs.getString("ATIVO");
                String codVol = rs.getString("CODVOL");
                String controle = rs.getString("CONTROLE");
                BigDecimal codEmp = rs.getBigDecimal("CODEMP");
                BigDecimal estoqueReal = rs.getBigDecimal("ESTOQUE_REAL");

                // ========= CHAVE ÚNICA =========
                
                String controleNormalizado =
                	    (controle == null || controle.trim().isEmpty())
                	        ? "#"
                	        : controle.trim();

                	String chaveUnica =
                	    codProd + controleNormalizado +  codEmp;

                
                ctx.log("chave → 2026 " + chaveUnica);


                // ========= JSON =========
                JSONObject properties = new JSONObject();
                properties.put("name", descrprod);
                properties.put("codprod", codProd);
                properties.put("descrprod", v(descrprod));
                properties.put("complemento_snk", v(compldesc));
                properties.put("referencia_ean", v(referencia));
                properties.put("codemp", codEmp);
                properties.put("nomefantasia", v(empresa));
                properties.put("estoque_snk", estoqueReal);
                properties.put("ativo", ativo.equals("S") ? true : false);
                properties.put("codvol", v(codVol));
                properties.put("controle", v(controle));
                properties.put("hs_sku", chaveUnica);   


                JSONObject payload = new JSONObject();
                payload.put("properties", properties);

                // ========= UPSERT =========
                String hubspotId =
                        buscarProdutoPorChave(chaveUnica, ctx);

                if (hubspotId != null) {
                    boolean ok = atualizarProduto(hubspotId, payload.toString(), ctx);
                    if (ok) {
                        atualizados++;
                        ctx.log("Produto atualizado 2027 " + chaveUnica);
                    }
                } else {
                    hubspotId = criarProduto(payload.toString(), ctx);
                    ctx.log("Produto criado 2027  " + chaveUnica +
                            " | HubSpot ID: " + hubspotId);
                    
                    criados++;
                    
                    if (hubspotId != null) {
                    	NativeSql upd = new NativeSql(jdbc);
                        upd.appendSql(
                            "UPDATE TGFPRO SET CULTURA = '" + hubspotId +
                            "' WHERE CODPROD = " + codProd
                        );
                        upd.executeUpdate();

                        criados++;
                    }
                }
            }

            ctx.log("=== FINALIZADO 2027 === Criados: " + criados +
                    " | Atualizados: " + atualizados);

        } catch (Exception e) {
            ctx.log("ERRO CRÍTICO: " + e.getMessage());
            e.printStackTrace();
        } finally {
            try { if (rs != null) rs.close(); } catch (Exception ignored) {}
            if (sql != null) NativeSql.releaseResources(sql);
            if (jdbc != null) try { jdbc.closeSession(); } catch (Exception ignored) {}
        }
    }

    
    private String v(String s) {
        return (s == null || s.trim().isEmpty()) ? "" : s.trim();
    }

    // =====================================================
    // SEARCH
    // =====================================================
    private String buscarProdutoPorChave(String chave, ScheduledActionContext ctx) {

        try {
            HttpURLConnection conn =
                (HttpURLConnection) new URL(URL_SEARCH).openConnection();

            conn.setRequestMethod("POST");
            conn.setRequestProperty("Authorization", Auth.TOKEN);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);

            JSONObject filter = new JSONObject()
                .put("propertyName", "hs_sku")
                .put("operator", "EQ")
                .put("value", chave);

            JSONObject payload = new JSONObject()
                .put("filterGroups", new JSONArray()
                    .put(new JSONObject().put("filters",
                        new JSONArray().put(filter))))
                .put("limit", 1);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.toString().getBytes(StandardCharsets.UTF_8));
            }

            if (conn.getResponseCode() == 200) {
                BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
                );

                StringBuilder resp = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) resp.append(line);
                br.close();

                JSONObject json = new JSONObject(resp.toString());
                if (json.getInt("total") > 0) {
                    return json.getJSONArray("results")
                               .getJSONObject(0)
                               .getString("id");
                }
            }
        } catch (Exception e) {
            ctx.log("Erro SEARCH produto: " + e.getMessage());
        }
        return null;
    }

    // =====================================================
    // PATCH
    // =====================================================
    private boolean atualizarProduto(String id, String payload,
            ScheduledActionContext ctx) {

        HttpURLConnection conn = null;

        try {
            URL url = new URL(URL_BASE + "/" + id);
            conn = (HttpURLConnection) url.openConnection();

            // PATCH via override (compatível com Java 8)
            conn.setRequestMethod("POST");
            conn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
            conn.setRequestProperty("Authorization", Auth.TOKEN);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            ctx.log("PATCH HubSpot status: " + code);

            return code == 200 || code == 204;

        } catch (Exception e) {
            ctx.log("Erro PATCH produto: " + e.getMessage());
            return false;

        } finally {
            if (conn != null) {
                conn.disconnect();
            }
        }
    }



    // =====================================================
    // POST
    // =====================================================
    private String criarProduto(String payload, ScheduledActionContext ctx) {

        try {
            HttpURLConnection conn =
                (HttpURLConnection) new URL(URL_BASE).openConnection();

            conn.setRequestMethod("POST");
            conn.setRequestProperty("Authorization", Auth.TOKEN);
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(payload.getBytes(StandardCharsets.UTF_8));
            }

            if (conn.getResponseCode() == 201) {
                BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
                );
                StringBuilder resp = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) resp.append(line);
                br.close();

                return new JSONObject(resp.toString()).getString("id");
            }
        } catch (Exception e) {
            ctx.log("Erro POST produto: " + e.getMessage());
        }
        return null;
    }

    // =====================================================
    // ERP UPDATE
    // =====================================================
    /*private void salvarIdNoERP(JdbcWrapper jdbc,
                              BigDecimal codProd,
                              String hubspotId) throws Exception {

        NativeSql upd = new NativeSql(jdbc);
        upd.appendSql(
            "UPDATE TGFPRO SET CULTURA = '" + hubspotId +
            "' WHERE CODPROD = " + codProd
        );
        upd.executeUpdate();
    }*/
}
