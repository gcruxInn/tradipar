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
    constructor() {
        this.api = axios_1.default.create({
            baseURL: 'https://api.hubapi.com',
            headers: {
                'Authorization': `Bearer ${env_1.ENV.HUBSPOT.ACCESS_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });
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
