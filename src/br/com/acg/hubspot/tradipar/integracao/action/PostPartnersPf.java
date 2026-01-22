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

public class PostPartnersPf implements ScheduledAction {

    private static final String URL_BASE =
        "https://api.hubapi.com/crm/v3/objects/contacts";

    private static final String URL_SEARCH =
        "https://api.hubapi.com/crm/v3/objects/contacts/search";

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
            sql.appendSql("SELECT PAR.CODPARC, \r\n"
            		+ "       PAR.NOMEPARC, \r\n"
            		+ "       PAR.EMAIL, \r\n"
            		+ "       PAR.CGC_CPF, \r\n"
            		+ "       PAR.TELEFONE, \r\n"
            		+ "       PAR.ATIVO,\r\n"
            		+ "       PAR.TIPPESSOA,\r\n"
            		+ "       EDR.TIPO || ' ' || EDR.NOMEEND AS ENDERECO,\r\n"
            		+ "       BAI.NOMEBAI,\r\n"
            		+ "       CID.NOMECID,\r\n"
            		+ "       PAR.NUMEND,\r\n"
            		+ "       PAR.LIMCRED,\r\n"
            		+ "       PAR.CODVEND, \r\n"
            		+ "       VEN.APELIDO\r\n"
            		+ "\r\n"
            		+ "\r\n"
            		+ "                \r\n"
            		+ "\r\n"
            		+ "FROM TGFPAR PAR\r\n"
            		+ "\r\n"
            		+ "INNER JOIN TSIEND EDR ON EDR.CODEND = PAR.CODEND\r\n"
            		+ "INNER JOIN TSICID CID ON CID.CODCID = PAR.CODCID\r\n"
            		+ "INNER JOIN TSIBAI BAI ON BAI.CODBAI = PAR.CODBAI\r\n"
            		+ "INNER JOIN TGFVEN VEN ON VEN.CODVEND = PAR.CODVEND\r\n"
            		+ "\r\n"
            		+ "WHERE TIPPESSOA = 'F' AND PAR.CODPARC IN (46807,\r\n"
            		+ "5627,\r\n"
            		+ "9875,\r\n"
            		+ "694,\r\n"
            		+ "9734,\r\n"
            		+ "12057,\r\n"
            		+ "8814,\r\n"
            		+ "43904,\r\n"
            		+ "43804,\r\n"
            		+ "11203,\r\n"
            		+ "10490,\r\n"
            		+ "12982,\r\n"
            		+ "3089,\r\n"
            		+ "4440,\r\n"
            		+ "721)");

            rs = sql.executeQuery();

            int criados = 0;
            int atualizados = 0;

            while (rs.next()) {

                BigDecimal codParc = rs.getBigDecimal("CODPARC");
                BigDecimal codVend = rs.getBigDecimal("CODVEND");
                BigDecimal limCred = rs.getBigDecimal("LIMCRED");
                String nome = rs.getString("NOMEPARC");
                String cpf = rs.getString("CGC_CPF");
                String emailBanco = rs.getString("EMAIL");
                String telefone = rs.getString("TELEFONE");
                String ativo = rs.getString("ATIVO");
                String tipPessoa = rs.getString("TIPPESSOA");
                String endereco = rs.getString("ENDERECO");
                String numEnd = rs.getString("NUMEND");
                String nomebai = rs.getString("NOMEBAI");
                String nomecid = rs.getString("NOMECID");
                

                // ===== EMAIL (CHAVE ÚNICA) =====
                String email =
                    (emailBanco == null || emailBanco.trim().isEmpty())
                        ? "parc" + codParc + "@tradipar.com"
                        : emailBanco.trim().toLowerCase();

                ctx.log("Contato → " + email);
                
                
                
                if ("F".equals(tipPessoa)) {
                	tipPessoa = "Física";
                } else if ("J".equals(tipPessoa)) {
                	tipPessoa = "Jurídica";
                }

                // ===== JSON =====
                JSONObject properties = new JSONObject();
                ctx.log("KZKZ");
                properties.put("email", email);
                properties.put("firstname", v(nome));
                properties.put("cpf", v(cpf));
                properties.put("phone", v(telefone));
                properties.put("codparc_ctt", codParc);
                properties.put("codvend", codVend);
                properties.put("address", endereco);
                properties.put("limite_de_credito", limCred);
                properties.put("city", nomecid);
                properties.put("bairro", nomebai);
                properties.put("numero_do_endereco", numEnd);
                properties.put("tipo_de_pessoa", tipPessoa);
                properties.put("ativo_sankhya", ativo.equals("S"));
                ctx.log("KZKZ");
                JSONObject payload = new JSONObject();
                ctx.log("KZKZ");
                payload.put("properties", properties);
                ctx.log("KZKZ");

                // ===== UPSERT =====
                String hubspotId = buscarContatoPorEmail(email, ctx);

                if (hubspotId != null) {
                	ctx.log("KZKZ1");
                    boolean ok = atualizarContatoPorEmail(email, payload.toString(), ctx);
                    ctx.log("KZKZ2");
                    if (ok) {
                    	ctx.log("KZKZ3");
                        atualizados++;
                        ctx.log("Contato atualizado " + email);
                    }
                    ctx.log("KZKZ4");
                } else {
                	ctx.log("KZKZ5");
                    hubspotId = criarContato(payload.toString(), ctx);
                    ctx.log("KZKZ6");
                    if (hubspotId != null) {
                    	ctx.log("KZKZ7");
                        criados++;
                        ctx.log("Contato criado " + email +
                                " | HubSpot ID: " + hubspotId);
                    } 
                    ctx.log("KZKZ8");
                }
            }

            ctx.log("=== FINALIZADO === Criados: " + criados +
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
    private String buscarContatoPorEmail(String email,
            ScheduledActionContext ctx) {

        try {
            HttpURLConnection conn =
                (HttpURLConnection) new URL(URL_SEARCH).openConnection();

            conn.setRequestMethod("POST");
            conn.setRequestProperty("Authorization", Auth.getHubspotToken());
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);

            JSONObject filter = new JSONObject()
                .put("propertyName", "email")
                .put("operator", "EQ")
                .put("value", email);

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
            ctx.log("Erro SEARCH contato: " + e.getMessage());
        }
        return null;
    }

    // =====================================================
    // PATCH
    // =====================================================
    private boolean atualizarContatoPorEmail(
            String email,
            String payloadCreateJson,
            ScheduledActionContext ctx) {

        HttpURLConnection conn = null;

        try {
            // extrai SOMENTE o objeto properties do payload de create
            JSONObject createPayload = new JSONObject(payloadCreateJson);
            JSONObject propertiesOnly = createPayload.getJSONObject("properties");

            URL url = new URL(
                "https://api.hubapi.com/crm/v3/objects/contacts/batch/update"
            );

            conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("POST");
            conn.setRequestProperty("Authorization", Auth.getHubspotToken());
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);

            // monta payload batch CORRETO
            JSONObject batchPayload = new JSONObject()
                .put("inputs", new JSONArray().put(
                    new JSONObject()
                        .put("idProperty", "email")
                        .put("id", email)
                        .put("properties", propertiesOnly)
                ));

            ctx.log("Payload UPDATE HubSpot >>> " + batchPayload);

            try (OutputStream os = conn.getOutputStream()) {
                os.write(batchPayload.toString().getBytes(StandardCharsets.UTF_8));
            }

            int code = conn.getResponseCode();
            ctx.log("POST HubSpot update contato (batch) status: " + code);

            return code == 200;

        } catch (Exception e) {
            ctx.log("Erro UPDATE contato HubSpot: " + e.getMessage());
            return false;

        } finally {
            if (conn != null) conn.disconnect();
        }
    }







    // =====================================================
    // POST
    // =====================================================
    private String criarContato(String payload,
            ScheduledActionContext ctx) {
    	ctx.log("LOGKZ1");

        try {
            HttpURLConnection conn =
                (HttpURLConnection) new URL(URL_BASE).openConnection();
            ctx.log("LOGKZ2");

            conn.setRequestMethod("POST");
            conn.setRequestProperty("Authorization", Auth.getHubspotToken());
            conn.setRequestProperty("Content-Type", "application/json");
            conn.setDoOutput(true);
            ctx.log("LOGKZ3");
            try (OutputStream os = conn.getOutputStream()) {
            	ctx.log("LOGKZ4");
                os.write(payload.getBytes(StandardCharsets.UTF_8));
                ctx.log("LOGKZ5");
            }

            if (conn.getResponseCode() == 201) {
            	ctx.log("LOGKZ6");
                BufferedReader br = new BufferedReader(
                    new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8)
                );
                ctx.log("LOGKZ7");

                StringBuilder resp = new StringBuilder();
                String line;
                while ((line = br.readLine()) != null) resp.append(line);
                br.close();
                ctx.log("LOGKZ8");
                return new JSONObject(resp.toString()).getString("id");
                
            }
            ctx.log("LOGKZ9");
        } catch (Exception e) {
        	ctx.log("LOGKZ10");
            ctx.log("Erro POST contato: " + e.getMessage());
        }
        return null;
    }
}
