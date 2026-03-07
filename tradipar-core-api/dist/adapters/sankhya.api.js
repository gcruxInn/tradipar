"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sankhyaApi = void 0;
const axios_1 = __importDefault(require("axios"));
const env_1 = require("../config/env");
class SankhyaAdapter {
    api;
    token = null;
    tokenExpiry = null;
    constructor() {
        this.api = axios_1.default.create({
            baseURL: env_1.ENV.SANKHYA.BASE_URL,
        });
        // Request intercaptor to inject token
        this.api.interceptors.request.use(async (config) => {
            // Do not intercept auth calls
            if (config.url?.includes('/authenticate')) {
                return config;
            }
            const token = await this.getValidToken();
            if (!config.headers) {
                config.headers = {};
            }
            config.headers['Authorization'] = `Bearer ${token}`;
            return config;
        });
    }
    async fetchNewToken() {
        console.log('[SANKHYA-AUTH] Fetching new access_token...');
        const params = new URLSearchParams();
        params.append('grant_type', 'client_credentials');
        params.append('client_id', env_1.ENV.SANKHYA.CLIENT_ID);
        params.append('client_secret', env_1.ENV.SANKHYA.CLIENT_SECRET);
        try {
            const resp = await axios_1.default.post(`${env_1.ENV.SANKHYA.BASE_URL}/authenticate`, params, {
                headers: {
                    'X-Token': env_1.ENV.SANKHYA.X_TOKEN,
                    'appkey': env_1.ENV.SANKHYA.CLIENT_ID,
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });
            const { access_token, expires_in } = resp.data;
            if (!access_token) {
                throw new Error('No access token returned from Sankhya Auth API.');
            }
            this.token = access_token;
            // Margin of 30 seconds for safety
            this.tokenExpiry = Date.now() + (expires_in * 1000) - 30000;
            console.log('[SANKHYA-AUTH] New access_token cached successfully.');
            return this.token;
        }
        catch (e) {
            console.error('[SANKHYA-AUTH] Error fetching token:', e.response?.data || e.message);
            throw new Error(`Sankhya Authentication Failed: ${e.message}`);
        }
    }
    async getValidToken() {
        if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.token;
        }
        return await this.fetchNewToken();
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
}
exports.sankhyaApi = new SankhyaAdapter();
