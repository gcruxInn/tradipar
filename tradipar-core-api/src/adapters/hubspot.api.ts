import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { ENV } from '../config/env';

class HubSpotAdapter {
  private api: AxiosInstance;
  private token: string | null = null;
  private tokenExpiry: number | null = null;
  private tokenRefreshPromise: Promise<string> | null = null;

  constructor() {
    this.api = axios.create({
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
  private isOAuth2Available(): boolean {
    return !!(ENV.HUBSPOT.CLIENT_ID && ENV.HUBSPOT.CLIENT_SECRET && ENV.HUBSPOT.REFRESH_TOKEN);
  }

  /**
   * Fetches a new access token using OAuth2 refresh_token grant
   */
  private async fetchNewToken(): Promise<string> {
    if (!this.isOAuth2Available()) {
      throw new Error('[HUBSPOT] OAuth2 credentials not configured. Cannot refresh token.');
    }

    console.log('[HUBSPOT] Refreshing access token via OAuth2...');

    const response = await axios.post(
      'https://api.hubapi.com/oauth/v1/token',
      new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: ENV.HUBSPOT.CLIENT_ID,
        client_secret: ENV.HUBSPOT.CLIENT_SECRET,
        refresh_token: ENV.HUBSPOT.REFRESH_TOKEN
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, expires_in } = response.data;
    this.token = access_token;
    // Set expiry 5 minutes before actual expiration for safety margin
    this.tokenExpiry = Date.now() + (expires_in - 300) * 1000;

    console.log(`[HUBSPOT] Token refreshed successfully. Expires in ${expires_in}s.`);
    return this.token!;
  }

  /**
   * Returns a valid token, refreshing if necessary.
   * Uses singleton pattern to avoid concurrent refresh requests.
   */
  private async getValidToken(): Promise<string> {
    // If OAuth2 is not configured, fallback to static ACCESS_TOKEN
    if (!this.isOAuth2Available()) {
      if (!ENV.HUBSPOT.ACCESS_TOKEN) {
        throw new Error('[HUBSPOT] No ACCESS_TOKEN configured and OAuth2 credentials missing.');
      }
      return ENV.HUBSPOT.ACCESS_TOKEN;
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
