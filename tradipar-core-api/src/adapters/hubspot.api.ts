import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ENV } from '../config/env';

class HubSpotAdapter {
  private api: AxiosInstance;

  constructor() {
    this.api = axios.create({
      baseURL: 'https://api.hubapi.com',
      headers: {
        'Authorization': `Bearer ${ENV.HUBSPOT.ACCESS_TOKEN}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // Generic methods
  public async get<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.api.get<T>(url, config);
  }

  public async post<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.api.post<T>(url, data, config);
  }

  public async put<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.api.put<T>(url, data, config);
  }

  public async patch<T>(url: string, data?: any, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.api.patch<T>(url, data, config);
  }

  public async delete<T>(url: string, config?: AxiosRequestConfig): Promise<AxiosResponse<T>> {
    return this.api.delete<T>(url, config);
  }

  // Specialized Deal Methods
  public async updateDeal(dealId: string, properties: Record<string, any>): Promise<any> {
    try {
      const response = await this.patch(`/crm/v3/objects/deals/${dealId}`, { properties });
      return response.data;
    } catch (e: any) {
      console.error(`[HUBSPOT API] Error updating deal ${dealId}:`, e.response?.data || e.message);
      throw e;
    }
  }

  public async getDeal(dealId: string, properties: string[] = []): Promise<any> {
    try {
      const qs = properties.length > 0 ? `?properties=${properties.join(',')}` : '';
      const response = await this.get(`/crm/v3/objects/deals/${dealId}${qs}`);
      return response.data;
    } catch (e: any) {
        console.error(`[HUBSPOT API] Error getting deal ${dealId}:`, e.response?.data || e.message);
        throw e;
    }
  }

  // Specialized Line Item Methods
  public async updateLineItem(lineItemId: string, properties: Record<string, any>): Promise<any> {
    try {
      const response = await this.patch(`/crm/v3/objects/line_items/${lineItemId}`, { properties });
      return response.data;
    } catch (e: any) {
      console.error(`[HUBSPOT API] Error updating line item ${lineItemId}:`, e.response?.data || e.message);
      throw e;
    }
  }

  public async createLineItem(properties: Record<string, any>): Promise<any> {
    try {
      const response = await this.post(`/crm/v3/objects/line_items`, { properties });
      return response.data;
    } catch (e: any) {
      console.error(`[HUBSPOT API] Error creating line item:`, e.response?.data || e.message);
      throw e;
    }
  }

  public async deleteLineItem(lineItemId: string): Promise<any> {
    try {
      const response = await this.delete(`/crm/v3/objects/line_items/${lineItemId}`);
      return response.data;
    } catch (e: any) {
      console.error(`[HUBSPOT API] Error deleting line item ${lineItemId}:`, e.response?.data || e.message);
      throw e;
    }
  }

  public async associateLineItemToDeal(lineItemId: string, dealId: string): Promise<any> {
    try {
      const response = await this.put(`/crm/v3/objects/line_items/${lineItemId}/associations/deals/${dealId}/line_item_to_deal`);
      return response.data;
    } catch (e: any) {
      console.error(`[HUBSPOT API] Error associating line item ${lineItemId} to deal ${dealId}:`, e.response?.data || e.message);
      throw e;
    }
  }
}

export const hubspotApi = new HubSpotAdapter();
