package br.com.acg.hubspot.tradipar.integracao.config;

import java.sql.ResultSet;

import br.com.sankhya.jape.EntityFacade;
import br.com.sankhya.jape.dao.JdbcWrapper;
import br.com.sankhya.jape.sql.NativeSql;
import br.com.sankhya.modelcore.util.EntityFacadeFactory;

/**
 * Authentication configuration for HubSpot API.
 * Implements Self-Configuration: Token retrieved dynamically from TSIPAR.
 * 
 * @author ACG HubSpot Integration
 * @version 2.0 - Phase 1 Foundation
 */
public class Auth {

    // API Base URLs
    public static final String HUBSPOT_BASE_URL = "https://api.hubapi.com";
    public static final String CONTACTS_ENDPOINT = "/crm/v3/objects/contacts";
    public static final String COMPANIES_ENDPOINT = "/crm/v3/objects/companies";
    public static final String PRODUCTS_ENDPOINT = "/crm/v3/objects/products";
    
    // Parameter key in TSIPAR
    private static final String TOKEN_PARAM_KEY = "HUBSPOTTOKEN";
    
    // Cached token (avoid repeated DB calls)
    private static String cachedToken = null;
    private static long cacheExpiry = 0;
    private static final long CACHE_DURATION_MS = 300000; // 5 minutes

    /**
     * Retrieves the HubSpot Bearer token from Sankhya's TSIPAR table.
     * Implements caching to reduce database load.
     * 
     * @return Bearer token string (includes "Bearer " prefix)
     * @throws RuntimeException if token cannot be retrieved
     */
    public static String getHubspotToken() {
        
        // Check cache validity
        if (cachedToken != null && System.currentTimeMillis() < cacheExpiry) {
            return cachedToken;
        }
        
        String token = null;
        
        // Primary: Try ParameterUtils (Sankhya standard)
        try {
            Object paramValue = br.com.sankhya.modelcore.util.ParameterUtils
                .getParameter(TOKEN_PARAM_KEY);
            if (paramValue != null) {
                token = paramValue.toString().trim();
            }
        } catch (Exception e) {
            // Fallback to NativeSql
        }
        
        // Fallback: Direct query to TSIPAR
        if (token == null || token.isEmpty()) {
            token = getTokenFromTsipar();
        }
        
        if (token == null || token.isEmpty()) {
            throw new RuntimeException(
                "HUBSPOTTOKEN não configurado em TSIPAR. " +
                "Execute: INSERT INTO TSIPAR (CHAVE, TEXTO) VALUES ('HUBSPOTTOKEN', 'pat-na1-xxx')"
            );
        }
        
        // Format with Bearer prefix if not present
        if (!token.startsWith("Bearer ")) {
            token = "Bearer " + token;
        }
        
        // Update cache
        cachedToken = token;
        cacheExpiry = System.currentTimeMillis() + CACHE_DURATION_MS;
        
        return cachedToken;
    }
    
    /**
     * Direct query fallback to TSIPAR table.
     */
    private static String getTokenFromTsipar() {
        
        JdbcWrapper jdbc = null;
        NativeSql sql = null;
        ResultSet rs = null;
        
        try {
            EntityFacade dwf = EntityFacadeFactory.getDWFFacade();
            jdbc = dwf.getJdbcWrapper();
            jdbc.openSession();
            
            sql = new NativeSql(jdbc);
            sql.appendSql("SELECT TEXTO FROM TSIPAR WHERE CHAVE = '" + TOKEN_PARAM_KEY + "'");
            rs = sql.executeQuery();
            
            if (rs.next()) {
                return rs.getString("TEXTO");
            }
            
        } catch (Exception e) {
            // Log error but don't throw - let caller handle null
        } finally {
            try { if (rs != null) rs.close(); } catch (Exception ignored) {}
            if (sql != null) NativeSql.releaseResources(sql);
            if (jdbc != null) try { jdbc.closeSession(); } catch (Exception ignored) {}
        }
        
        return null;
    }
    
    /**
     * Clears the token cache. Useful for testing or after token rotation.
     */
    public static void clearCache() {
        cachedToken = null;
        cacheExpiry = 0;
    }
}
