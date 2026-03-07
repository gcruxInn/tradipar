import { sankhyaApi } from '../adapters/sankhya.api';
import { hubspotApi } from '../adapters/hubspot.api';
import { ENV } from '../config/env';

// Helper: Fix Encoding
function fixEncoding(str: string | null | undefined): string | null | undefined {
  if (!str) return str;
  try {
    if (str.match(/[ÃÂ][\x80-\xBF]/)) {
      return Buffer.from(str, 'binary').toString('utf8');
    }
  } catch (e) { return str; }
  return str;
}

class SyncService {

  // Helper: executeSankhyaQuery (structured results)
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
    if (!rows || !fields) return [];
    const fieldNames = fields.map((f: any) => f.name);
    return rows.map((row: any) => {
      const obj: any = {};
      fieldNames.forEach((field: string, i: number) => { obj[field] = row[i]; });
      return obj;
    });
  }

  // Helper: find HubSpot Company by property
  private async findHubSpotCompany(propertyName: string, value: string): Promise<any | null> {
    if (!value) return null;
    try {
      const response = await hubspotApi.post<any>('/crm/v3/objects/companies/search', {
        filterGroups: [{ filters: [{ propertyName, operator: "EQ", value: String(value) }] }],
        properties: ["name", "cnpj", "cpf", "codparc"]
      });
      return response.data.total > 0 ? response.data.results[0] : null;
    } catch (err: any) {
      console.warn(`[SEARCH WARN] ${propertyName}=${value}: ${err.message}`);
      return null;
    }
  }

  // Helper: find HubSpot Product by SKU
  private async findHubSpotProduct(sku: string): Promise<any | null> {
    if (!sku) return null;
    try {
      const response = await hubspotApi.post<any>('/crm/v3/objects/products/search', {
        filterGroups: [{ filters: [{ propertyName: "hs_sku", operator: "EQ", value: String(sku) }] }],
        properties: ["name", "hs_sku", "description", "unit_of_measure"]
      });
      return response.data.total > 0 ? response.data.results[0] : null;
    } catch (err: any) {
      console.warn(`[PRODUCT SEARCH WARN] SKU=${sku}: ${err.message}`);
      return null;
    }
  }

  // ================================================================
  // IMPORT PARTNERS
  // ================================================================

  public async importPartners(opts: { since?: string; limit?: number; offset?: number }) {
    console.log("[IMPORT] ========== INÍCIO DA IMPORTAÇÃO ==========");
    const { since, limit, offset = 0 } = opts;

    let query = `
      SELECT P.CODPARC, P.NOMEPARC, P.RAZAOSOCIAL, P.CGC_CPF, P.EMAIL, P.TELEFONE, 
             P.CEP, P.NUMEND, P.COMPLEMENTO, P.TIPPESSOA, P.INSCESTADNAUF, 
             P.FORNECEDOR, P.CLIENTE, P.CODTAB, P.CODVEND, P.LIMCRED, 
             P.BLOQUEAR, P.EMAILNFE, P.CODCID, P.DTALTER,
             P.TIPOFATUR, P.OBSERVACOES, P.CODGRUPO, P.CLASSIFICMS,
             NVL(EDR.TIPO,'') || ' ' || NVL(EDR.NOMEEND,'') AS ENDERECO,
             BAI.NOMEBAI AS BAIRRO, CID.NOMECID
      FROM TGFPAR P
      LEFT JOIN TSIEND EDR ON EDR.CODEND = P.CODEND
      LEFT JOIN TSICID CID ON CID.CODCID = P.CODCID
      LEFT JOIN TSIBAI BAI ON BAI.CODBAI = P.CODBAI
      WHERE P.ATIVO = 'S' AND P.TIPPESSOA = 'J'
    `;
    if (since) query += ` AND P.DTALTER >= TO_DATE('${since}', 'YYYY-MM-DD"T"HH24:MI:SS')`;
    query += ` ORDER BY P.CODPARC DESC`;
    const effectiveLimit = limit !== undefined ? limit : 1000;
    if (offset > 0) query += ` OFFSET ${offset} ROWS`;
    if (effectiveLimit > 0) query += ` FETCH FIRST ${effectiveLimit} ROWS ONLY`;

    const partners = await this.executeSankhyaQuery(query) || [];
    console.log(`[IMPORT] ${partners.length} parceiros a processar${since ? ` (desde ${since})` : ''}`);

    const stats = { created: 0, updated: 0, errors: 0, skipped: 0 };
    const auditLog: any[] = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

    for (const parc of partners) {
      const taxId = parc.CGC_CPF ? String(parc.CGC_CPF).replace(/\D/g, '') : null;
      const sankhyaId = String(parc.CODPARC);
      const isPJ = taxId && taxId.length === 14;
      const isPF = taxId && taxId.length === 11;

      let company = null;
      let matchedBy: string | null = null;

      if (isPJ) { company = await this.findHubSpotCompany("cnpj", taxId); if (company) matchedBy = "CNPJ"; }
      if (!company && isPF) { company = await this.findHubSpotCompany("cpf", taxId); if (company) matchedBy = "CPF"; }
      if (!company) { company = await this.findHubSpotCompany("codparc", sankhyaId); if (company) matchedBy = "CODPARC"; }

      const properties: Record<string, any> = {
        name: parc.NOMEPARC || parc.RAZAOSOCIAL,
        razao_social: parc.RAZAOSOCIAL || undefined,
        codparc: sankhyaId, sankhya_partner_id: sankhyaId, ativo_sankhya: true,
        email: parc.EMAIL || undefined, phone: parc.TELEFONE ? String(parc.TELEFONE) : undefined,
        address: parc.ENDERECO || undefined, numero_do_endereco: parc.NUMEND || undefined,
        bairro: parc.BAIRRO || undefined, city: parc.NOMECID || undefined, zip: parc.CEP || undefined,
        inscricao_estadual: parc.INSCESTADNAUF || undefined,
        limite_credito: parc.LIMCRED ? Number(parc.LIMCRED) : undefined,
        bloqueado_financeiro: parc.BLOQUEAR === 'S',
        email_nfe: parc.EMAILNFE || undefined, tipo_pagamento: parc.TIPOFATUR || undefined,
        description: parc.OBSERVACOES || undefined,
        grupo_parceiro: parc.CODGRUPO ? String(parc.CODGRUPO) : undefined,
        classificacao_icms: parc.CLASSIFICMS || undefined,
        tabela_preco_id: parc.CODTAB ? String(parc.CODTAB) : undefined,
        codvend: parc.CODVEND ? Number(parc.CODVEND) : undefined,
        is_cliente: parc.CLIENTE === 'S', is_fornecedor: parc.FORNECEDOR === 'S',
        tipo_de_pessoa: parc.TIPPESSOA === 'J' ? 'Jurídica' : 'Física'
      };
      if (isPJ) properties.cnpj = taxId;
      if (isPF) properties.cpf = taxId;
      Object.keys(properties).forEach(k => properties[k] === undefined && delete properties[k]);

      try {
        if (company) {
          await hubspotApi.patch(`/crm/v3/objects/companies/${company.id}`, { properties });
          console.log(`[UPDATE] ${matchedBy} -> ID ${company.id} - ${properties.name}`);
          stats.updated++;
          auditLog.push({ op: "UPDATE", sankhyaId, hubspotId: company.id, matchedBy });
        } else {
          const createResp = await hubspotApi.post<any>(`/crm/v3/objects/companies`, { properties });
          console.log(`[CREATE] ${properties.name} -> ID ${createResp.data.id}`);
          stats.created++;
          auditLog.push({ op: "CREATE", sankhyaId, hubspotId: createResp.data.id });
        }
      } catch (err: any) {
        const errMsg = err.response?.data?.message || err.message;
        console.error(`[ERROR] Parc ${sankhyaId}: ${errMsg}`);
        stats.errors++;
        auditLog.push({ op: "ERROR", sankhyaId, error: errMsg });
      }
      await delay(120);
    }

    console.log(`[IMPORT] ========== FIM: ${JSON.stringify(stats)} ==========`);
    return { status: "SUCCESS", stats, processed: partners.length, nextOffset: offset + partners.length, auditLog: auditLog.slice(0, 20) };
  }

  // ================================================================
  // IMPORT PRODUCTS
  // ================================================================

  public async importProducts(opts: { since?: string; limit?: number; offset?: number }) {
    console.log("[PRODUCT IMPORT] ========== INÍCIO DA IMPORTAÇÃO ==========");
    const { since, limit, offset = 0 } = opts;

    let query = `
      SELECT P.CODPROD, P.DESCRPROD, P.COMPLDESC, P.CODVOL, P.ATIVO, P.REFERENCIA, P.PESOLIQ, P.DTALTER, P.NCM, P.MARCA, P.PESOBRUTO,
        P.TEMIPIVENDA, P.TEMIPICOMPRA, P.TEMICMS, P.TEMINSS, P.TEMCOMISSAO, P.CALCDIFAL, P.TEMCIAP, 
        P.PERCCMTEST, P.PERCCMTFED, P.PERCCMTIMP,
        P.GRUPOICMS, P.GRUPOPIS, P.GRUPOCOFINS, P.GRUPOCSSL, P.CSTIPIENT, P.CSTIPISAI, P.CODESPECST,
        P.LARGURA, P.ALTURA, P.ESPESSURA, P.FABRICANTE, P.CNPJFABRICANTE, P.CODLOCALPADRAO,
        G.DESCRGRUPOPROD, V.DESCRVOL,
        (SELECT VLRVENDA FROM TGFEXC WHERE CODPROD = P.CODPROD AND NUTAB = 37 AND ROWNUM = 1) AS PRECO_TAB37,
        (SELECT VLRVENDA FROM TGFEXC WHERE CODPROD = P.CODPROD AND NUTAB = 35 AND ROWNUM = 1) AS PRECO_TAB35,
        (SELECT VLRVENDA FROM TGFEXC WHERE CODPROD = P.CODPROD AND NUTAB = 67 AND ROWNUM = 1) AS PRECO_TAB67,
        E.VLRVENDA AS PRECO_MAX_TOP10
      FROM TGFPRO P
      LEFT JOIN TGFGRU G ON P.CODGRUPOPROD = G.CODGRUPOPROD
      LEFT JOIN TGFVOL V ON P.CODVOL = V.CODVOL
      LEFT JOIN (SELECT CODPROD, MAX(VLRVENDA) as VLRVENDA FROM TGFEXC WHERE NUTAB IN (37,35,67,42,66,40,41,49,65,47) GROUP BY CODPROD) E ON P.CODPROD = E.CODPROD
      WHERE P.ATIVO = 'S'
    `;
    if (since) query += ` AND P.DTALTER >= TO_DATE('${since}', 'YYYY-MM-DD"T"HH24:MI:SS')`;
    query += ` ORDER BY P.CODPROD DESC`;
    const effectiveLimit = limit !== undefined ? limit : 1000;
    if (offset > 0) query += ` OFFSET ${offset} ROWS`;
    if (effectiveLimit > 0) query += ` FETCH FIRST ${effectiveLimit} ROWS ONLY`;

    const products = await this.executeSankhyaQuery(query) || [];
    console.log(`[PRODUCT IMPORT] ${products.length} produtos a processar`);

    const stats = { created: 0, updated: 0, errors: 0, skipped: 0 };
    const auditLog: any[] = [];
    const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
    const boolStr = (val: any) => (val === 'S' || val === 's') ? "true" : "false";
    const mapIpiEntrada = (val: any) => { const s = val ? String(val).trim().padStart(2, '0') : ""; if (s === '49') return '49-Outras Entradas'; if (s === '03') return '03-Entrada Não Tributada'; if (s === '-1') return '(-1)-Não sujeita ao IPI'; return val ? String(val) : undefined; };
    const mapIpiSaida = (val: any) => { const s = val ? String(val).trim().padStart(2, '0') : ""; if (s === '99') return '99-Outras Saídas'; if (s === '53') return '53-Saída Não Tributada'; if (s === '-1') return '(-1)-Não sujeita ao IPI'; return val ? String(val) : undefined; };

    for (const prod of products) {
      const sku = String(prod.CODPROD);
      const hsProduct = await this.findHubSpotProduct(sku);
      const priceDefault = prod.PRECO_MAX_TOP10 || prod.PRECO_TAB37 || prod.PRECO_TAB35 || undefined;

      const properties: Record<string, any> = {
        name: prod.DESCRPROD, price: priceDefault, hs_price_brl: priceDefault, hs_sku: sku,
        description: prod.COMPLDESC || undefined, ativo: boolStr(prod.ATIVO),
        pv1: prod.PRECO_TAB37 || undefined, pv2: prod.PRECO_TAB35 || undefined, pv3: prod.PRECO_TAB67 || undefined,
        tem_ipi_na_venda: boolStr(prod.TEMIPIVENDA), tem_ipi_na_compra: boolStr(prod.TEMIPICOMPRA),
        calcular_icms: boolStr(prod.TEMICMS), tem_inss: boolStr(prod.TEMINSS),
        calcular_comissao: boolStr(prod.TEMCOMISSAO), calcular_difal: boolStr(prod.CALCDIFAL), atualizar_ciap: boolStr(prod.TEMCIAP),
        ncm: prod.NCM ? Number(String(prod.NCM).replace(/\D/g, '')) : undefined,
        cest__codigo_especificador_st: prod.CODESPECST ? Number(prod.CODESPECST) : undefined,
        grupo_icms: prod.GRUPOICMS || undefined, grupo_pis: prod.GRUPOPIS || undefined,
        grupo_cofins: prod.GRUPOCOFINS || undefined, grupo_csll: prod.GRUPOCSSL || undefined,
        codigo_sittribipi_entrada: mapIpiEntrada(prod.CSTIPIENT), codigo_sittribipi_saida: mapIpiSaida(prod.CSTIPISAI),
        carga_media_trib_estadual: prod.PERCCMTEST ? Number(prod.PERCCMTEST) : undefined,
        carga_media_trib_federal: prod.PERCCMTFED ? Number(prod.PERCCMTFED) : undefined,
        carga_media_trib_importacao: prod.PERCCMTIMP ? Number(prod.PERCCMTIMP) : undefined,
        peso_bruto: prod.PESOBRUTO ? Number(prod.PESOBRUTO) : undefined, unidade: prod.CODVOL || undefined,
        marca: prod.MARCA || undefined, fabricante: prod.FABRICANTE || undefined,
        cnpj_fabricante: prod.CNPJFABRICANTE ? String(prod.CNPJFABRICANTE) : undefined,
        referencia_ean: prod.REFERENCIA || undefined, complemento_snk: prod.COMPLDESC || undefined,
        local_padrao: prod.CODLOCALPADRAO ? String(prod.CODLOCALPADRAO) : undefined,
        grupo: prod.DESCRGRUPOPROD || undefined, sankhya_product_id: Number(sku), codprod: Number(sku)
      };
      Object.keys(properties).forEach(k => properties[k] === undefined && delete properties[k]);

      try {
        if (hsProduct) {
          await hubspotApi.patch(`/crm/v3/objects/products/${hsProduct.id}`, { properties });
          stats.updated++;
          auditLog.push({ op: "UPDATE", sku, hubspotId: hsProduct.id });
        } else {
          const createResp = await hubspotApi.post<any>(`/crm/v3/objects/products`, { properties });
          stats.created++;
          auditLog.push({ op: "CREATE", sku, hubspotId: createResp.data.id });
        }
      } catch (err: any) {
        const errMsg = err.response?.data?.message || err.message;
        console.error(`[ERROR PRODUCT] SKU ${sku}: ${errMsg}`);
        stats.errors++;
        auditLog.push({ op: "ERROR", sku, error: errMsg });
      }
      await delay(120);
    }

    return { status: "SUCCESS", stats, processed: products.length, nextOffset: offset + products.length, auditLog: auditLog.slice(0, 20) };
  }
}

export const syncService = new SyncService();
