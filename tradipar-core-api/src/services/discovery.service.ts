import { sankhyaApi } from '../adapters/sankhya.api';
import { hubspotApi } from '../adapters/hubspot.api';
import { ENV } from '../config/env';

class DiscoveryService {

  // Helper: raw query execution
  public async debugSql(sql: string): Promise<any> {
    console.log(`[DEBUG] Executing SQL: ${sql}`);
    const response = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: { sql }
    });
    return response.data;
  }

  // ================================================================
  // DISCOVERY
  // ================================================================

  public async discoveryQuoteTables() {
    const queries = [
      { name: "TOPs Disponíveis", sql: "SELECT CODTIPOPER, DESCROPER, ATIVO FROM TGFTOP WHERE ATIVO = 'S' ORDER BY CODTIPOPER" },
      { name: "Colunas Obrigatórias TGFCAB", sql: "SELECT COLUMN_NAME, DATA_TYPE, NULLABLE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TGFCAB' AND NULLABLE = 'N' ORDER BY COLUMN_ID" },
      { name: "Colunas Obrigatórias TGFITE", sql: "SELECT COLUMN_NAME, DATA_TYPE, NULLABLE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TGFITE' AND NULLABLE = 'N' ORDER BY COLUMN_ID" },
      { name: "Discovery Relatórios (SQL/PDF)", sql: "SELECT CODREL, NOMEREL, FILTRO FROM TSIREL WHERE NOMEREL LIKE '%ORC%' OR NOMEREL LIKE '%PED%'" },
      { name: "Sankhya Context (Sample TGFCAB)", sql: "SELECT NUNOTA, CODPARC, CODTIPOPER, DTNEG, VLRNOTA FROM TGFCAB WHERE CODTIPOPER = 999 AND ROWNUM <= 5 ORDER BY NUNOTA DESC" },
      { name: "Centros de Resultado Disponíveis", sql: "SELECT CODCENCUS, DESCRCENCUS FROM TSICUS WHERE ROWNUM <= 20 ORDER BY CODCENCUS" }
    ];
    const results: any = {};
    for (const q of queries) {
      try {
        const resp = await this.debugSql(q.sql);
        const rb = resp?.responseBody;
        results[q.name] = { success: true, rows: rb?.rows || [], fields: rb?.fieldsMetadata || [] };
      } catch (err: any) {
        results[q.name] = { success: false, error: err.message };
      }
    }
    return { success: true, timestamp: new Date().toISOString(), results };
  }

  public async discoveryServices() {
    const baseUrl = ENV.SANKHYA.BASE_URL;
    const services = [
      { module: "mge", name: "CACSP.incluirNota" },
      { module: "mgecom", name: "CACSP.incluirNota" },
      { module: "mge", name: "SelecaoDocumentoSP.incluirNota" },
      { module: "mgecom", name: "SelecaoDocumentoSP.incluirNota" },
      { module: "mgecom", name: "SalesCentralSP.faturarNota" },
      { module: "mgecom", name: "SelecaoDocumentoSP.faturarNotas" },
      { module: "mgecom", name: "SelecaoDocumentoSP.faturarNota" },
      { module: "mgecom", name: "CACSP.faturarNota" },
      { module: "mge", name: "SalesCentralSP.faturarNota" },
      { module: "mge", name: "SelecaoDocumentoSP.faturarNotas" },
      { module: "mge", name: "SelecaoDocumentoSP.faturarNota" },
      { module: "mge", name: "CACSP.faturarNota" },
      { module: "mgecom", name: "CentralVendasSP.faturarNota" },
      { module: "mgecom", name: "CentralMinhasConferenciasSP.faturarNota" },
      { module: "mgecom", name: "SelecaoDocumentoSP.faturar" },
      { module: "mgecom", name: "CentralFaturamentoSP.faturar" },
      { module: "mgecom", name: "CentralFaturamentoSP.faturamento" },
      { module: "mgecom", name: "CentralVendasSP.faturarNota" },
      { module: "mgecom", name: "CentralEstoqueSP.gerarNota" },
      { module: "mge", name: "CRUDServiceProvider.saveRecord" },
      { module: "mgecom", name: "CRUDServiceProvider.saveRecord" },
    ];
    const results: any[] = [];
    for (const svc of services) {
      try {
        const resp = await sankhyaApi.post<any>(`/gateway/v1/${svc.module}/service.sbr?serviceName=${svc.name}&outputType=json`, {
          serviceName: svc.name, requestBody: {}
        });
        results.push({ module: svc.module, service: svc.name, status: resp.data?.status, available: !resp.data?.statusMessage?.includes("Nenhum provedor") });
      } catch (e: any) {
        results.push({ module: svc.module, service: svc.name, status: "ERROR", message: e.message.substring(0, 100), available: false });
      }
    }
    return { success: true, baseUrl, results, availableServices: results.filter(r => r.available).map(r => `${r.module}/${r.service}`) };
  }

  // ================================================================
  // DEBUG: Product Properties (HubSpot)
  // ================================================================

  public async debugProductProperties() {
    const response = await hubspotApi.get<any>('/crm/v3/properties/products');
    return response.data.results.map((p: any) => ({ label: p.label, name: p.name, type: p.type })).sort((a: any, b: any) => a.label.localeCompare(b.label));
  }

  // ================================================================
  // DISCOVERY: Sankhya Delivery Routes
  // ================================================================

  public async discoverySankhyaDeliveryRoutes() {
    const queries = [
      {
        name: "Colunas da tabela TGFCAB (Pedidos)",
        sql: "SELECT COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TGFCAB' ORDER BY COLUMN_NAME"
      },
      {
        name: "Buscar colunas ROTA no TGFCAB",
        sql: "SELECT COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TGFCAB' AND UPPER(COLUMN_NAME) LIKE '%ROTA%' ORDER BY COLUMN_NAME"
      },
      {
        name: "Exemplo de dados TGFCAB com rotas",
        sql: "SELECT * FROM TGFCAB WHERE ROWNUM <= 1"
      }
    ];
    const results: any = {};
    for (const q of queries) {
      try {
        const resp = await this.debugSql(q.sql);
        const rb = resp?.responseBody;
        results[q.name] = { success: true, rows: rb?.rows || [], fields: rb?.fieldsMetadata || [] };
      } catch (err: any) {
        results[q.name] = { success: false, error: err.message };
      }
    }
    return { success: true, timestamp: new Date().toISOString(), results };
  }
}

export const discoveryService = new DiscoveryService();
