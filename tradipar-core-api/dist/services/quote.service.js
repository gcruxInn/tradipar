"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteService = void 0;
const sankhya_api_1 = require("../adapters/sankhya.api");
const hubspot_api_1 = require("../adapters/hubspot.api");
const form_data_1 = __importDefault(require("form-data"));
class QuoteService {
    async createQuote(dealId) {
        console.log(`[QUOTE] Buscando Deal ${dealId}...`);
        const props = ['codemp_sankhya', 'sankhya_codemp', 'amount', 'dealname', 'closedate', 'tipo_negociacao', 'dealtype', 'natureza_id', 'hubspot_owner_id', 'observacao', 'observacao_frete', 'observacao_interna'];
        const dealResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/deals/${dealId}?properties=${props.join(',')}`);
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
        const companyAssocResp = await hubspot_api_1.hubspotApi.get(companyAssocUrl);
        const companyId = companyAssocResp.data.results?.[0]?.id;
        if (!companyId)
            throw new Error("Deal não possui Company associada");
        const companyResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/companies/${companyId}?properties=sankhya_codparc,codparc`);
        const codParcRaw = companyResp.data.properties.sankhya_codparc || companyResp.data.properties.codparc;
        const codParc = parseInt(codParcRaw, 10);
        if (!codParc)
            throw new Error("Company não possui código Sankhya (sankhya_codparc ou codparc)");
        // Line items
        const lineItemsAssocUrl = `/crm/v3/objects/deals/${dealId}/associations/line_items`;
        const lineItemsAssocResp = await hubspot_api_1.hubspotApi.get(lineItemsAssocUrl);
        const lineItemIds = lineItemsAssocResp.data.results?.map((r) => r.id) || [];
        if (lineItemIds.length === 0)
            throw new Error("Deal não possui Line Items associados");
        const lineItemsResp = await hubspot_api_1.hubspotApi.post(`/crm/v3/objects/line_items/batch/read`, {
            properties: ["hs_product_id", "quantity", "price", "name", "hs_sku"],
            inputs: lineItemIds.map((id) => ({ id }))
        });
        const lineItems = lineItemsResp.data.results;
        const productItems = [];
        for (const item of lineItems) {
            const hsProductId = item.properties.hs_product_id;
            const quantity = parseFloat(item.properties.quantity) || 0;
            const price = parseFloat(item.properties.price) || 0;
            let sku = item.properties.hs_sku;
            if (!sku && hsProductId) {
                try {
                    const prodResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/products/${hsProductId}?properties=hs_sku`);
                    sku = prodResp.data.properties.hs_sku;
                }
                catch (e) {
                    console.error(`[QUOTE] Erro ao buscar SKU do produto ${hsProductId}: ${e.message}`);
                }
            }
            if (sku)
                sku = String(sku).split('#')[0].trim();
            const codProd = parseInt(sku, 10);
            if (!codProd)
                continue;
            const prodInfoSql = `SELECT CODVOL FROM TGFPRO WHERE CODPROD = ${codProd}`;
            const prodInfoResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
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
        if (productItems.length === 0)
            throw new Error("Nenhum produto válido encontrado nos Line Items");
        const vlrNota = productItems.reduce((sum, item) => sum + item.vlrTot, 0);
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
        const notaResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mgecom/service.sbr?serviceName=CACSP.incluirNota&outputType=json', notaBody);
        let nunotaRaw = notaResp.data?.responseBody?.pk?.NUNOTA
            || notaResp.data?.responseBody?.NUNOTA
            || notaResp.data?.responseBody?.nota?.NUNOTA;
        const nunota = (nunotaRaw && typeof nunotaRaw === 'object' && nunotaRaw.$) ? nunotaRaw.$ : nunotaRaw;
        if (!nunota) {
            throw new Error(`Falha ao criar orçamento no Sankhya. Verifique os logs. Data: ${JSON.stringify(notaResp.data)}`);
        }
        let hubspotUpdateSuccess = false;
        try {
            await hubspot_api_1.hubspotApi.updateDeal(dealId, { orcamento_sankhya: nunota.toString() });
            hubspotUpdateSuccess = true;
        }
        catch (e) {
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
    async convertToOrder(dealId) {
        const dealResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/deals/${dealId}?properties=ordem_de_compra_anexo`);
        if (!dealResp.data.properties.ordem_de_compra_anexo) {
            throw new Error("PO não anexado.");
        }
        await hubspot_api_1.hubspotApi.updateDeal(dealId, { dealstage: 'closedwon' });
        return { status: "SUCCESS" };
    }
    async getProfitabilityInternal(nunota, codemp = null) {
        try {
            const paramsObj = { nuNota: Number(nunota), recalcular: "true", recalcularRentabilidade: "true", atualizarRentabilidade: true };
            if (codemp)
                paramsObj.CODEMP = Number(codemp);
            const payload = {
                serviceName: "LiberacaoLimitesSP.getDadosRentabilidade",
                requestBody: { params: paramsObj }
            };
            const resp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=LiberacaoLimitesSP.getDadosRentabilidade&outputType=json', payload);
            const data = resp.data?.responseBody;
            if (!data)
                return { success: false, error: "Dados de rentabilidade não encontrados no Sankhya" };
            const parsePercent = (str) => parseFloat(String(str).replace(',', '.').replace('%', '')) || 0;
            const extractProducts = (prodData) => {
                if (!prodData?.entities?.entity)
                    return [];
                const ent = prodData.entities.entity;
                const items = Array.isArray(ent) ? ent : [ent];
                return items.map((i) => ({
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
        }
        catch (e) {
            return { success: false, error: e.message };
        }
    }
    async getQuoteStatus(dealId) {
        const dealResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/deals/${dealId}?properties=orcamento_sankhya,dealname`);
        const nunota = dealResp.data.properties?.orcamento_sankhya;
        const dealname = dealResp.data.properties?.dealname;
        if (!nunota) {
            return {
                success: true,
                status: {
                    dealId, dealname, hasQuote: false, nunota: null, isConfirmed: false,
                    profitability: null, buttonAction: "CREATE_QUOTE", buttonLabel: "Criar Orçamento"
                }
            };
        }
        const notaStatusSql = `SELECT STATUSNOTA, STATUSNFE, VLRNOTA, CONFIRMADA, CODEMP FROM TGFCAB WHERE NUNOTA = ${nunota}`;
        const notaResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
            serviceName: "DbExplorerSP.executeQuery",
            requestBody: { sql: notaStatusSql }
        });
        const notaRow = notaResp.data?.responseBody?.rows?.[0];
        const statusNota = notaRow?.[0] || "P";
        const vlrNota = parseFloat(notaRow?.[2]) || 0;
        const confirmada = notaRow?.[3] || "N";
        const codemp = notaRow?.[4];
        const isConfirmed = statusNota !== "P" || confirmada === "S";
        const profResult = await this.getProfitabilityInternal(nunota, codemp);
        const profitability = profResult.profitability;
        const isRentavel = profitability?.isRentavel || false;
        const profitabilityError = profResult.error;
        let buttonAction, buttonLabel;
        if (!isConfirmed && isRentavel) {
            buttonAction = "CONFIRM_QUOTE";
            buttonLabel = "Confirmar Orçamento";
        }
        else if (statusNota === "A") {
            buttonAction = "NEEDS_APPROVAL";
            buttonLabel = "Aguardando Aprovação";
        }
        else if (statusNota === "L") {
            buttonAction = "GENERATE_PDF";
            buttonLabel = "Gerar PDF";
        }
        else {
            buttonAction = "VIEW_QUOTE";
            buttonLabel = "Ver Orçamento";
        }
        return {
            success: true,
            status: {
                dealId, dealname, hasQuote: true, nunota: Number(nunota),
                statusNota, isConfirmed, vlrNota, profitability, profitabilityError,
                isRentavel, recalc_needed: (profitability && profitability.lucro === 0 && profitability.qtdItens > 0),
                buttonAction, buttonLabel
            }
        };
    }
    async confirmQuote(dealId, nunota, forceConfirm = false) {
        const profResult = await this.getProfitabilityInternal(nunota);
        if (!profResult.success || !profResult.profitability) {
            throw new Error(`Não foi possível verificar rentabilidade: ${profResult.error}`);
        }
        const profitability = profResult.profitability;
        const needsRelease = !profitability.isRentavel;
        if (needsRelease && !forceConfirm) {
            return {
                success: true,
                confirmed: false,
                needsRelease: true,
                profitability,
                message: "Liberação necessária antes de confirmar. Lucro abaixo do mínimo permitido."
            };
        }
        const confirmResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mgecom/service.sbr?serviceName=CACSP.confirmarNota&outputType=json', {
            serviceName: "CACSP.confirmarNota",
            requestBody: { nota: { NUNOTA: { "$": String(nunota) } } }
        });
        if (confirmResp.data.status !== "1") {
            throw new Error(`Falha ao confirmar nota: ${confirmResp.data.statusMessage || 'Erro desconhecido'}`);
        }
        let confirmedNunota = nunota;
        const pkNunota = confirmResp.data?.responseBody?.pk?.NUNOTA;
        if (pkNunota)
            confirmedNunota = (typeof pkNunota === 'object' && pkNunota.$) ? pkNunota.$ : pkNunota;
        let nrNota = null;
        try {
            const nrNotaResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
                serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: `SELECT NRNOTA FROM TGFCAB WHERE NUNOTA = ${confirmedNunota}` }
            });
            nrNota = nrNotaResp.data?.responseBody?.rows?.[0]?.[0];
        }
        catch (e) {
            console.warn(`[CONFIRM-QUOTE] Falha ao buscar NRNOTA`, e);
        }
        let nuUnicoPedido = null;
        try {
            const pedidoResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
                serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: `SELECT NUNOTA FROM TGFCAB WHERE NUNOTAORIG = ${confirmedNunota} AND CODTIPOPER = 1010 ORDER BY NUNOTA DESC` }
            });
            nuUnicoPedido = pedidoResp.data?.responseBody?.rows?.[0]?.[0];
        }
        catch (e) {
            console.warn(`[CONFIRM-QUOTE] Pedido TOP 1010 não encontrado`, e);
        }
        const dealProperties = {
            sankhya_nunota: String(nrNota || confirmedNunota),
            dealstage: 'qualifiedtobuy' // original was dealing with another stage, adjusting as the original `qualifiedtobuy` is usually correct for the workflow
        };
        if (nuUnicoPedido)
            dealProperties.sankhya_nu_unico_pedido = String(nuUnicoPedido);
        await hubspot_api_1.hubspotApi.updateDeal(dealId, dealProperties);
        return {
            success: true,
            confirmed: true,
            nunota: confirmedNunota,
            nrNota,
            nuUnicoPedido,
            message: "Orçamento confirmado e Deal atualizado. Status alterado no HubSpot!"
        };
    }
    async generateSankhyaPDF(nunota) {
        const fileName = `${nunota}_Orcamento`;
        const payload = {
            requestBody: {
                notas: {
                    pedidoWeb: false, portalCaixa: false, gerarpdf: true,
                    nota: [{ nuNota: Number(nunota), tipoImp: 1, impressaoDanfeSimplicado: false, fileName }]
                }
            }
        };
        const resp1 = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mgecom/service.sbr?serviceName=ImpressaoNotasSP.imprimeDocumentos&outputType=json', payload);
        if (resp1.data.status !== '1')
            throw new Error(`Erro ao gerar PDF: ${resp1.data.statusMessage || JSON.stringify(resp1.data)}`);
        const respData = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mgecom/service.sbr?serviceName=ImpressaoNotasSP.getDocumentData&outputType=json', {
            requestBody: { params: { NUNOTA: Number(nunota), FILENAME: fileName } }
        });
        const pdfBase64 = respData.data?.responseBody?.PDF;
        if (!pdfBase64)
            throw new Error('PDF não retornado em getDocumentData');
        const base64Clean = pdfBase64.replace(/^data:.+;base64,/, '');
        return { success: true, fileName: `${fileName}.pdf`, base64: base64Clean };
    }
    async attachPdfToHubspot(dealId, nunota) {
        const pdfData = await this.generateSankhyaPDF(nunota);
        const buffer = Buffer.from(pdfData.base64, 'base64');
        const form = new form_data_1.default();
        form.append('file', buffer, { filename: pdfData.fileName, contentType: 'application/pdf' });
        form.append('options', JSON.stringify({ access: 'PRIVATE', overwrite: false }));
        form.append('folderPath', '/Orcamentos');
        const hsUploadResp = await hubspot_api_1.hubspotApi.post('https://api.hubapi.com/files/v3/files', form, {
            headers: { ...form.getHeaders() }
        });
        const fileId = hsUploadResp.data.id;
        const url = hsUploadResp.data.url;
        const notePayload = {
            properties: {
                hs_timestamp: new Date().toISOString(),
                hs_note_body: `Orçamento Sankhya #${nunota} anexado automaticamente.`,
                hs_attachment_ids: String(fileId)
            },
            associations: [{
                    to: { id: dealId },
                    types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 214 }]
                }]
        };
        const noteResp = await hubspot_api_1.hubspotApi.post('/crm/v3/objects/notes', notePayload);
        return {
            success: true,
            dealId,
            nunota,
            fileId,
            fileUrl: url,
            noteId: noteResp.data.id,
            message: `PDF do orçamento ${nunota} anexado ao Deal ${dealId} com sucesso!`
        };
    }
}
exports.quoteService = new QuoteService();
