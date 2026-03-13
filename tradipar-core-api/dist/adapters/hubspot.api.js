"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hubspotApi = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
class HubSpotAdapter {
    api;
    token = null;
    tokenExpiry = null;
    tokenRefreshPromise = null;
    constructor() {
        this.api = axios_1.default.create({
            baseURL: 'https://api.hubapi.com',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        // Add request interceptor for dynamic token injection
        this.api.interceptors.request.use(async (config) => {
            const token = await this.getValidToken();
            config.headers.Authorization = `Bearer ${token}`;
            return config;
        });
    }
    /**
     * Determines if OAuth2 refresh is available (all required vars present)
     */
    isOAuth2Available() {
        return !!(env_1.ENV.HUBSPOT.CLIENT_ID && env_1.ENV.HUBSPOT.CLIENT_SECRET && env_1.ENV.HUBSPOT.REFRESH_TOKEN);
    }
    /**
     * Fetches a new access token using OAuth2 refresh_token grant
     */
    async fetchNewToken() {
        if (!this.isOAuth2Available()) {
            throw new Error('[HUBSPOT] OAuth2 credentials not configured. Cannot refresh token.');
        }
        console.log('[HUBSPOT] Refreshing access token via OAuth2...');
        const response = await axios_1.default.post('https://api.hubapi.com/oauth/v1/token', new URLSearchParams({
            grant_type: 'refresh_token',
            client_id: env_1.ENV.HUBSPOT.CLIENT_ID,
            client_secret: env_1.ENV.HUBSPOT.CLIENT_SECRET,
            refresh_token: env_1.ENV.HUBSPOT.REFRESH_TOKEN
        }).toString(), {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        const { access_token, expires_in } = response.data;
        this.token = access_token;
        // Set expiry 5 minutes before actual expiration for safety margin
        this.tokenExpiry = Date.now() + (expires_in - 300) * 1000;
        console.log(`[HUBSPOT] Token refreshed successfully. Expires in ${expires_in}s.`);
        return this.token;
    }
    /**
     * Returns a valid token, refreshing if necessary.
     * Uses singleton pattern to avoid concurrent refresh requests.
     */
    async getValidToken() {
        // If OAuth2 is not configured, fallback to static ACCESS_TOKEN
        if (!this.isOAuth2Available()) {
            if (!env_1.ENV.HUBSPOT.ACCESS_TOKEN) {
                throw new Error('[HUBSPOT] No ACCESS_TOKEN configured and OAuth2 credentials missing.');
            }
            return env_1.ENV.HUBSPOT.ACCESS_TOKEN;
        }
        // Check if current token is still valid
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.token;
        }
        // Use singleton to prevent concurrent refresh requests
        if (this.tokenRefreshPromise) {
            return this.tokenRefreshPromise;
        }
        this.tokenRefreshPromise = this.fetchNewToken().finally(() => {
            this.tokenRefreshPromise = null;
        });
        return this.tokenRefreshPromise;
    }
    // Generic methods
    async get(url, config) {
        return this.api.get(url, config);
    }
    async post(url, data, config) {
        return this.api.post(url, data, config);
    }
    async put(url, data, config) {
        return this.api.put(url, data, config);
    }
    async patch(url, data, config) {
        return this.api.patch(url, data, config);
    }
    async delete(url, config) {
        return this.api.delete(url, config);
    }
    // Specialized Deal Methods
    async updateDeal(dealId, properties) {
        try {
            const response = await this.patch(`/crm/v3/objects/deals/${dealId}`, { properties });
            return response.data;
        }
        catch (e) {
            console.error(`[HUBSPOT API] Error updating deal ${dealId}:`, e.response?.data || e.message);
            throw e;
        }
    }
    async getDeal(dealId, properties = []) {
        try {
            const qs = properties.length > 0 ? `?properties=${properties.join(',')}` : '';
            const response = await this.get(`/crm/v3/objects/deals/${dealId}${qs}`);
            return response.data;
        }
        catch (e) {
            console.error(`[HUBSPOT API] Error getting deal ${dealId}:`, e.response?.data || e.message);
            throw e;
        }
    }
    // Specialized Line Item Methods
    async updateLineItem(lineItemId, properties) {
        try {
            const response = await this.patch(`/crm/v3/objects/line_items/${lineItemId}`, { properties });
            return response.data;
        }
        catch (e) {
            console.error(`[HUBSPOT API] Error updating line item ${lineItemId}:`, e.response?.data || e.message);
            throw e;
        }
    }
    async createLineItem(properties) {
        try {
            const response = await this.post(`/crm/v3/objects/line_items`, { properties });
            return response.data;
        }
        catch (e) {
            console.error(`[HUBSPOT API] Error creating line item:`, e.response?.data || e.message);
            throw e;
        }
    }
    async deleteLineItem(lineItemId) {
        try {
            const response = await this.delete(`/crm/v3/objects/line_items/${lineItemId}`);
            return response.data;
        }
        catch (e) {
            console.error(`[HUBSPOT API] Error deleting line item ${lineItemId}:`, e.response?.data || e.message);
            throw e;
        }
    }
    async associateLineItemToDeal(lineItemId, dealId) {
        try {
            const response = await this.put(`/crm/v3/objects/line_items/${lineItemId}/associations/deals/${dealId}/line_item_to_deal`);
            return response.data;
        }
        catch (e) {
            console.error(`[HUBSPOT API] Error associating line item ${lineItemId} to deal ${dealId}:`, e.response?.data || e.message);
            throw e;
        }
    }
}
exports.hubspotApi = new HubSpotAdapter();
