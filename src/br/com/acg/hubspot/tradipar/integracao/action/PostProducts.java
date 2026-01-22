package br.com.acg.hubspot.tradipar.integracao.action;

import java.math.BigDecimal;
import java.sql.ResultSet;

import org.cuckoo.core.ScheduledAction;
import org.cuckoo.core.ScheduledActionContext;
import org.json.JSONArray;
import org.json.JSONObject;

import br.com.acg.hubspot.tradipar.integracao.config.Auth;
import br.com.acg.hubspot.tradipar.integracao.util.HubSpotClient;
import br.com.sankhya.jape.EntityFacade;
import br.com.sankhya.jape.dao.JdbcWrapper;
import br.com.sankhya.jape.sql.NativeSql;
import br.com.sankhya.modelcore.util.EntityFacadeFactory;

/**
 * Product Sync with Dynamic Pricing.
 * Uses AD_PRECO_TRADIPAR function for PV1/PV2/PV3 price tables.
 * Implements Closed-Loop: All actions are logged.
 * 
 * @author ACG HubSpot Integration
 * @version 2.0 - Phase 1 Foundation
 */
public class PostProducts implements ScheduledAction {

    private static final String URL_BASE = Auth.HUBSPOT_BASE_URL + Auth.PRODUCTS_ENDPOINT;
    private static final String URL_SEARCH = URL_BASE + "/search";
    
    // Default simulation parameters
    private static final int DEFAULT_CODPARC = 375;  // Default partner for price simulation
    private static final int DEFAULT_CODEMP = 1;     // Default company

    @Override
    public void onTime(ScheduledActionContext ctx) {

        JdbcWrapper jdbc = null;
        NativeSql sql = null;
        ResultSet rs = null;

        try {
            ctx.log("=== INICIO SYNC PRODUTOS v2.0 ===");
            
            EntityFacade dwf = EntityFacadeFactory.getDWFFacade();
            jdbc = dwf.getJdbcWrapper();
            jdbc.openSession();

            sql = new NativeSql(jdbc);
            sql.appendSql(buildProductQuery());

            rs = sql.executeQuery();
            
            int criados = 0;
            int atualizados = 0;
            int erros = 0;

            while (rs.next()) {
                try {
                    BigDecimal codProd = rs.getBigDecimal("CODPROD");
                    String descrprod = rs.getString("DESCRPROD");
                    String referencia = rs.getString("REFERENCIA");
                    String codVol = rs.getString("CODVOL");
                    String marca = rs.getString("MARCA");
                    
                    // Prices from AD_PRECO_TRADIPAR function
                    BigDecimal pv1 = rs.getBigDecimal("PV1");
                    BigDecimal pv2 = rs.getBigDecimal("PV2");
                    BigDecimal pv3 = rs.getBigDecimal("PV3");

                    // Unique key for upsert
                    String sku = "SKU-" + codProd;

                    // Build HubSpot payload
                    JSONObject properties = new JSONObject();
                    properties.put("name", safeString(descrprod));
                    properties.put("hs_sku", sku);
                    properties.put("codprod", codProd);
                    properties.put("referencia_ean", safeString(referencia));
                    properties.put("codvol", safeString(codVol));
                    properties.put("marca", safeString(marca));
                    properties.put("price_pv1", pv1 != null ? pv1 : 0);
                    properties.put("price_pv2", pv2 != null ? pv2 : 0);
                    properties.put("price_pv3", pv3 != null ? pv3 : 0);
                    properties.put("price", pv1 != null ? pv1 : 0); // Default price = PV1

                    JSONObject payload = new JSONObject();
                    payload.put("properties", properties);

                    // Upsert logic: search by SKU then create or update
                    String hubspotId = searchProductBySku(sku, ctx);

                    if (hubspotId != null) {
                        // Update existing
                        String updateUrl = URL_BASE + "/" + hubspotId;
                        String response = HubSpotClient.patch(updateUrl, payload.toString(), ctx);
                        if (response != null) {
                            atualizados++;
                            ctx.log("[UPDATE] CODPROD=" + codProd + " | PV1=" + pv1);
                        } else {
                            erros++;
                        }
                    } else {
                        // Create new
                        String response = HubSpotClient.post(URL_BASE, payload.toString(), ctx);
                        if (response != null) {
                            JSONObject respJson = new JSONObject(response);
                            String newId = respJson.getString("id");
                            criados++;
                            ctx.log("[CREATE] CODPROD=" + codProd + " | HubSpotID=" + newId);
                            
                            // Closed-Loop: Save HubSpot ID back to ERP
                            saveHubspotIdToErp(jdbc, codProd, newId);
                        } else {
                            erros++;
                        }
                    }

                } catch (Exception e) {
                    erros++;
                    ctx.log("[ERRO] Produto: " + e.getMessage());
                }
            }

            ctx.log("=== FIM SYNC PRODUTOS ===");
            ctx.log("Criados: " + criados + " | Atualizados: " + atualizados + " | Erros: " + erros);

        } catch (Exception e) {
            ctx.log("ERRO CRITICO: " + e.getMessage());
            e.printStackTrace();
        } finally {
            try { if (rs != null) rs.close(); } catch (Exception ignored) {}
            if (sql != null) NativeSql.releaseResources(sql);
            if (jdbc != null) try { jdbc.closeSession(); } catch (Exception ignored) {}
        }
    }

    /**
     * Builds the product query with dynamic pricing using AD_PRECO_TRADIPAR function.
     */
    private String buildProductQuery() {
        return "SELECT " +
               "    PRO.CODPROD, " +
               "    PRO.DESCRPROD, " +
               "    PRO.REFERENCIA, " +
               "    PRO.CODVOL, " +
               "    PRO.MARCA, " +
               "    AD_PRECO_TRADIPAR(PRO.CODPROD, " + DEFAULT_CODPARC + ", " + DEFAULT_CODEMP + ", 1) AS PV1, " +
               "    AD_PRECO_TRADIPAR(PRO.CODPROD, " + DEFAULT_CODPARC + ", " + DEFAULT_CODEMP + ", 2) AS PV2, " +
               "    AD_PRECO_TRADIPAR(PRO.CODPROD, " + DEFAULT_CODPARC + ", " + DEFAULT_CODEMP + ", 3) AS PV3 " +
               "FROM TGFPRO PRO " +
               "WHERE PRO.ATIVO = 'S' " +
               "  AND ROWNUM <= 100";  // Limit for safety during development
    }

    /**
     * Searches for a product in HubSpot by SKU.
     */
    private String searchProductBySku(String sku, ScheduledActionContext ctx) {
        try {
            JSONObject filter = new JSONObject()
                .put("propertyName", "hs_sku")
                .put("operator", "EQ")
                .put("value", sku);

            JSONObject payload = new JSONObject()
                .put("filterGroups", new JSONArray()
                    .put(new JSONObject().put("filters", new JSONArray().put(filter))))
                .put("limit", 1);

            String response = HubSpotClient.post(URL_SEARCH, payload.toString(), ctx);
            
            if (response != null) {
                JSONObject json = new JSONObject(response);
                if (json.getInt("total") > 0) {
                    return json.getJSONArray("results")
                               .getJSONObject(0)
                               .getString("id");
                }
            }
        } catch (Exception e) {
            ctx.log("[SEARCH ERROR] " + e.getMessage());
        }
        return null;
    }

    /**
     * Saves the HubSpot ID back to Sankhya (Closed-Loop).
     */
    private void saveHubspotIdToErp(JdbcWrapper jdbc, BigDecimal codProd, String hubspotId) {
        NativeSql upd = null;
        try {
            upd = new NativeSql(jdbc);
            upd.appendSql("UPDATE TGFPRO SET CULTURA = '" + hubspotId + 
                          "' WHERE CODPROD = " + codProd);
            upd.executeUpdate();
        } catch (Exception e) {
            // Log but don't fail the sync
        } finally {
            if (upd != null) NativeSql.releaseResources(upd);
        }
    }

    /**
     * Safe string helper to handle nulls.
     */
    private String safeString(String s) {
        return (s == null || s.trim().isEmpty()) ? "" : s.trim();
    }
}
