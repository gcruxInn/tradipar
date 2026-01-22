package br.com.acg.hubspot.tradipar.integracao.util;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

import org.cuckoo.core.ScheduledActionContext;

import br.com.acg.hubspot.tradipar.integracao.config.Auth;

/**
 * Resilient HTTP Client for HubSpot API.
 * Implements Self-Healing: Automatic retry on 429/5xx errors.
 * 
 * @author ACG HubSpot Integration
 * @version 2.0 - Phase 1 Foundation
 */
public class HubSpotClient {

    private static final int MAX_RETRIES = 3;
    private static final int RETRY_DELAY_MS = 1000;
    private static final int CONNECT_TIMEOUT_MS = 10000;
    private static final int READ_TIMEOUT_MS = 30000;

    /**
     * Executes a GET request to HubSpot API.
     * 
     * @param endpoint Full URL endpoint
     * @param ctx ScheduledActionContext for logging (can be null)
     * @return Response body as String, or null on failure
     */
    public static String get(String endpoint, ScheduledActionContext ctx) {
        return executeWithRetry("GET", endpoint, null, ctx);
    }

    /**
     * Executes a POST request to HubSpot API.
     * 
     * @param endpoint Full URL endpoint
     * @param jsonPayload JSON body to send
     * @param ctx ScheduledActionContext for logging
     * @return Response body as String, or null on failure
     */
    public static String post(String endpoint, String jsonPayload, ScheduledActionContext ctx) {
        return executeWithRetry("POST", endpoint, jsonPayload, ctx);
    }

    /**
     * Executes a PATCH request using X-HTTP-Method-Override (Java 8 compatible).
     * 
     * @param endpoint Full URL endpoint
     * @param jsonPayload JSON body to send
     * @param ctx ScheduledActionContext for logging
     * @return Response body as String, or null on failure
     */
    public static String patch(String endpoint, String jsonPayload, ScheduledActionContext ctx) {
        return executeWithRetry("PATCH", endpoint, jsonPayload, ctx);
    }

    /**
     * Core execution method with retry logic for resilience.
     */
    private static String executeWithRetry(String method, String endpoint, 
            String jsonPayload, ScheduledActionContext ctx) {

        int attempts = 0;
        String lastError = null;

        while (attempts < MAX_RETRIES) {
            attempts++;
            HttpURLConnection conn = null;

            try {
                URL url = new URL(endpoint);
                conn = (HttpURLConnection) url.openConnection();

                // Configure connection
                conn.setConnectTimeout(CONNECT_TIMEOUT_MS);
                conn.setReadTimeout(READ_TIMEOUT_MS);
                conn.setRequestProperty("Authorization", Auth.getHubspotToken());
                conn.setRequestProperty("Content-Type", "application/json");

                // Handle PATCH via override (Java 8 compatibility)
                if ("PATCH".equals(method)) {
                    conn.setRequestMethod("POST");
                    conn.setRequestProperty("X-HTTP-Method-Override", "PATCH");
                } else {
                    conn.setRequestMethod(method);
                }

                // Send body for POST/PATCH
                if (jsonPayload != null && ("POST".equals(method) || "PATCH".equals(method))) {
                    conn.setDoOutput(true);
                    try (OutputStream os = conn.getOutputStream()) {
                        os.write(jsonPayload.getBytes(StandardCharsets.UTF_8));
                    }
                }

                int responseCode = conn.getResponseCode();

                // Success cases
                if (responseCode >= 200 && responseCode < 300) {
                    return readResponse(conn);
                }

                // Retry on rate limit or server errors
                if (responseCode == 429 || responseCode >= 500) {
                    lastError = "HTTP " + responseCode;
                    log(ctx, "[HubSpotClient] Tentativa " + attempts + "/" + MAX_RETRIES + 
                        " falhou: " + lastError + ". Aguardando retry...");
                    
                    if (attempts < MAX_RETRIES) {
                        Thread.sleep(RETRY_DELAY_MS * attempts); // Exponential backoff
                    }
                    continue;
                }

                // Client errors (4xx except 429) - don't retry
                lastError = "HTTP " + responseCode + ": " + readErrorResponse(conn);
                log(ctx, "[HubSpotClient] Erro cliente: " + lastError);
                return null;

            } catch (Exception e) {
                lastError = e.getMessage();
                log(ctx, "[HubSpotClient] Tentativa " + attempts + " exception: " + lastError);
                
                if (attempts < MAX_RETRIES) {
                    try { Thread.sleep(RETRY_DELAY_MS); } catch (InterruptedException ie) {}
                }
            } finally {
                if (conn != null) {
                    conn.disconnect();
                }
            }
        }

        log(ctx, "[HubSpotClient] Falha após " + MAX_RETRIES + " tentativas: " + lastError);
        return null;
    }

    /**
     * Reads successful response body.
     */
    private static String readResponse(HttpURLConnection conn) throws Exception {
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8))) {
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                response.append(line);
            }
            return response.toString();
        }
    }

    /**
     * Reads error response body.
     */
    private static String readErrorResponse(HttpURLConnection conn) {
        try (BufferedReader br = new BufferedReader(
                new InputStreamReader(conn.getErrorStream(), StandardCharsets.UTF_8))) {
            StringBuilder response = new StringBuilder();
            String line;
            while ((line = br.readLine()) != null) {
                response.append(line);
            }
            String error = response.toString();
            if (error.length() > 200) {
                error = error.substring(0, 200) + "...";
            }
            return error;
        } catch (Exception e) {
            return "Unable to read error response";
        }
    }

    /**
     * Safe logging helper.
     */
    private static void log(ScheduledActionContext ctx, String message) {
        if (ctx != null) {
            ctx.log(message);
        } else {
            System.out.println(message);
        }
    }
}
