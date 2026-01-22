package br.com.acg.hubspot.tradipar.integracao.action;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.net.HttpURLConnection;
import java.net.URL;
import java.sql.ResultSet;

import org.cuckoo.core.ScheduledAction;
import org.cuckoo.core.ScheduledActionContext;
import org.json.JSONArray;
import org.json.JSONObject;

import br.com.acg.hubspot.tradipar.integracao.config.Auth;
import br.com.sankhya.jape.EntityFacade;
import br.com.sankhya.jape.bmp.PersistentLocalEntity;
import br.com.sankhya.jape.dao.JdbcWrapper;
import br.com.sankhya.jape.sql.NativeSql;
import br.com.sankhya.jape.vo.DynamicVO;
import br.com.sankhya.jape.vo.EntityVO;
import br.com.sankhya.modelcore.util.EntityFacadeFactory;

public class GetPartnersPf implements ScheduledAction {

    @Override
    public void onTime(ScheduledActionContext ctx) {
    	
        EntityFacade dwfEntityFacade = EntityFacadeFactory.getDWFFacade();
        JdbcWrapper jdbc = dwfEntityFacade.getJdbcWrapper();
        
        NativeSql sql = null;
        
        ResultSet rs = null;

        try {

            EntityFacade dwf = EntityFacadeFactory.getDWFFacade();

            // ====== CHAMADA HTTP ======
            String urlStr = Auth.HUBSPOT_BASE_URL + "/crm/v3/objects/contacts";
            URL url = new URL(urlStr);

            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setRequestMethod("GET");
            conn.setRequestProperty("Authorization", Auth.getHubspotToken());
            conn.setRequestProperty("Content-Type", "application/json");

            BufferedReader br = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder jsonSb = new StringBuilder();

            String line;
            while ((line = br.readLine()) != null) {
                jsonSb.append(line);
            }
            br.close();

            JSONObject result = new JSONObject(jsonSb.toString());
            JSONArray results = result.getJSONArray("results");

            ctx.log("Total de Contatos retornados: " + results.length());

            
            for (int i = 0; i < results.length(); i++) {
            	      

                JSONObject obj = results.getJSONObject(i);
                JSONObject properties = obj.getJSONObject("properties");
    
                String firstname = properties.optString("firstname", "");           
                String lastname  = properties.optString("lastname", "");              
                String email     = properties.optString("email", "");              
                String codParc = properties.optString("Codparc_ctt", "");
                String sincr = properties.optString("sincr_ctt", "");
           
                                	
                BigDecimal codCtt = null;
                
                jdbc.openSession();
                System.out.println("LOG-010");
                
                sql = new NativeSql(jdbc);
                sql.appendSql("SELECT COUNT(*) + 1 AS CODCONTATO FROM TGFCTT WHERE CODPARC =  35759 ");
                System.out.println("LOG-011");
                rs = sql.executeQuery();
                System.out.println("LOG-012");
                
                if (rs.next()) {
                	codCtt  = rs.getBigDecimal("CODCONTATO");
                }
                
                System.out.println("LOG-013");
                
                
                if (codParc == null || codParc.trim().isEmpty() || codParc.equalsIgnoreCase("null")) {
                    codParc = "35759"; // valor padrão
                }
                
                BigDecimal codParcBD = null;
                if (codParc != null && !codParc.isEmpty()) {
                    codParcBD = new BigDecimal(codParc);
                }
                
                
                DynamicVO parceiroVO = (DynamicVO) dwf.getDefaultValueObjectInstance("Parceiro");
                System.out.println("LOG-014");

                parceiroVO.setProperty("CODPARC", codParcBD);  
                System.out.println("LOG-015");
                parceiroVO.setProperty("NOMEPARC", codCtt); 
                System.out.println("LOG-016");
                parceiroVO.setProperty("RAZAOSOCIAL", firstname + " " + lastname);
                System.out.println("LOG-017");
                parceiroVO.setProperty("EMAIL", email);
                parceiroVO.setProperty("CGC_CPF", email);
                parceiroVO.setProperty("ATIVO", email);
                System.out.println("LOG-018");

                PersistentLocalEntity inserted = dwf.createEntity("Parceiro", (EntityVO) parceiroVO);
                DynamicVO novo = (DynamicVO) inserted.getValueObject();
 
                ctx.log("Contato inserido: CODPARC=" + codParc + " - " + novo.asBigDecimal("CODCONTATO"));
                               
            }

        } catch (Exception e) {
            ctx.log("Erro geral integração HubSpot: " + e.getMessage());
            e.printStackTrace();
        }

    }

}
