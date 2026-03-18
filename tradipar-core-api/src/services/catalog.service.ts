import axios from 'axios';
import { sankhyaApi } from '../adapters/sankhya.api';
import { hubspotApi } from '../adapters/hubspot.api';
import { ENV } from '../config/env';

/**
 * Interface para os produtos buscados
 */
interface HubSpotProduct {
  codProd: string | number;
  hs_product_id: string;
  name: string;
  controle?: string;
  stockMatriz?: number;
  stockFilial?: number;
}

class CatalogService {
  /**
   * Busca produtos no HubSpot e enriquece com estoque do Sankhya em tempo real
   */
  public async searchProducts(query: string): Promise<{ success: boolean; products: HubSpotProduct[] }> {
    if (!query || query.length < 3) return { success: true, products: [] };

    console.log(`[PROD-SEARCH] Buscando produtos no HubSpot CRM para: "${query}"...`);
    const searchBody = {
      filterGroups: [
        { filters: [{ propertyName: "name", operator: "CONTAINS_TOKEN", value: `*${query}*` }] },
        { filters: [{ propertyName: "description", operator: "CONTAINS_TOKEN", value: `*${query}*` }] },
        { filters: [{ propertyName: "hs_sku", operator: "EQ", value: query }] }
      ],
      properties: ["name", "hs_sku", "description", "sankhya_product_id"],
      limit: 20
    };

    const searchResp = await hubspotApi.post<any>('/crm/v3/objects/products/search', searchBody);

    const products: HubSpotProduct[] = (searchResp.data?.results || []).map((p: any) => ({
      codProd: p.properties.hs_sku || p.properties.sankhya_product_id,
      hs_product_id: p.id,
      name: p.properties.name,
      controle: ""
    })).filter((p: HubSpotProduct) => p.codProd);

    console.log(`[PROD-SEARCH] Encontrados ${products.length} produtos no HubSpot.`);

    // --- ENRIQUECIMENTO DE ESTOQUE (SANKHYA) ---
    if (products.length > 0) {
      await this.enrichProductsWithStock(products);
    }

    return { success: true, products };
  }

  /**
   * Método privado para busca de saldo de estoque em tempo real direto no Sankhya (Bulk Query)
   */
  private async enrichProductsWithStock(products: HubSpotProduct[]): Promise<void> {
    try {
      // Filtrar apenas IDs válidos para a query SQL (inteiros)
      const productIds = products
        .map(p => p.codProd)
        .filter((id: string | number) => id && !isNaN(Number(id)));

      if (productIds.length > 0) {
        // Query otimizada para buscar todos os saldos de uma vez
        const stockSql = `
          SELECT 
            CODPROD,
            SUM(CASE WHEN CODEMP = 1 THEN ESTOQUE - RESERVADO ELSE 0 END) AS MATRIZ,
            SUM(CASE WHEN CODEMP = 2 THEN ESTOQUE - RESERVADO ELSE 0 END) AS FILIAL
          FROM TGFEST
          WHERE CODPROD IN (${productIds.join(',')})
          GROUP BY CODPROD
        `;
        
        const stocks = await this.executeSankhyaQuery(stockSql);
        
        products.forEach(p => {
          const s = stocks.find((st: any) => String(st.CODPROD) === String(p.codProd));
          p.stockMatriz = s ? Number(s.MATRIZ) : 0;
          p.stockFilial = s ? Number(s.FILIAL) : 0;
        });
      }
    } catch (err: any) {
      console.error(`[PROD-SEARCH-STOCK] Erro ao buscar estoques (Sankhya): ${err.message}`);
      // Fallback: garante que as propriedades existam mesmo em caso de erro
      products.forEach(p => {
        if (p.stockMatriz === undefined) p.stockMatriz = 0;
        if (p.stockFilial === undefined) p.stockFilial = 0;
      });
    }
  }

  /**
   * Executa uma busca por lotes (CONTROLE) de um produto específico
   */
  public async getProductLots(codProd: number | string) {
    console.log(`[CATALOG] Buscando lotes para produto ${codProd}...`);
    const sql = `
      SELECT DISTINCT 
        CONTROLE, 
        ESTOQUE - RESERVADO AS SALDO,
        CODBARC AS CODIGOBARRAS
      FROM TGFEST 
      WHERE CODPROD = ${codProd} 
        AND (ESTOQUE - RESERVADO) > 0
        AND CONTROLE IS NOT NULL
        AND CONTROLE <> ' '
      ORDER BY CONTROLE ASC
    `;

    try {
      const rows = await this.executeSankhyaQuery(sql);
      return rows.map((r: any) => ({
        lote: r.CONTROLE,
        saldo: Number(r.SALDO),
        codigoBarras: r.CODIGOBARRAS
      }));
    } catch (err: any) {
      console.error(`[CATALOG-LOTS] Erro: ${err.message}`);
      return [];
    }
  }

  /**
   * Helper para execução de queries via DbExplorerSP
   */
  private async executeSankhyaQuery(sql: string): Promise<any[]> {
    const payload = {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: { sql }
    };

    const resp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', payload);
    
    if (resp.data.status !== "1") {
      throw new Error(resp.data.statusMessage || "Erro desconhecido na execução de query Sankhya.");
    }

    const rows = resp.data.responseBody.rows || [];
    const fields = resp.data.responseBody.fieldsMetadata || [];

    // Mapear colunas para objetos JSON amigáveis
    return rows.map((row: any[]) => {
      const obj: any = {};
      row.forEach((val, idx) => {
        const fieldName = fields[idx]?.name;
        if (fieldName) obj[fieldName] = val;
      });
      return obj;
    });
  }
}

export const catalogService = new CatalogService();
