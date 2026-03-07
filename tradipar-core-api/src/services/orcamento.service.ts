import { hubspotApi } from '../adapters/hubspot.api';
import { sankhyaApi } from '../adapters/sankhya.api';

export class OrcamentoService {
  /**
   * Generates an order/quote header in Sankhya purely from HubSpot Deal data.
   */
  public async generateHeader(dealId: string): Promise<{ nunota: number; codnat: number | string }> {
    console.log(`[OrcamentoService] Generating header for Deal ID: ${dealId}`);

    // 1. Fetch Deal Data
    const dealData = await hubspotApi.getDeal(dealId, [
        'codemp_sankhya', 'sankhya_codemp', 'dealname', 'closedate', 'tipo_negociacao', 
        'dealtype', 'hubspot_owner_id', 'observacao', 'observacao_frete', 'observacao_interna'
    ]);
    const props = dealData.properties;

    // 2. Extract CODEMP
    const codEmpRaw = props.codemp_sankhya || props.sankhya_codemp || "1";
    const codEmp = parseInt(codEmpRaw, 10) || 1;

    // 3. Fetch Company (CODPARC)
    const companyAssocResponse = await hubspotApi.get<any>(`/crm/v3/objects/deals/${dealId}/associations/companies`);
    const companyId = companyAssocResponse.data?.results?.[0]?.id;
    if (!companyId) {
      throw new Error(`Deal ${dealId} does not have an associated Company/Parceiro`);
    }

    const companyData = await hubspotApi.get<any>(`/crm/v3/objects/companies/${companyId}?properties=sankhya_codparc,codparc`);
    const codParcRaw = companyData.data.properties.sankhya_codparc || companyData.data.properties.codparc;
    const codParc = parseInt(codParcRaw, 10);
    
    if (!codParc) {
      throw new Error(`Associated company ${companyId} does not have a defined Sankhya CODPARC.`);
    }

    // 4. Determine Defaults from TGFPAR
    let parcTipVenda: string | null = null;
    let parcVend: string | null = null;
    let parcNat: string | null = null;

    try {
      const parcQuery = {
        serviceName: "DbExplorerSP.executeQuery",
        requestBody: {
          sql: `SELECT CODTIPVENDA, CODVEND, AD_CODNAT FROM TGFPAR WHERE CODPARC = ${codParc}`
        }
      };
      
      const parcResp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', parcQuery);
      const row = parcResp.data.responseBody?.rows?.[0];
      if (row) {
        parcTipVenda = row[0];
        parcVend = row[1];
        parcNat = row[2];
        console.log(`[OrcamentoService] Parceiro defaults: CODTIPVENDA=${parcTipVenda}, CODVEND=${parcVend}, AD_CODNAT=${parcNat}`);
      }
    } catch (e: any) {
      console.warn(`[OrcamentoService] Failed to fetch partner defaults: ${e.message}`);
    }

    // 5. Preparation logic
    const codTipOperRaw = props.dealtype;
    const codTipOper = parseInt(codTipOperRaw, 10) || 999;
    
    const codTipVendaRaw = props.tipo_negociacao;
    const codTipVenda = parseInt(codTipVendaRaw, 10) || (parcTipVenda ? parseInt(parcTipVenda, 10) : 503);

    const codVend = parcVend ? parseInt(parcVend, 10) : 0;
    
    // Formatting date to DD/MM/YYYY
    const dt = new Date();
    const dtNeg = `${String(dt.getDate()).padStart(2, '0')}/${String(dt.getMonth() + 1).padStart(2, '0')}/${dt.getFullYear()}`;

    // 6. Build CACSP payload
    console.log(`[OrcamentoService] Building header for NUNOTA creation...`);

    const INCLUIR_NOTA_URL = `/gateway/v1/mgecom/service.sbr?serviceName=CACSP.incluirNota&outputType=json`;
    const notaBody = {
      serviceName: "CACSP.incluirNota",
      requestBody: {
        nota: {
          cabecalho: {
            NUNOTA: { "$": "" },
            CODEMP: { "$": codEmp },
            CODPARC: { "$": codParc },
            CODTIPOPER: { "$": codTipOper },
            CODEMPNEGOC: { "$": codEmp },
            CODVEND: { "$": codVend },
            TIPMOV: { "$": "P" },
            DTNEG: { "$": dtNeg },
            CODCENCUS: { "$": 101002 },
            CODTIPVENDA: { "$": codTipVenda },
            CODNAT: { "$": parcNat || "101001" },
            OBSERVACAO: { "$": props.observacao || "" },
            AD_OBSFRETE: { "$": props.observacao_frete || "" },
            AD_OBSERVACAOINTERNA: { "$": props.observacao_interna || "" }
          }
        }
      }
    };

    const createResp = await sankhyaApi.post<any>(INCLUIR_NOTA_URL, notaBody);

    if (createResp.data.status !== "1") {
      const errorDesc = createResp.data.statusMessage || JSON.stringify(createResp.data);
      throw new Error(`Sankhya Header Creation Error: ${errorDesc}`);
    }

    // 7. Extract NUNOTA
    const pkRaw = createResp.data.responseBody?.pk?.NUNOTA?.$ || createResp.data.responseBody?.nota?.cabecalho?.NUNOTA?.$;
    const nunota = parseInt(pkRaw, 10);

    if (!nunota) {
      throw new Error("Sankhya did not return a valid NUNOTA after header creation.");
    }
    console.log(`[OrcamentoService] Header successfully created with NUNOTA ${nunota}`);

    // 8. Fetch Auto-generated CODNAT
    let codNat: string | number = "101001";
    try {
      const queryPayload = {
        serviceName: "DbExplorerSP.executeQuery",
        requestBody: {
          sql: `SELECT CODNAT FROM TGFCAB WHERE NUNOTA = ${nunota}`
        }
      };
      const queryResp = await sankhyaApi.post<any>(
        `/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`,
        queryPayload
      );
      codNat = queryResp.data.responseBody?.rows?.[0]?.[0] || codNat;
      console.log(`[OrcamentoService] Evaluated CODNAT for NUNOTA ${nunota}: ${codNat}`);
    } catch (e: any) {
      console.warn(`[OrcamentoService] Failed to evaluate auto CODNAT: ${e.message}`);
    }

    // 9. Update HubSpot Deal
    try {
      await hubspotApi.updateDeal(dealId, {
        orcamento_sankhya: nunota.toString(),
        natureza_id: codNat.toString()
      });
      console.log(`[OrcamentoService] Deal ${dealId} synced with NUNOTA ${nunota}`);
    } catch (e: any) {
      console.warn(`[OrcamentoService] Deal sync failed but NUNOTA was created: ${e.message}`);
    }

    return { nunota, codnat: codNat };
  }

  /**
   * Syncs line items from a HubSpot Deal to a Sankhya Order (NUNOTA) handling
   * insert, update, and deletions (diff approach).
   */
  public async syncQuoteItems(dealId: string, nunota: number | string): Promise<{ success: boolean; itemsCount: number; message: string; errors?: string[] }> {
    console.log(`[OrcamentoService] Syncing items for Deal ID: ${dealId} to NUNOTA: ${nunota}`);
    const errors: string[] = [];

    // 1. Fetch Line Items from HubSpot
    const lineItemsAssocResp = await hubspotApi.get<any>(`/crm/v3/objects/deals/${dealId}/associations/line_items`);
    const lineItemIds = lineItemsAssocResp.data.results?.map((r: any) => r.id) || [];
    
    if (lineItemIds.length === 0) {
      console.log(`[OrcamentoService] No line items found in HubSpot for Deal ${dealId}.`);
    }

    const { items: hubspotItems, getErrors } = await this.getHubSpotItemsDetails(lineItemIds);
    errors.push(...getErrors);

    // 2. Fetch Existing Items in Sankhya
    const existingItems = await this.getSankhyaExistingItems(nunota);
    
    // 3. Process HubSpot Items -> Insert or Update
    const processedKeys = new Set<string>();

    for (const item of hubspotItems) {
      const key = `${item.codProd}_${item.controle}`;
      processedKeys.add(key);
      const existing = existingItems[key];
      let action = "NONE";

      if (!existing) {
        action = "CREATE";
      } else {
        const qtdDiff = Math.abs(existing.qtd - item.quantity) > 0.001;
        const priceDiff = Math.abs(existing.price - item.currentPrice) > 0.01;
        if (qtdDiff || priceDiff) action = "UPDATE";
      }

      if (action === "NONE") continue;

      try {
        let codVol = existing?.codVol || 'UN';
        let codLocalOrig = existing?.codLocalOrig;

        if (codLocalOrig === undefined || isNaN(codLocalOrig)) {
           // Fallback logical fetching from TGFPRO
           if (!existing) {
              const volResp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
                requestBody: { sql: `SELECT CODVOL FROM TGFPRO WHERE CODPROD = ${item.codProd}` }
              });
              codVol = volResp.data.responseBody?.rows?.[0]?.[0] || 'UN';
           }

           const localResp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
              requestBody: { sql: `SELECT CODLOCALPADRAO FROM TGFPRO WHERE CODPROD = ${item.codProd}` }
           });
           const prodLocal = localResp.data.responseBody?.rows?.[0]?.[0];
           codLocalOrig = prodLocal !== undefined && prodLocal !== "0" ? parseInt(prodLocal, 10) : 10000;
        }

        const itemData: any = {
          NUNOTA: { "$": String(nunota) },
          CODPROD: { "$": item.codProd },
          QTDNEG: { "$": item.quantity },
          VLRUNIT: { "$": item.currentPrice },
          VLRTOT: { "$": (item.quantity * item.currentPrice) },
          CODVOL: { "$": codVol },
          CODLOCALORIG: { "$": codLocalOrig },
          PERCDESC: { "$": 0 },
          VLRDESC: { "$": 0 },
          CONTROLE: { "$": item.controle || "" }
        };

        if (action === "UPDATE" && existing) {
          itemData.SEQUENCIA = { "$": existing.sequencia };
        } else if (action === "CREATE") {
          itemData.SEQUENCIA = { "$": "" };
        }

        const insertPayload = {
          serviceName: "CACSP.incluirAlterarItemNota",
          requestBody: { nota: { NUNOTA: String(nunota), itens: { INFORMARPRECO: "True", item: itemData } } }
        };

        const resp = await sankhyaApi.post<any>(`/gateway/v1/mgecom/service.sbr?serviceName=CACSP.incluirAlterarItemNota&outputType=json`, insertPayload);
        if (resp.data.status !== "1") throw new Error(resp.data.statusMessage || "Erro desconhecido via CACSP");
        
      } catch (err: any) {
        errors.push(`Falha ao ${action} item ${key}: ${err.message}`);
      }
    }

    // 4. Delete items present in Sankhya but not in HubSpot anymore
    for (const [key, existing] of Object.entries(existingItems)) {
      if (!processedKeys.has(key)) {
        try {
          const payload = {
            serviceName: "CACSP.excluirItemNota",
            requestBody: { nota: { NUNOTA: String(nunota), itens: { item: { NUNOTA: { "$": String(nunota) }, SEQUENCIA: { "$": existing.sequencia } } } } }
          };
          const delResp = await sankhyaApi.post<any>(`/gateway/v1/mgecom/service.sbr?serviceName=CACSP.excluirItemNota&outputType=json`, payload);
          if (delResp.data.status !== "1") throw new Error(delResp.data.statusMessage);
        } catch (delErr: any) {
             errors.push(`Falha ao excluir item seq ${existing.sequencia}: ${delErr.message}`);
        }
      }
    }

    if (errors.length > 0) {
        return { success: false, itemsCount: hubspotItems.length, message: "Alguns itens falharam na sincronização", errors };
    }

    return { success: true, itemsCount: hubspotItems.length, message: "Sincronização de itens concluída com sucesso." };
  }


  private async getHubSpotItemsDetails(lineItemIds: string[]) {
    const items: Array<{ id: string, name: string, codProd: number, quantity: number, currentPrice: number, controle: string }> = [];
    const getErrors: string[] = [];

    if (lineItemIds.length === 0) return { items, getErrors };

     try {
        const lineItemsBatchResp = await hubspotApi.post<any>('/crm/v3/objects/line_items/batch/read', {
          properties: ["hs_product_id", "quantity", "price", "name", "hs_sku", "controle", "sankhya_controle"],
          inputs: lineItemIds.map(id => ({ id }))
        });

        const hubspotItems = lineItemsBatchResp.data.results;

        for (const item of hubspotItems) {
            const props = item.properties;
            const quantity = parseFloat(props.quantity) || 0;
            const price = parseFloat(props.price) || 0;
            const hsProductId = props.hs_product_id;
            let sku = props.hs_sku;
            const controle = props.controle || props.sankhya_controle || "";

            if (!sku && hsProductId) {
                try {
                  const prodResp = await hubspotApi.get<any>(`/crm/v3/objects/products/${hsProductId}?properties=hs_sku`);
                  sku = prodResp.data.properties.hs_sku;
                } catch (e: any) {
                   console.warn(`[OrcamentoService] Error fetching sku for HS Product ${hsProductId}`);
                }
            }

            if (sku) {
                sku = String(sku).split('#')[0].trim();
            }

            const codProd = parseInt(sku, 10);
            if (!codProd || isNaN(codProd)) {
                 getErrors.push(`ID Linha ${item.id} ignorado: Sem CODPROD válido/SKU.`);
                 continue;
            }

            items.push({
               id: item.id,
               name: props.name,
               codProd,
               quantity,
               currentPrice: price,
               controle
            });
        }
     } catch (e: any) {
        console.error(`[OrcamentoService] Batch load HS Line items failed`, e.message);
        getErrors.push("Falha ao baixar detalhe dos Itens de Linha do HubSpot.");
     }

     return { items, getErrors };
  }


  private async getSankhyaExistingItems(nunota: string | number) {
      const existingItems: Record<string, any> = {};
      const sql = `SELECT SEQUENCIA, CODPROD, QTDNEG, VLRUNIT, CONTROLE, CODVOL, CODLOCALORIG FROM TGFITE WHERE NUNOTA = ${nunota}`;
      try {
          const queryResp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
            requestBody: { sql }
          });
          const rows = queryResp.data?.responseBody?.rows || [];

          for (const r of rows) {
              const dbCodProd = r[1];
              const dbControle = r[4] || "";
              const key = `${dbCodProd}_${dbControle}`;
              existingItems[key] = {
                  sequencia: parseInt(r[0], 10),
                  codProd: dbCodProd,
                  qtd: parseFloat(r[2]),
                  price: parseFloat(r[3]),
                  controle: dbControle,
                  codVol: r[5] || "UN",
                  codLocalOrig: r[6] !== undefined ? parseInt(r[6], 10) : undefined
              };
          }
      } catch (error: any) {
         console.warn(`[OrcamentoService] Could not fetch existing Sankhya items for diff, error: ${error.message}`);
      }
      return existingItems;
  }
}

export const orcamentoService = new OrcamentoService();
