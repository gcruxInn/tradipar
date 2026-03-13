import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse, InternalAxiosRequestConfig } from 'axios';
import { ENV } from '../config/env';

class SankhyaAdapter {
  private api: AxiosInstance;
  private token: string | null = null;
  private tokenExpiry: number | null = null;

  constructor() {
    this.api = axios.create({
      baseURL: ENV.SANKHYA.BASE_URL,
      timeout: 15000,
    });

    // Request intercaptor to inject token
    this.api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
      // Do not intercept auth calls
      if (config.url?.includes('/authenticate')) {
        return config;
      }

      const token = await this.getValidToken();
      if (!config.headers) {
        config.headers = {} as any;
      }
      config.headers['Authorization'] = `Bearer ${token}`;
      return config;
    });
  }

  private async fetchNewToken(): Promise<string> {
    console.log('[SANKHYA-AUTH] Fetching new access_token...');
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', ENV.SANKHYA.CLIENT_ID);
    params.append('client_secret', ENV.SANKHYA.CLIENT_SECRET);

    try {
      const resp = await axios.post(`${ENV.SANKHYA.BASE_URL}/authenticate`, params, {
        headers: {
          'X-Token': ENV.SANKHYA.X_TOKEN,
          'appkey': ENV.SANKHYA.CLIENT_ID,
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
      return this.token as string;
    } catch (e: any) {
      console.error('[SANKHYA-AUTH] Error fetching token:', e.response?.data || e.message);
      throw new Error(`Sankhya Authentication Failed: ${e.message}`);
    }
  }

  public async getValidToken(): Promise<string> {
    if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
      return this.token;
    }
    return await this.fetchNewToken();
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
}

export const sankhyaApi = new SankhyaAdapter();
