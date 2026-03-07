import { sankhyaApi } from '../adapters/sankhya.api';
import { hubspotApi } from '../adapters/hubspot.api';
import FormData from 'form-data';

export interface ProfitabilityResponse {
  success: boolean;
  profitability?: any;
  error?: string;
}

class QuoteService {
  public async createQuote(dealId: string) {
    console.log(`[QUOTE] Buscando Deal ${dealId}...`);
    const props = ['codemp_sankhya', 'sankhya_codemp', 'amount', 'dealname', 'closedate', 'tipo_negociacao', 'dealtype', 'natureza_id', 'hubspot_owner_id', 'observacao', 'observacao_frete', 'observacao_interna'];
    const dealResp = await hubspotApi.get<any>(`/crm/v3/objects/deals/${dealId}?properties=${props.join(',')}`);
    const dealProps = dealResp.data.properties;

    const codEmpRaw = dealProps.codemp_sankhya || dealProps.sankhya_codemp || "1";
    const codEmp = parseInt(codEmpRaw, 10) || 1;

    const codTipVendaRaw = dealProps.tipo_negociacao;
    const codTipVenda = parseInt(codTipVendaRaw, 10) || 503;

    const codTipOperRaw = dealProps.dealtype;
    const codTipOper = parseInt(codTipOperRaw, 10) || 999; 

    const codNatRaw = dealProps.natureza_id;
    const codNat = parseInt(codNatRaw, 10) || 101001;
    
    // Associations
    const companyAssocUrl = `/crm/v3/objects/deals/${dealId}/associations/companies`;
    const companyAssocResp = await hubspotApi.get<any>(companyAssocUrl);
    const companyId = companyAssocResp.data.results?.[0]?.id;
    if (!companyId) throw new Error("Deal não possui Company associada");

    const companyResp = await hubspotApi.get<any>(`/crm/v3/objects/companies/${companyId}?properties=sankhya_codparc,codparc`);
    const codParcRaw = companyResp.data.properties.sankhya_codparc || companyResp.data.properties.codparc;
    const codParc = parseInt(codParcRaw, 10);
    if (!codParc) throw new Error("Company não possui código Sankhya (sankhya_codparc ou codparc)");

    // Line items
    const lineItemsAssocUrl = `/crm/v3/objects/deals/${dealId}/associations/line_items`;
    const lineItemsAssocResp = await hubspotApi.get<any>(lineItemsAssocUrl);
    const lineItemIds = lineItemsAssocResp.data.results?.map((r: any) => r.id) || [];
    if (lineItemIds.length === 0) throw new Error("Deal não possui Line Items associados");

    const lineItemsResp = await hubspotApi.post<any>(`/crm/v3/objects/line_items/batch/read`, {
      properties: ["hs_product_id", "quantity", "price", "name", "hs_sku"],
      inputs: lineItemIds.map((id: string) => ({ id }))
    });

    const lineItems = lineItemsResp.data.results;
    const productItems: any[] = [];

    for (const item of lineItems) {
      const hsProductId = item.properties.hs_product_id;
      const quantity = parseFloat(item.properties.quantity) || 0;
      const price = parseFloat(item.properties.price) || 0;
      let sku = item.properties.hs_sku;

      if (!sku && hsProductId) {
        try {
          const prodResp = await hubspotApi.get<any>(`/crm/v3/objects/products/${hsProductId}?properties=hs_sku`);
          sku = prodResp.data.properties.hs_sku;
        } catch (e: any) {
          console.error(`[QUOTE] Erro ao buscar SKU do produto ${hsProductId}: ${e.message}`);
        }
      }

      if (sku) sku = String(sku).split('#')[0].trim();
      const codProd = parseInt(sku, 10);
      if (!codProd) continue;

      const prodInfoSql = `SELECT CODVOL FROM TGFPRO WHERE CODPROD = ${codProd}`;
      const prodInfoResp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
        serviceName: "DbExplorerSP.executeQuery",
        requestBody: { sql: prodInfoSql }
      });
      const codVol = prodInfoResp.data?.responseBody?.rows?.[0]?.[0] || "UN";

      productItems.push({
        codProd,
        codVol,
        qtdNeg: quantity,
        vlrUnit: price,
        vlrTot: quantity * price
      });
    }

    if (productItems.length === 0) throw new Error("Nenhum produto válido encontrado nos Line Items");

    const vlrNota = productItems.reduce((sum: number, item: any) => sum + item.vlrTot, 0);
    const dtNegFormatted = new Date().toLocaleDateString('pt-BR'); 

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
            CODVEND: { "$": 0 },
            TIPMOV: { "$": "P" },
            DTNEG: { "$": dtNegFormatted },
            CODCENCUS: { "$": 101002 },
            CODNAT: { "$": codNat },
            CODTIPVENDA: { "$": codTipVenda },
            OBSERVACAO: { "$": dealProps.observacao || "" },
            AD_OBSFRETE: { "$": dealProps.observacao_frete || "" },
            AD_OBSERVACAOINTERNA: { "$": dealProps.observacao_interna || "" }
          },
          itens: {
            item: productItems.map((item, index) => ({
              NUNOTA: { "$": "" },
              SEQUENCIA: { "$": index + 1 },
              CODEMP: { "$": codEmp },
              CODPROD: { "$": item.codProd },
              CODVOL: { "$": item.codVol },
              CODLOCALORIG: { "$": 0 },
              QTDNEG: { "$": item.qtdNeg },
              VLRUNIT: { "$": item.vlrUnit },
              VLRTOT: { "$": item.vlrTot }
            }))
          }
        }
      }
    };

    const notaResp = await sankhyaApi.post<any>('/gateway/v1/mgecom/service.sbr?serviceName=CACSP.incluirNota&outputType=json', notaBody);
    
    let nunotaRaw = notaResp.data?.responseBody?.pk?.NUNOTA
      || notaResp.data?.responseBody?.NUNOTA
      || notaResp.data?.responseBody?.nota?.NUNOTA;

    const nunota = (nunotaRaw && typeof nunotaRaw === 'object' && nunotaRaw.$) ? nunotaRaw.$ : nunotaRaw;

    if (!nunota) {
      throw new Error(`Falha ao criar orçamento no Sankhya. Verifique os logs. Data: ${JSON.stringify(notaResp.data)}`);
    }

    let hubspotUpdateSuccess = false;
    try {
      await hubspotApi.updateDeal(dealId, { orcamento_sankhya: nunota.toString() });
      hubspotUpdateSuccess = true;
    } catch (e) {
      console.warn(`[QUOTE] Falha ao atualizar Deal no HubSpot: ${e}`);
    }

    return {
      success: true,
      nunota,
      codEmp,
      codParc,
      vlrNota,
      itemCount: productItems.length,
      hubspotUpdated: hubspotUpdateSuccess,
      message: `Orçamento ${nunota} criado com sucesso no Sankhya!`
    };
  }

  public async convertToOrder(dealId: string) {
    const dealResp = await hubspotApi.get<any>(`/crm/v3/objects/deals/${dealId}?properties=ordem_de_compra_anexo`);
    if (!dealResp.data.properties.ordem_de_compra_anexo) {
      throw new Error("PO não anexado.");
    }
    await hubspotApi.updateDeal(dealId, { dealstage: 'closedwon' });
    return { status: "SUCCESS" };
  }

  public async getProfitabilityInternal(nunota: number | string, codemp: number | string | null = null): Promise<ProfitabilityResponse> {
    try {
      const paramsObj: any = { nuNota: Number(nunota), recalcular: "true", recalcularRentabilidade: "true", atualizarRentabilidade: true };
      if (codemp) paramsObj.CODEMP = Number(codemp);

      const payload = {
        serviceName: "LiberacaoLimitesSP.getDadosRentabilidade",
        requestBody: { params: paramsObj }
      };

      const resp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=LiberacaoLimitesSP.getDadosRentabilidade&outputType=json', payload);
      const data = resp.data?.responseBody;

      if (!data) return { success: false, error: "Dados de rentabilidade não encontrados no Sankhya" };

      const parsePercent = (str: any) => parseFloat(String(str).replace(',', '.').replace('%', '')) || 0;
      const extractProducts = (prodData: any) => {
        if (!prodData?.entities?.entity) return [];
        const ent = prodData.entities.entity;
        const items = Array.isArray(ent) ? ent : [ent];
        return items.map((i: any) => ({
          codProd: String(i.CODPROD?.$ || ''),
          percentMC: parsePercent(i.PERCENTMC?.$),
          percentLucro: parsePercent(i.PERCENTLUCRO?.$),
          faturamento: parseFloat(i.FATURAMENTO?.$) || 0,
          lucro: parseFloat(i.LUCRO?.$) || 0
        }));
      };

      const itemProfitabilities = [
        ...extractProducts(data.produtosComCusto),
        ...extractProducts(data.produtosSemCusto)
      ];

      const profitability = {
        nunota: Number(nunota),
        faturamento: parseFloat(data.somaFaturamento) || 0,
        custoMercadoriaVendida: parseFloat(data.somaCustoMercadoriaVendida) || 0,
        gastoVariavel: parseFloat(data.somaGastoVariavel) || 0,
        gastoFixo: parseFloat(data.somaGastoFixo) || 0,
        lucro: parseFloat(data.somaLucro) || 0,
        margemContribuicao: parseFloat(data.margemContrib) || 0,
        percentLucro: parsePercent(data.percentLucro),
        percentMC: parsePercent(data.percentMC),
        percentCMV: parsePercent(data.percentCMV),
        percentGV: parsePercent(data.percentGV),
        percentGF: parsePercent(data.percentGF),
        isRentavel: parseFloat(data.somaLucro) > 0,
        qtdItens: parseInt(data.contItens) || 0,
        itemProfitabilities
      };

      return { success: true, profitability };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  public async getQuoteStatus(dealId: string) {
    const dealResp = await hubspotApi.get<any>(`/crm/v3/objects/deals/${dealId}?properties=orcamento_sankhya,sankhya_nu_unico_pedido,dealname`);
    const nunota = dealResp.data.properties?.orcamento_sankhya;
    const dealname = dealResp.data.properties?.dealname;
    const nuUnicoPedido = dealResp.data.properties?.sankhya_nu_unico_pedido;

    if (!nunota) {
      return {
        success: true,
        status: {
          dealId, dealname, hasQuote: false, nunota: null, isConfirmed: false, isOrderConfirmed: false,
          profitability: null, buttonAction: "CREATE_QUOTE", buttonLabel: "Criar Orçamento"
        }
      };
    }

    const notaStatusSql = `SELECT STATUSNOTA, VLRNOTA, PENDENTE, CODEMP, NUMNOTA FROM TGFCAB WHERE NUNOTA = ${nunota}`;
    const notaResp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
      serviceName: "DbExplorerSP.executeQuery",
      requestBody: { sql: notaStatusSql }
    });

    const notaRow = notaResp.data?.responseBody?.rows?.[0];
    const statusNota = notaRow?.[0] || "P";
    const vlrNota = parseFloat(notaRow?.[1]) || 0;
    const pendente = notaRow?.[2] || "S";
    const codemp = notaRow?.[3];
    const nrNota = notaRow?.[4];

    const isConfirmed = statusNota !== "P";

    let isOrderConfirmed = false;
    if (nuUnicoPedido) {
      try {
        const orderStatusSql = `SELECT STATUSNOTA FROM TGFCAB WHERE NUNOTA = ${nuUnicoPedido}`;
        const orderResp = await sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
          serviceName: "DbExplorerSP.executeQuery",
          requestBody: { sql: orderStatusSql }
        });
        const orderStatusNota = orderResp.data?.responseBody?.rows?.[0]?.[0] || "P";
        isOrderConfirmed = orderStatusNota !== "P";
      } catch (e) {
        console.warn(`[getQuoteStatus] Failed to verify order status for nuUnicoPedido ${nuUnicoPedido}`);
      }
    }

    const profResult = await this.getProfitabilityInternal(nunota, codemp);
    const profitability = profResult.profitability;
    const isRentavel = profitability?.isRentavel || false;
    const profitabilityError = profResult.error;

    let buttonAction, buttonLabel;
    if (!isConfirmed && isRentavel) {
      buttonAction = "CONFIRM_QUOTE"; buttonLabel = "Confirmar Orçamento";
    } else if (statusNota === "A") {
      buttonAction = "NEEDS_APPROVAL"; buttonLabel = "Aguardando Aprovação";
    } else if (statusNota === "L" && !isOrderConfirmed) {
      buttonAction = "PREPARE_ORDER"; buttonLabel = "Preparar Pedido";
    } else if (statusNota === "L" && isOrderConfirmed) {
      buttonAction = "VIEW_ORDER"; buttonLabel = "Ver Pedido";
    } else {
      buttonAction = "VIEW_QUOTE"; buttonLabel = "Ver Orçamento";
    }

    return {
      success: true,
      status: {
        dealId, dealname, hasQuote: true, nunota: Number(nunota), nrNota, nuUnicoPedido,
        statusNota, isConfirmed, isOrderConfirmed, vlrNota, profitability, profitabilityError,
        isRentavel, recalc_needed: (profitability && profitability.lucro === 0 && profitability.qtdItens > 0),
        buttonAction, buttonLabel
      }
    };
  }

  public async confirmQuote(dealId: string, nunota: number, forceConfirm: boolean = false) {
    // Otimização: Skip redundant profitability check if already confirmed by UI or forceConfirm
    if (!forceConfirm) {
        const profResult = await this.getProfitabilityInternal(nunota);
        if (!profResult.success || !profResult.profitability) {
        throw new Error(`Não foi possível verificar rentabilidade: ${profResult.error}`);
        }

        const profitability = profResult.profitability;
        if (!profitability.isRentavel) {
            return {
                success: true,
                confirmed: false,
                needsRelease: true,
                profitability,
                message: "Liberação necessária antes de confirmar. Lucro abaixo do mínimo permitido."
            };
        }
    }

    const confirmResp = await sankhyaApi.post<any>('/gateway/v1/mgecom/service.sbr?serviceName=CACSP.confirmarNota&outputType=json', {
      serviceName: "CACSP.confirmarNota",
      requestBody: { nota: { NUNOTA: { "$": String(nunota) } } }
    });

    if (confirmResp.data.status !== "1") {
      const errorMsg = confirmResp.data.statusMessage || 'Erro desconhecido';
      if (!errorMsg.toLowerCase().includes('já foi confirmada')) {
        throw new Error(`Falha ao confirmar nota: ${errorMsg}`);
      }
      console.log(`[QUOTE CONFIRM] Nota ${nunota} já estava confirmada. Procedendo com a atualização do HubSpot.`);
    }

    let confirmedNunota = nunota;
    const pkNunota = confirmResp.data?.responseBody?.pk?.NUNOTA;
    if (pkNunota) confirmedNunota = (typeof pkNunota === 'object' && pkNunota.$) ? pkNunota.$ : pkNunota;

    // Run nrNota and nuUnicoPedido in parallel to speed up
    const [nrNotaResp, pedidoResp] = await Promise.all([
        sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
            serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: `SELECT NUMNOTA FROM TGFCAB WHERE NUNOTA = ${confirmedNunota}` }
        }).catch(() => null),
        sankhyaApi.post<any>('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
            serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: `SELECT NUNOTA FROM TGFCAB WHERE NUNOTAORIG = ${confirmedNunota} AND CODTIPOPER = 1010 ORDER BY NUNOTA DESC` }
        }).catch(() => null)
    ]);

    const nrNota = nrNotaResp?.data?.responseBody?.rows?.[0]?.[0] || null;
    const nuUnicoPedido = pedidoResp?.data?.responseBody?.rows?.[0]?.[0] || null;

    const dealProperties: any = {
      orcamento_sankhya: String(confirmedNunota),
      sankhya_nunota: String(nrNota || confirmedNunota),
      dealstage: 'qualifiedtobuy' 
    };
    if (nuUnicoPedido) dealProperties.sankhya_nu_unico_pedido = String(nuUnicoPedido);

    await hubspotApi.updateDeal(dealId, dealProperties);

    return {
      success: true,
      confirmed: true,
      nunota: confirmedNunota,
      nrNota,
      nuUnicoPedido,
      message: "Orçamento confirmado e Deal atualizado. Status alterado no HubSpot!"
    };
  }

  public async generateSankhyaPDF(nunota: string | number) {
    const fileName = `${nunota}_Orcamento`;
    const payload = {
      requestBody: {
        notas: {
          pedidoWeb: false, portalCaixa: false, gerarpdf: true,
          nota: [{ nuNota: Number(nunota), tipoImp: 1, impressaoDanfeSimplicado: false, fileName }]
        }
      }
    };

    const resp1 = await sankhyaApi.post<any>('/gateway/v1/mgecom/service.sbr?serviceName=ImpressaoNotasSP.imprimeDocumentos&outputType=json', payload);
    if (resp1.data.status !== '1') throw new Error(`Erro ao gerar PDF: ${resp1.data.statusMessage || JSON.stringify(resp1.data)}`);

    const respData = await sankhyaApi.post<any>('/gateway/v1/mgecom/service.sbr?serviceName=ImpressaoNotasSP.getDocumentData&outputType=json', {
      requestBody: { params: { NUNOTA: Number(nunota), FILENAME: fileName } }
    });

    const pdfBase64 = respData.data?.responseBody?.PDF;
    if (!pdfBase64) throw new Error('PDF não retornado em getDocumentData');

    const base64Clean = pdfBase64.replace(/^data:.+;base64,/, '');
    return { success: true, fileName: `${fileName}.pdf`, base64: base64Clean };
  }

  public async attachPdfToHubspot(dealId: string, nunota: string | number) {
    console.log(`[HS-ATTACH] Gerando PDF para NUNOTA ${nunota}...`);
    const pdfData = await this.generateSankhyaPDF(nunota);
    return this.attachFileToHubspot(dealId, nunota, pdfData.base64, pdfData.fileName);
  }

  public async attachFileToHubspot(dealId: string, nunota: string | number, base64: string, fileName: string) {
    console.log(`[HS-ATTACH] Iniciando upload de ${fileName} para o Deal ${dealId}...`);
    const buffer = Buffer.from(base64, 'base64');
    const form = new FormData();
    form.append('file', buffer, { filename: fileName, contentType: 'application/pdf' });
    form.append('options', JSON.stringify({ access: 'PRIVATE', overwrite: false }));
    form.append('folderPath', '/Orcamentos');

    const hsUploadResp = await hubspotApi.post<any>('https://api.hubapi.com/files/v3/files', form, {
      headers: { ...form.getHeaders() }
    });

    const fileId = hsUploadResp.data.id;
    const url = hsUploadResp.data.url;
    console.log(`[HS-ATTACH] Arquivo ${fileId} ok. Criando nota no Deal ${dealId}...`);

    const notePayload = {
      properties: {
        hs_timestamp: new Date().toISOString(),
        hs_note_body: `Arquivo Sankhya #${nunota} (${fileName}) anexado automaticamente.`,
        hs_attachment_ids: String(fileId)
      },
      associations: [{
        to: { id: dealId },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }]
      }]
    };

    const noteResp = await hubspotApi.post<any>('/crm/v3/objects/notes', notePayload);

    return {
      success: true,
      dealId,
      nunota,
      fileId,
      fileUrl: url,
      noteId: noteResp.data.id,
      message: `PDF ${nunota} anexado ao Deal ${dealId} com sucesso!`
    };
  }
}

export const quoteService = new QuoteService();