import { sankhyaApi } from '../adapters/sankhya.api';
import { hubspotApi } from '../adapters/hubspot.api';

// === Constants ===
const CACHE_TTL_MS = 5000; // 5 seconds

const DEAL_STAGE_MAP: Record<string, string> = {
  "appointmentscheduled": "Agendado / Negociação",
  "decisionmakerboughtin": "Aguardando Liberação",
  "contractsent": "Aguardando Assinatura",
  "closedwon": "Fechado Ganho",
  "closedlost": "Perdido",
  "presentationscheduled": "Pedido Gerado"
};

// === In-Memory Caches ===
const PRICE_CACHE = new Map<string, { val: any; ts: number }>();
const IN_FLIGHT_PRICES = new Map<string, Promise<any>>();
const STK_CACHE = new Map<string, { val: number; ts: number }>();
const IN_FLIGHT_STK = new Map<string, Promise<number>>();

// Helper: Fix Encoding (ISO-8859-1 -> UTF-8)
function fixEncoding(str: string | null | undefined): string | null | undefined {
  if (!str) return str;
  try {
    if (str.match(/[ÃÂ][\x80-\xBF]/)) {
      return Buffer.from(str, 'binary').toString('utf8');
    }
  } catch (e) { return str; }
  return str;
}

function toInt(name: string, value: any): number | null {
  if (value === null || value === undefined || value === "" || value === "undefined") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) {
    throw new Error(`${name} inválido (precisa ser inteiro): ${value}`);
  }
  return n;
}

function parseDbExplorerFirstValue(data: any): number | null {
  const rb = data?.responseBody;
  if (Array.isArray(rb?.rows) && rb.rows.length) return Number(rb.rows[0]?.[0]);
  const rsRows = rb?.resultSet?.rows;
  if (Array.isArray(rsRows) && rsRows.length) return Number(rsRows[0]?.PRECO?.$ || Object.values(rsRows[0] as Record<string, any>)[0]?.$);
  return null;
}

class CatalogService {

  // ================================================================
  // STOCK METHODS
  // ================================================================

  /**
   * Busca estoque de um produto em TODAS as empresas/unidades
   */
  public async getStockAllUnits(codProd: number | string): Promise<any[]> {
    try {
      const sql = `
        SELECT 
          E.CODEMP,
          EMP.RAZAOSOCIAL,
          EMP.NOMEFANTASIA,
          SUM(E.ESTOQUE - E.RESERVADO) AS DISPONIVEL
        FROM TGFEST E
        INNER JOIN TSIEMP EMP ON EMP.CODEMP = E.CODEMP
        WHERE E.CODPROD = ${codProd}
        GROUP BY E.CODEMP, EMP.RAZAOSOCIAL, EMP.NOMEFANTASIA
        ORDER BY EMP.CODEMP
      `;
      console.log(`[STK-ALL] Querying stock for CODPROD ${codProd} in all units`);
      const response = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
        serviceName: "DbExplorerSP.executeQuery",
        requestBody: { sql }
      });

      const rb = response.data?.responseBody;
      const stocks: any[] = [];

      if (Array.isArray(rb?.rows)) {
        for (const row of rb.rows) {
          stocks.push({
            codEmp: row[0],
            razaoSocial: row[1],
            nomeFantasia: row[2],
            disponivel: Number(row[3]) || 0
          });
        }
      }

      return stocks;
    } catch (err: any) {
      console.error(`[STK-ALL] Erro: ${err.message}`);
      return [];
    }
  }

  /**
   * Busca estoque de um produto em uma empresa específica (with cache + in-flight dedup)
   */
  public async getStock(codProd: number | string, codEmp: number | string): Promise<number> {
    const cacheKey = `${codProd}-${codEmp}`;
    if (STK_CACHE.has(cacheKey)) {
      const { val, ts } = STK_CACHE.get(cacheKey)!;
      if (Date.now() - ts < CACHE_TTL_MS) return val;
    }

    if (IN_FLIGHT_STK.has(cacheKey)) {
      return IN_FLIGHT_STK.get(cacheKey)!;
    }

    const reqPromise = (async () => {
      try {
        const sql = `SELECT SUM(ESTOQUE - RESERVADO) AS DISPONIVEL FROM TGFEST WHERE CODPROD = ${codProd} AND CODEMP = ${codEmp}`;
        const response = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
          serviceName: "DbExplorerSP.executeQuery",
          requestBody: { sql }
        });

        let val = 0;
        try {
          val = parseDbExplorerFirstValue(response.data) || 0;
        } catch (e: any) {
          console.warn(`[STK] Parse error for ${codProd}:`, e.message);
        }

        STK_CACHE.set(cacheKey, { val, ts: Date.now() });
        IN_FLIGHT_STK.delete(cacheKey);
        return val;
      } catch (e: any) {
        console.error(`[STK] Error querying stock for ${codProd}:`, e.message);
        IN_FLIGHT_STK.delete(cacheKey);
        return 0;
      }
    })();

    IN_FLIGHT_STK.set(cacheKey, reqPromise);
    return reqPromise;
  }

  /**
   * Busca estoque de múltiplos produtos em todas as unidades
   */
  public async getStockMultipleProducts(codProds: number[]): Promise<any[]> {
    const results: any[] = [];
    for (const codProd of codProds) {
      const stocks = await this.getStockAllUnits(codProd);
      const totalDisponivel = stocks.reduce((sum: number, s: any) => sum + s.disponivel, 0);
      results.push({ codProd: Number(codProd), totalDisponivel, units: stocks });
    }
    return results;
  }

  // ================================================================
  // PRICE METHODS
  // ================================================================

  /**
   * Busca todos os 3 preços (PV1, PV2, PV3) via AD_PRECO_TRADIPAR com cache
   */
  public async getAllPrices(codProd: number, codParc: number, codEmp: number): Promise<{ pv1: number; pv2: number; pv3: number }> {
    const cacheKey = `${codProd}-${codParc}-${codEmp}`;

    if (PRICE_CACHE.has(cacheKey)) {
      const { val, ts } = PRICE_CACHE.get(cacheKey)!;
      if (Date.now() - ts < CACHE_TTL_MS) return val;
    }

    if (IN_FLIGHT_PRICES.has(cacheKey)) {
      return IN_FLIGHT_PRICES.get(cacheKey)!;
    }

    const reqPromise = (async () => {
      try {
        const sql = `
          SELECT 
            AD_PRECO_TRADIPAR(${codProd}, ${codParc}, ${codEmp}, 1) AS PV1,
            AD_PRECO_TRADIPAR(${codProd}, ${codParc}, ${codEmp}, 2) AS PV2,
            AD_PRECO_TRADIPAR(${codProd}, ${codParc}, ${codEmp}, 3) AS PV3
          FROM DUAL
        `;
        const response = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
          serviceName: "DbExplorerSP.executeQuery",
          requestBody: { sql }
        });

        let row = null;
        const rb = response.data?.responseBody;
        if (rb?.rows && rb.rows.length) row = rb.rows[0];
        else if (rb?.resultSet?.rows && rb.resultSet.rows.length) {
          const r = rb.resultSet.rows[0];
          row = [r.PV1?.$ || r.PV1, r.PV2?.$ || r.PV2, r.PV3?.$ || r.PV3];
        }

        let result = { pv1: 0, pv2: 0, pv3: 0 };
        if (row) {
          result = { pv1: Number(row[0] || 0), pv2: Number(row[1] || 0), pv3: Number(row[2] || 0) };
        }

        PRICE_CACHE.set(cacheKey, { val: result, ts: Date.now() });
        IN_FLIGHT_PRICES.delete(cacheKey);
        return result;
      } catch (err: any) {
        IN_FLIGHT_PRICES.delete(cacheKey);
        throw err;
      }
    })();

    IN_FLIGHT_PRICES.set(cacheKey, reqPromise);
    return reqPromise;
  }

  // ================================================================
  // DEAL PRICES (getDealSankhyaContext + enriched items)
  // ================================================================

  private async getEmpresaNome(codEmp: number): Promise<string> {
    try {
      const sql = `SELECT RAZAOSOCIAL FROM TSIEMP WHERE CODEMP = ${codEmp}`;
      const response = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
        serviceName: "DbExplorerSP.executeQuery",
        requestBody: { sql }
      });
      const rb = response.data?.responseBody;
      if (Array.isArray(rb?.rows) && rb.rows.length > 0) return String(rb.rows[0][0]);
      return `Empresa ${codEmp}`;
    } catch (e) { return `Empresa ${codEmp}`; }
  }

  private async getAllCompanies(): Promise<any[]> {
    const response = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: { sql: "SELECT CODEMP, RAZAOSOCIAL, NOMEFANTASIA FROM TSIEMP WHERE ATIVO = 'S' ORDER BY CODEMP" }
    });
    return response.data?.responseBody?.rows?.map((row: any) => ({
      codEmp: row[0],
      razaoSocial: row[1],
      nomeFantasia: row[2]
    })) || [];
  }

  /**
   * Full Discovery Chain: Resolve DealSankhyaContext (Companies, LineItems, Quotes)
   */
  public async getDealSankhyaContext(objectId: string): Promise<any> {
    const deal = await hubspotApi.getDeal(objectId, [
      'codemp_sankhya', 'sankhya_codemp', 'amount', 'codigo_vendedor_sankhya',
      'hubspot_owner_id', 'ordem_de_compra_anexo', 'dealstage', 'orcamento_sankhya'
    ]);
    const props = deal.properties;

    // 1. Empresa
    const codEmpRaw = props.codemp_sankhya || props.sankhya_codemp;
    const codEmp = toInt("codEmp", codEmpRaw);

    // 2. Vendedor
    let codVendedor = props.codigo_vendedor_sankhya;

    // 3. Parceiro (Company > Contact)
    let codParcRaw = null;

    // Fetch associations
    const assocResp = await hubspotApi.get<any>(`/crm/v3/objects/deals/${objectId}?associations=companies,contacts,quotes,line_items&properties=id`);
    const associations = assocResp.data.associations || {};

    const companyId = associations?.companies?.results?.[0]?.id;
    if (companyId) {
      try {
        const resp = await hubspotApi.get<any>(`/crm/v3/objects/companies/${companyId}?properties=sankhya_codparc,codparc`);
        codParcRaw = resp.data.properties.sankhya_codparc || resp.data.properties.codparc;
      } catch (e) {}
    }
    if (!codParcRaw) {
      const contactId = associations?.contacts?.results?.[0]?.id;
      if (contactId) {
        try {
          const resp = await hubspotApi.get<any>(`/crm/v3/objects/contacts/${contactId}?properties=sankhya_codparc,codparc`);
          codParcRaw = resp.data.properties.sankhya_codparc || resp.data.properties.codparc;
        } catch (e) {}
      }
    }

    // 4. Multi-Item Discovery
    const items: any[] = [];
    const rawLineItems = associations?.line_items?.results ||
      associations?.['line items']?.results ||
      associations?.lineitems?.results || [];

    const lineItemIds = rawLineItems.map((r: any) => r.id);

    if (lineItemIds.length > 0) {
      await Promise.all(lineItemIds.map(async (id: string) => {
        try {
          const resp = await hubspotApi.get<any>(
            `/crm/v3/objects/line_items/${id}?properties=sankhya_codprod,codprod,hs_product_id,quantity,name,price,hs_sku,sankhya_controle,controle`
          );
          const lp = resp.data.properties;

          let codProd = lp.sankhya_codprod || lp.codprod || lp.hs_sku;

          if (!codProd && lp.hs_product_id) {
            const pResp = await hubspotApi.get<any>(
              `/crm/v3/objects/products/${lp.hs_product_id}?properties=sankhya_codprod,codprod,hs_sku`
            );
            const pp = pResp.data.properties;
            codProd = pp.sankhya_codprod || pp.codprod || pp.hs_sku;
          }

          if (codProd) {
            items.push({
              id,
              name: fixEncoding(lp.name) || `Item ${id}`,
              codProd: toInt("codProd", codProd),
              quantity: Number(lp.quantity || 0),
              currentPrice: lp.price ? Number(lp.price) : null,
              sankhyaControle: lp.sankhya_controle || lp.controle || null
            });
          } else {
            console.warn(`[DISCOVERY] Item ${id} não possui CODPROD definido.`);
          }
        } catch (e: any) {
          console.error(`[DISCOVERY] Erro ao buscar detalhes do item ${id}:`, e.message);
        }
      }));
    }

    // 5. Quote Discovery
    let activeQuote = null;
    const quotes = associations?.quotes?.results || [];
    if (quotes.length > 0) {
      try {
        const detailPromises = quotes.map((q: any) =>
          hubspotApi.get<any>(`/crm/v3/objects/quotes/${q.id}?properties=hs_title,hs_status,hs_expiration_date,hs_lastmodifieddate`)
        );
        const details = (await Promise.all(detailPromises)).map((r: any) => r.data);
        const now = new Date();
        activeQuote = details
          .filter((q: any) => q.properties.hs_status !== 'CANCELED')
          .filter((q: any) => !q.properties.hs_expiration_date || new Date(q.properties.hs_expiration_date) >= now)
          .sort((a: any, b: any) => new Date(b.properties.hs_lastmodifieddate).getTime() - new Date(a.properties.hs_lastmodifieddate).getTime())[0];
      } catch (e: any) {
        console.warn("[DISCOVERY] Erro ao analisar Quotes:", e.message);
      }
    }

    // 4.1 Enrich Items with Sankhya Data (CONTROLE, PERCLUCRO)
    if (props.orcamento_sankhya && items.length > 0) {
      try {
        const nunotaEnrich = props.orcamento_sankhya;
        console.log(`[DISCOVERY] Enriching items for NUNOTA ${nunotaEnrich}...`);
        const sqlItens = `SELECT CODPROD, CONTROLE, PERCLUCRO, QTDNEG FROM TGFITE WHERE NUNOTA = ${nunotaEnrich}`;
        const queryResp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
          serviceName: "DbExplorerSP.executeQuery",
          requestBody: { sql: sqlItens }
        });

        const rowData = queryResp.data?.responseBody?.rows;
        if (rowData && rowData.length > 0) {
          const sankhyaItems = rowData.map((row: any) => ({
            codProd: parseInt(row[0], 10),
            controle: row[1] || "",
            profitability: parseFloat(String(row[2]).replace(',', '.')) || 0,
            qtdNeg: parseFloat(row[3]) || 0
          }));

          items.forEach((item: any) => {
            let matchedIdx = sankhyaItems.findIndex((si: any) =>
              si.codProd === item.codProd &&
              (item.sankhyaControle ? si.controle === item.sankhyaControle : true) &&
              si.qtdNeg === item.quantity
            );
            if (matchedIdx === -1) {
              matchedIdx = sankhyaItems.findIndex((si: any) =>
                si.codProd === item.codProd &&
                (item.sankhyaControle ? si.controle === item.sankhyaControle : true)
              );
            }
            if (matchedIdx === -1) {
              matchedIdx = sankhyaItems.findIndex((si: any) => si.codProd === item.codProd);
            }
            if (matchedIdx !== -1) {
              const matched = sankhyaItems[matchedIdx];
              item.sankhyaControle = matched.controle;
              item.sankhyaProfitability = matched.profitability;
              sankhyaItems.splice(matchedIdx, 1);
            }
          });
        }
      } catch (e: any) {
        console.warn("[DISCOVERY] Erro ao enriquecer itens via TGFITE:", e.message);
      }
    }

    if (props.fase_negociacao) props.fase_negociacao = fixEncoding(props.fase_negociacao);
    if (props.dealstage) props.dealstage = fixEncoding(props.dealstage);

    return {
      objectId,
      codParc: toInt("codParc", codParcRaw),
      codEmp,
      codVendedor,
      items,
      activeQuote,
      nunota: props.orcamento_sankhya,
      props
    };
  }

  /**
   * Endpoint POST /hubspot/prices/deal: Full enriched items with prices + stock
   */
  public async getDealPrices(objectId: string) {
    console.log("--- Chamada /prices/deal (Multi-Item) ---");
    const ctx = await this.getDealSankhyaContext(objectId);

    if (!ctx.codParc || !ctx.codEmp || ctx.items.length === 0) {
      return { status: "MISSING_DATA", message: "Dados incompletos (Parceiro, Empresa ou Itens).", details: ctx };
    }

    const empresaNome = await this.getEmpresaNome(ctx.codEmp);
    const allCompanies = await this.getAllCompanies();
    const otherCompany = allCompanies.find((c: any) => c.codEmp !== ctx.codEmp);
    const otherCodEmp = otherCompany?.codEmp;

    // Concurrency-limited processing in chunks of 5
    const processedItems: any[] = [];
    for (let i = 0; i < ctx.items.length; i += 5) {
      const chunk = ctx.items.slice(i, i + 5);
      const chunkResults = await Promise.all(chunk.map(async (item: any) => {
        const [prices, estoque, estoqueOutraEmpresa] = await Promise.all([
          this.getAllPrices(item.codProd, ctx.codParc, ctx.codEmp),
          this.getStock(item.codProd, ctx.codEmp),
          otherCodEmp ? this.getStock(item.codProd, otherCodEmp) : Promise.resolve(0),
        ]);

        return {
          ...item,
          prices,
          stock: estoque,
          stockContext: (otherCodEmp && estoqueOutraEmpresa > 0)
            ? `${empresaNome?.substring(0, 10) || 'A'}: ${estoque} | ${otherCompany?.nomeFantasia?.substring(0, 10) || 'B'}: ${estoqueOutraEmpresa}`
            : `Estoque SNK: ${estoque}`,
          stockOther: estoqueOutraEmpresa,
          stockOtherContext: otherCompany?.nomeFantasia || otherCompany?.razaoSocial || "Outra Unidade"
        };
      }));
      processedItems.push(...chunkResults);
    }

    const hasStockCut = processedItems.some((i: any) => i.stock < i.quantity);
    if (hasStockCut) console.warn(`[CORTE] Deal ${objectId} tem itens com falta de estoque.`);

    return {
      status: "SUCCESS",
      items: processedItems,
      currentAmount: ctx.props.amount,
      currentStage: ctx.props.dealstage,
      stageLabel: DEAL_STAGE_MAP[ctx.props.dealstage] || ctx.props.dealstage,
      quote: ctx.activeQuote ? { id: ctx.activeQuote.id, title: ctx.activeQuote.properties.hs_title } : null
    };
  }

  // ================================================================
  // PRODUCT SEARCH (HubSpot)
  // ================================================================

  public async searchProducts(query: string) {
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

    const products = (searchResp.data?.results || []).map((p: any) => ({
      codProd: p.properties.hs_sku || p.properties.sankhya_product_id,
      hs_product_id: p.id,
      name: p.properties.name,
      controle: ""
    })).filter((p: any) => p.codProd);

    console.log(`[PROD-SEARCH] Encontrados ${products.length} produtos no HubSpot.`);

    // --- ENRIQUECIMENTO DE ESTOQUE (SANKHYA) ---
    if (products.length > 0) {
      try {
        const productIds = products
          .map((p: any) => p.codProd)
          .filter((id: string | number) => id && !isNaN(Number(id)));

        if (productIds.length > 0) {
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
          
          products.forEach((p: any) => {
            const s = stocks.find((st: any) => String(st.CODPROD) === String(p.codProd));
            p.stockMatriz = s ? Number(s.MATRIZ) : 0;
            p.stockFilial = s ? Number(s.FILIAL) : 0;
          });
        }
      } catch (err: any) {
        console.error(`[PROD-SEARCH-STOCK] Erro ao buscar estoques: ${err.message}`);
        // Fallback: garante que as propriedades existam mesmo em erro
        products.forEach((p: any) => {
          if (p.stockMatriz === undefined) p.stockMatriz = 0;
          if (p.stockFilial === undefined) p.stockFilial = 0;
        });
      }
    }

    return { success: true, products };
  }

  // ================================================================
  // PRODUCT CONTROLS (Lots/Batches from Sankhya)
  // ================================================================

  public async getProductControls(codProd: string | number, codEmp?: string | number) {
    console.log(`[PROD-CONTROLS] Buscando lotes para produto ${codProd}...`);
    const sql = `
      SELECT CONTROLE, SUM(ESTOQUE - RESERVADO) as SALDO 
      FROM TGFEST 
      WHERE CODPROD = ${codProd} 
        ${codEmp ? `AND CODEMP = ${codEmp}` : ''}
      GROUP BY CONTROLE
      HAVING SUM(ESTOQUE - RESERVADO) > 0
      ORDER BY CONTROLE
    `;
    const queryResp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: { sql }
    });
    const rows = queryResp.data?.responseBody?.rows || [];
    const controls = rows.map((r: any) => ({ controle: r[0], saldo: parseFloat(r[1]) }));
    return { success: true, controls };
  }

  // ================================================================
  // DEBUG ENDPOINTS (Sankhya)
  // ================================================================

  private async executeSankhyaQuery(sql: string): Promise<any[]> {
    console.log(`[QUERY] Executing: ${sql.substring(0, 100)}...`);
    const response = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: { sql }
    });

    const rb = response.data?.responseBody;
    let rows = rb?.rows;
    let fields = rb?.fieldsMetadata;

    if (!rows && rb?.resultSet) {
      rows = rb.resultSet.rows;
      fields = rb.resultSet.fieldsMetadata || rb.fieldsMetadata;
    }

    if (!rows || !fields) {
      console.log(`[QUERY] No rows or fields found.`);
      return [];
    }

    const fieldNames = fields.map((f: any) => f.name);
    return rows.map((row: any) => {
      const obj: any = {};
      fieldNames.forEach((field: string, i: number) => {
        obj[field] = row[i];
      });
      return obj;
    });
  }

  public async debugProducts(): Promise<any[]> {
    return this.executeSankhyaQuery("SELECT * FROM TGFPRO WHERE ROWNUM <= 1");
  }

  public async debugPriceTables(): Promise<any[]> {
    return this.executeSankhyaQuery("SELECT NUTAB, NOMETAB FROM TGFTAB WHERE ATIVA = 'S'");
  }

  public async debugPriceScan(): Promise<any[]> {
    return this.executeSankhyaQuery(`
      SELECT E.NUTAB, COUNT(1) as QTD 
      FROM TGFEXC E
      JOIN TGFPRO P ON P.CODPROD = E.CODPROD
      WHERE P.ATIVO = 'S'
      GROUP BY E.NUTAB
      ORDER BY COUNT(1) DESC
    `);
  }

  public async debugPriceBySku(sku: string): Promise<any[]> {
    return this.executeSankhyaQuery(`
      SELECT NUTAB, VLRVENDA, CODPROD
      FROM TGFEXC 
      WHERE CODPROD = ${sku}
    `);
  }
}

export const catalogService = new CatalogService();
