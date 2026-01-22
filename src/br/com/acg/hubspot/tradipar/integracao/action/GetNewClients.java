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
import br.com.sankhya.jape.bmp.PersistentLocalEntity;
import br.com.sankhya.jape.dao.JdbcWrapper;
import br.com.sankhya.jape.sql.NativeSql;
import br.com.sankhya.jape.vo.DynamicVO;
import br.com.sankhya.jape.vo.EntityVO;
import br.com.sankhya.modelcore.util.EntityFacadeFactory;

/**
 * Inbound Partner Sync - HubSpot Companies to Sankhya Partners.
 * Implements Self-Protection: CNPJ validation and duplicate check.
 * Implements Closed-Loop: CODPARC feedback to HubSpot.
 * 
 * @author ACG HubSpot Integration
 * @version 2.0 - Phase 1 Foundation
 */
public class GetNewClients implements ScheduledAction {

    private static final String URL_SEARCH = Auth.HUBSPOT_BASE_URL + "/crm/v3/objects/companies/search";
    private static final String URL_BASE = Auth.HUBSPOT_BASE_URL + "/crm/v3/objects/companies";

    // Default codes for new partners
    private static final int DEFAULT_CODCID = 3344;   // Belo Horizonte
    private static final int DEFAULT_CODBAI = 18419;  // Centro
    private static final int DEFAULT_CODEND = 1;      // Default address

    @Override
    public void onTime(ScheduledActionContext ctx) {

        JdbcWrapper jdbc = null;

        try {
            ctx.log("=== INICIO INBOUND PARCEIROS v2.0 ===");
            
            EntityFacade dwf = EntityFacadeFactory.getDWFFacade();
            jdbc = dwf.getJdbcWrapper();
            jdbc.openSession();

            // Fetch companies from HubSpot where sankhya_codparc is null
            JSONArray companies = fetchPendingCompanies(ctx);
            
            if (companies == null || companies.length() == 0) {
                ctx.log("Nenhuma empresa pendente encontrada no HubSpot.");
                return;
            }

            ctx.log("Empresas pendentes encontradas: " + companies.length());

            int criados = 0;
            int duplicados = 0;
            int erros = 0;

            for (int i = 0; i < companies.length(); i++) {
                try {
                    JSONObject company = companies.getJSONObject(i);
                    String hubspotId = company.getString("id");
                    JSONObject properties = company.getJSONObject("properties");

                    String name = properties.optString("name", "");
                    String cnpj = properties.optString("cnpj", "");
                    String phone = properties.optString("phone", "");
                    String address = properties.optString("address", "");
                    String city = properties.optString("city", "");
                    String zip = properties.optString("zip", "");

                    // Self-Protection: Validate CNPJ
                    String cnpjClean = cleanCnpjCpf(cnpj);
                    if (!isValidCnpj(cnpjClean)) {
                        ctx.log("[SKIP] CNPJ inválido: " + cnpj + " | Empresa: " + name);
                        erros++;
                        continue;
                    }

                    // Self-Protection: Check for duplicates
                    BigDecimal existingCodParc = findPartnerByCnpj(jdbc, cnpjClean, ctx);
                    if (existingCodParc != null) {
                        ctx.log("[DUPLICADO] CNPJ já existe: " + cnpjClean + " | CODPARC=" + existingCodParc);
                        // Still update HubSpot with existing CODPARC
                        updateHubspotWithCodparc(hubspotId, existingCodParc, ctx);
                        duplicados++;
                        continue;
                    }

                    // Create new Partner in Sankhya
                    BigDecimal newCodParc = createPartner(dwf, name, cnpjClean, phone, address, city, zip, ctx);

                    if (newCodParc != null) {
                        // Closed-Loop: Update HubSpot with new CODPARC
                        updateHubspotWithCodparc(hubspotId, newCodParc, ctx);
                        criados++;
                        ctx.log("[CREATE] " + name + " | CODPARC=" + newCodParc);
                    } else {
                        erros++;
                    }

                } catch (Exception e) {
                    erros++;
                    ctx.log("[ERRO] Empresa: " + e.getMessage());
                }
            }

            ctx.log("=== FIM INBOUND PARCEIROS ===");
            ctx.log("Criados: " + criados + " | Duplicados: " + duplicados + " | Erros: " + erros);

        } catch (Exception e) {
            ctx.log("ERRO CRITICO: " + e.getMessage());
            e.printStackTrace();
        } finally {
            if (jdbc != null) try { jdbc.closeSession(); } catch (Exception ignored) {}
        }
    }

    /**
     * Fetches companies from HubSpot where sankhya_codparc property is empty.
     */
    private JSONArray fetchPendingCompanies(ScheduledActionContext ctx) {
        try {
            JSONObject filter = new JSONObject()
                .put("propertyName", "sankhya_codparc")
                .put("operator", "NOT_HAS_PROPERTY");

            JSONObject payload = new JSONObject()
                .put("filterGroups", new JSONArray()
                    .put(new JSONObject().put("filters", new JSONArray().put(filter))))
                .put("properties", new JSONArray()
                    .put("name").put("cnpj").put("phone")
                    .put("address").put("city").put("zip"))
                .put("limit", 50);

            String response = HubSpotClient.post(URL_SEARCH, payload.toString(), ctx);
            
            if (response != null) {
                JSONObject json = new JSONObject(response);
                return json.getJSONArray("results");
            }
        } catch (Exception e) {
            ctx.log("[FETCH ERROR] " + e.getMessage());
        }
        return null;
    }

    /**
     * Finds existing partner by CNPJ/CPF.
     */
    private BigDecimal findPartnerByCnpj(JdbcWrapper jdbc, String cnpj, ScheduledActionContext ctx) {
        NativeSql sql = null;
        ResultSet rs = null;
        try {
            sql = new NativeSql(jdbc);
            sql.appendSql("SELECT CODPARC FROM TGFPAR WHERE REPLACE(REPLACE(REPLACE(CGC_CPF,'.',''),'-',''),'/','') = '" + cnpj + "'");
            rs = sql.executeQuery();
            
            if (rs.next()) {
                return rs.getBigDecimal("CODPARC");
            }
        } catch (Exception e) {
            ctx.log("[DB ERROR] " + e.getMessage());
        } finally {
            try { if (rs != null) rs.close(); } catch (Exception ignored) {}
            if (sql != null) NativeSql.releaseResources(sql);
        }
        return null;
    }

    /**
     * Creates a new Partner (Parceiro) entity in Sankhya.
     */
    private BigDecimal createPartner(EntityFacade dwf, String name, String cnpj,
            String phone, String address, String city, String zip,
            ScheduledActionContext ctx) {
        try {
            DynamicVO parceiroVO = (DynamicVO) dwf.getDefaultValueObjectInstance("Parceiro");

            parceiroVO.setProperty("NOMEPARC", truncate(name, 100));
            parceiroVO.setProperty("RAZAOSOCIAL", truncate(name, 100));
            parceiroVO.setProperty("CGC_CPF", formatCnpj(cnpj));
            parceiroVO.setProperty("TIPPESSOA", "J");  // Juridica
            parceiroVO.setProperty("CLIENTE", "S");
            parceiroVO.setProperty("ATIVO", "S");
            parceiroVO.setProperty("TELEFONE", truncate(phone, 15));
            parceiroVO.setProperty("CEP", truncate(zip, 10));
            
            // Default location codes
            parceiroVO.setProperty("CODCID", new BigDecimal(DEFAULT_CODCID));
            parceiroVO.setProperty("CODBAI", new BigDecimal(DEFAULT_CODBAI));
            parceiroVO.setProperty("CODEND", new BigDecimal(DEFAULT_CODEND));

            PersistentLocalEntity created = dwf.createEntity("Parceiro", (EntityVO) parceiroVO);
            DynamicVO newVO = (DynamicVO) created.getValueObject();
            
            return newVO.asBigDecimal("CODPARC");

        } catch (Exception e) {
            ctx.log("[CREATE PARTNER ERROR] " + e.getMessage());
            return null;
        }
    }

    /**
     * Updates HubSpot company with the Sankhya CODPARC (Closed-Loop).
     */
    private void updateHubspotWithCodparc(String hubspotId, BigDecimal codparc, ScheduledActionContext ctx) {
        try {
            JSONObject properties = new JSONObject()
                .put("sankhya_codparc", codparc.toString());

            JSONObject payload = new JSONObject()
                .put("properties", properties);

            String url = URL_BASE + "/" + hubspotId;
            HubSpotClient.patch(url, payload.toString(), ctx);

        } catch (Exception e) {
            ctx.log("[HUBSPOT UPDATE ERROR] " + e.getMessage());
        }
    }

    /**
     * Removes formatting from CNPJ/CPF.
     */
    private String cleanCnpjCpf(String value) {
        if (value == null) return "";
        return value.replaceAll("[^0-9]", "");
    }

    /**
     * Validates CNPJ format (14 digits).
     */
    private boolean isValidCnpj(String cnpj) {
        if (cnpj == null || cnpj.isEmpty()) return false;
        return cnpj.length() == 14;
    }

    /**
     * Formats CNPJ to standard XX.XXX.XXX/XXXX-XX.
     */
    private String formatCnpj(String cnpj) {
        if (cnpj == null || cnpj.length() != 14) return cnpj;
        return cnpj.substring(0, 2) + "." +
               cnpj.substring(2, 5) + "." +
               cnpj.substring(5, 8) + "/" +
               cnpj.substring(8, 12) + "-" +
               cnpj.substring(12, 14);
    }

    /**
     * Truncates string to max length.
     */
    private String truncate(String s, int maxLen) {
        if (s == null) return "";
        return s.length() > maxLen ? s.substring(0, maxLen) : s;
    }
}
