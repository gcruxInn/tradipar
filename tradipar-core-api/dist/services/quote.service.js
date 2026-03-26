"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteService = void 0;
const sankhya_api_1 = require("../adapters/sankhya.api");
const hubspot_api_1 = require("../adapters/hubspot.api");
const form_data_1 = __importDefault(require("form-data"));
// Error parser: Translate Sankhya technical errors to user-friendly messages
function parseSankhyaError(rawMsg) {
    const msg = String(rawMsg || '').toLowerCase();
    if (msg.includes('estoque') || msg.includes('saldo insuficiente'))
        return 'Estoque insuficiente para faturar este item.';
    if (msg.includes('cfop'))
        return 'Erro de CFOP: configuração fiscal incorreta. Contate o suporte.';
    if (msg.includes('crédito') || msg.includes('limite'))
        return 'Cliente sem limite de crédito disponível.';
    if (msg.includes('bloqueado') || msg.includes('liberação'))
        return 'Pedido aguardando aprovação/liberação.';
    if (msg.includes('nota já foi faturada') || msg.includes('já faturada'))
        return 'Esta nota já foi faturada anteriormente.';
    if (msg.includes('série') || msg.includes('numeração'))
        return 'Erro de numeração fiscal. Contate o suporte.';
    // Clean generic message (no stack trace)
    return rawMsg.split('\n')[0].slice(0, 200);
}
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
        const codTipOper = parseInt(dealProps.dealtype, 10);
        if (!codTipOper) {
            throw new Error("A propriedade 'dealtype' é obrigatória no HubSpot para definir a TOP no Sankhya.");
        }
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
            await hubspot_api_1.hubspotApi.updateDeal(dealId, {
                orcamento_sankhya: nunota.toString(),
                sankhya_nunota: "0",
                dealstage: 'qualifiedtobuy'
            });
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
            console.log(`[PROFITABILITY] Fetching for NUNOTA ${nunota}, CODEMP ${codemp}...`);
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
        const properties = [
            'orcamento_sankhya',
            'sankhya_nunota',
            'sankhya_nunota_final',
            'sankhya_nu_unico_pedido',
            'sankhya_nu_unico_nfe',
            'sankhya_nu_nota_pedido',
            'dealname',
            'dealtype',
            'dealstage'
        ];
        const dealResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/deals/${dealId}?properties=${properties.join(',')}`);
        const props = dealResp.data.properties;
        console.log(`[getQuoteStatus] DEBUG: Fetched HubSpot Deal ${dealId}. Props:`, JSON.stringify({
            orcamento_sankhya: props.orcamento_sankhya,
            sankhya_nunota: props.sankhya_nunota,
            sankhya_nunota_final: props.sankhya_nunota_final,
            sankhya_nu_unico_pedido: props.sankhya_nu_unico_pedido,
            sankhya_nu_unico_nfe: props.sankhya_nu_unico_nfe,
            sankhya_nu_nota_pedido: props.sankhya_nu_nota_pedido,
            dealstage: props.dealstage
        }));
        const dealname = props.dealname;
        let orcNunota = props.orcamento_sankhya || props.sankhya_nunota;
        const pedNunota = props.sankhya_nu_unico_pedido;
        const nfeNunota = props.sankhya_nu_unico_nfe;
        let effectiveNuUnicoPedido = pedNunota;
        let effectiveNuUnicoNfe = nfeNunota;
        const getRows = (resp) => {
            const rb = resp.data?.responseBody;
            if (!rb)
                return [];
            if (Array.isArray(rb.rows))
                return rb.rows;
            if (Array.isArray(rb.resultSet?.rows))
                return rb.resultSet.rows;
            return [];
        };
        if (!orcNunota) {
            return {
                success: true,
                status: {
                    dealId, dealname, hasQuote: false, nunota: null, isConfirmed: false,
                    isOrderConfirmed: false, profitability: null, buttonAction: "CREATE_QUOTE", buttonLabel: "Criar Orçamento"
                }
            };
        }
        try {
            // --- EVOLUTION DISCOVERY LOGIC ---
            // 1. Discover all evolved documents through TGFVAR (Sankhya standard for items)
            const varSql = `SELECT DISTINCT NUNOTA FROM TGFVAR WHERE NUNOTAORIG = ${orcNunota}`;
            const varResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
                serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: varSql }
            });
            const varResults = getRows(varResp).map((r) => r[0]);
            // 2. Query child details and include AD_VINCULO lookup (Custom linkage)
            const allChildrenIds = [...new Set(varResults)];
            let childrenDetails = [];
            // Added NUMPEDIDO to discovery query (r[4])
            const linkageSql = `
            SELECT NUNOTA, CODTIPOPER, STATUSNOTA, NUMNOTA, NUMPEDIDO, VLRNOTA, PENDENTE, CODEMP
            FROM TGFCAB 
            WHERE NUNOTA = ${Number(orcNunota) || 0}
            OR NUNOTA = '${String(orcNunota).trim()}'
            OR AD_VINCULO LIKE '${String(orcNunota).trim()}%' 
            ${allChildrenIds.length > 0 ? `OR NUNOTA IN (${allChildrenIds.join(',')})` : ''}
            ORDER BY DTNEG DESC, NUNOTA DESC
        `;
            console.log(`[getQuoteStatus] Unified SQL for ${orcNunota}: ${linkageSql}`);
            const detailsResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
                serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: linkageSql }
            });
            if (detailsResp.data.status !== "1") {
                console.error(`[getQuoteStatus] SQL Error for ${orcNunota}: ${detailsResp.data.statusMessage || 'Unknown Error'}`);
            }
            childrenDetails = getRows(detailsResp);
            console.log(`[getQuoteStatus] Discovery Result for ${orcNunota}: ${JSON.stringify(childrenDetails)}`);
            console.log(`[getQuoteStatus] Current HS State: ${JSON.stringify(props)}`);
            let updateNeeded = false;
            const updateProps = {};
            // Track the current display numbers for the response - priority: Discovery -> HS Props -> Original Quote
            let effectiveNrNota = null;
            // Find Order (1010)
            const orderRow = childrenDetails.find(r => r[1] === 1010 || r[1] === '1010');
            if (orderRow) {
                const rowNuNota = String(orderRow[0]);
                // Logic: NUMNOTA (r[3]) -> NUMPEDIDO (r[4]) -> "0" if both are 0
                const rowNrNota = (orderRow[3] && Number(orderRow[3]) !== 0)
                    ? String(orderRow[3])
                    : (orderRow[4] && Number(orderRow[4]) !== 0)
                        ? String(orderRow[4])
                        : "0";
                effectiveNrNota = rowNrNota;
                if (String(pedNunota || "") !== rowNuNota || String(props.sankhya_nu_nota_pedido || "") !== rowNrNota || props.dealstage !== 'presentationscheduled') {
                    effectiveNuUnicoPedido = rowNuNota;
                    updateProps.sankhya_nu_unico_pedido = rowNuNota;
                    updateProps.sankhya_nu_nota_pedido = rowNrNota;
                    updateProps.dealtype = '1010';
                    updateProps.dealstage = 'presentationscheduled';
                    updateNeeded = true;
                }
            }
            // Find Invoice (1100 / 1111 etc)
            const nfeRow = childrenDetails.find(r => r[1] === 1100 || r[1] === '1100');
            if (nfeRow) {
                const rowNuNota = String(nfeRow[0]);
                const rowNrNota = (nfeRow[3] && Number(nfeRow[3]) !== 0) ? String(nfeRow[3]) : String(nfeRow[0]);
                // Invoices take priority for display
                effectiveNrNota = rowNrNota;
                if (nfeNunota !== rowNuNota) {
                    effectiveNuUnicoNfe = rowNuNota;
                    updateProps.sankhya_nu_unico_nfe = rowNuNota;
                    updateProps.sankhya_nunota_final = rowNrNota;
                    updateProps.nu_final_faturamento = rowNuNota;
                    updateProps.dealstage = 'closedwon';
                    updateNeeded = true;
                }
            }
            // --- Standard status check for UI ---
            // Em vez de rodar um SQL novo, procuramos o orçamento original dentro dos resultados da descoberta (Unified)
            const quoteRow = childrenDetails.find(r => String(r[0]).trim() === String(orcNunota).trim());
            console.log(`[getQuoteStatus] Main Row (NUNOTA ${orcNunota}) from Discovery: ${!!quoteRow}`);
            if (!quoteRow) {
                return {
                    success: true,
                    status: { dealId, dealname, hasQuote: true, nunota: Number(orcNunota), isConfirmed: false, buttonAction: "NONE", message: "Orçamento não encontrado no Sankhya (via Discovery)." }
                };
            }
            // Mapeamento das colunas (Índices baseados na query linkageSql)
            // 0:NUNOTA, 1:CODTIPOPER, 2:STATUSNOTA, 3:NUMNOTA, 4:NUMPEDIDO, 5:VLRNOTA, 6:CONFIRMADA, 7:CODEMP
            const quoteNrNota = (quoteRow[3] && Number(quoteRow[3]) !== 0 && String(quoteRow[3]) !== String(orcNunota))
                ? String(quoteRow[3])
                : "0";
            const vlrNota = parseFloat(quoteRow[5]) || 0;
            // No Sankhya PENDENTE='N' significa CONFIRMADO='S'
            const confirmada = quoteRow[6] === 'N' ? 'S' : 'N';
            const codemp = quoteRow[7];
            const isConfirmed = quoteNrNota !== "0" && (quoteRow[2] === 'L' || quoteRow[2] === 'A');
            const isOrderConfirmed = childrenDetails.some(r => r[1] === 1010 && (r[2] === 'L' || r[2] === 'A'));
            // --- AUTO-HEALING PDF: DISABLED ---
            // Attachments are now mandatory via handlePrepareOrder in the frontend.
            // The `/sankhya/pedido/anexar` endpoint handles file uploads explicitly.
            // Disabling AUTO-HEALING to prevent duplicate attachments.
            // if (isConfirmed && quoteNrNota !== "0") {
            //     try {
            //         console.log(`[AUTO-HEALING PDF] Orçamento ${orcNunota} confirmado (NUMNOTA=${quoteNrNota}). Verificando anexo PDF...`);
            //         const pdfResult = await this.attachPdfToHubspot(dealId, orcNunota);
            //         if ((pdfResult as any).skipped) {
            //             console.log(`[AUTO-HEALING PDF] PDF já anexado anteriormente. Pulando.`);
            //         } else {
            //             console.log(`[AUTO-HEALING PDF] PDF anexado com sucesso ao Deal ${dealId}.`);
            //         }
            //     } catch (pdfErr: any) {
            //         console.warn(`[AUTO-HEALING PDF] Falha ao anexar PDF (não-bloqueante):`, pdfErr.message);
            //     }
            // }
            // --- PROFITABILITY (como no Alef) ---
            let profitability = null;
            let isRentavel = false;
            let profitabilityError = null;
            try {
                console.log(`[getQuoteStatus] Fetching profitability for NUNOTA ${orcNunota}, CODEMP ${codemp}...`);
                const profResult = await this.getProfitabilityInternal(Number(orcNunota), codemp);
                if (profResult.success && profResult.profitability) {
                    profitability = profResult.profitability;
                    isRentavel = profitability.isRentavel;
                    console.log(`[getQuoteStatus] Profitability OK: Lucro=${profitability.lucro}, Rentável=${isRentavel}`);
                }
                else {
                    console.warn(`[getQuoteStatus] Could not fetch profitability: ${profResult.error}`);
                    profitabilityError = profResult.error;
                }
            }
            catch (profErr) {
                console.warn(`[getQuoteStatus] Exception fetching profitability: ${profErr.message}`);
                profitabilityError = profErr.message;
            }
            // --- STRICT INTEGRITY SWEEP (Faxina Automática) ---
            // Se o HubSpot contiver o ID Único (NUNOTA) no campo de número oficial (NUMNOTA), 
            // e o Sankhya confirmar que o número oficial ainda é 0, limpamos o CRM.
            const isMirroredAnomalous = (props.sankhya_nunota === String(orcNunota) || props.sankhya_nunota_final === String(orcNunota)) &&
                quoteNrNota === "0";
            console.log(`[DEBUG] Integrity check: isMirroredAnomalous=${isMirroredAnomalous}, quoteNrNota="${quoteNrNota}", props.sankhya_nunota="${props.sankhya_nunota}"`);
            if (isMirroredAnomalous) {
                console.log(`[FAXINA] Detectada anomalia no Deal ${dealId}. Limpando espelhamento de ID único.`);
                updateProps.sankhya_nunota = "0";
                updateProps.sankhya_nunota_final = "";
                updateNeeded = true;
            }
            // Sync reverso: Se o Sankhya já tem um número real mas o HS ainda está em "0"
            else if (quoteNrNota !== "0" && props.sankhya_nunota === "0") {
                console.log(`[SYNC-REVERSO] Sincronizando número real ${quoteNrNota} para o HubSpot.`);
                updateProps.sankhya_nunota = quoteNrNota;
                updateNeeded = true;
                console.log(`[SYNC-REVERSO] DEBUG: updateNeeded set to true, updateProps.sankhya_nunota="${updateProps.sankhya_nunota}"`);
            }
            // Execute HubSpot update AFTER all conditions (FAXINA, SYNC-REVERSO, etc.) have been evaluated
            console.log(`[getQuoteStatus] DEBUG: updateNeeded=${updateNeeded}, updatePropsKeys=${Object.keys(updateProps).join(',')}`);
            if (updateNeeded && Object.keys(updateProps).length > 0) {
                console.log(`[getQuoteStatus] Auto-updating Deal ${dealId}:`, JSON.stringify(updateProps));
                try {
                    const hsResp = await hubspot_api_1.hubspotApi.updateDeal(dealId, updateProps);
                    console.log(`[getQuoteStatus] HubSpot Sync Success for ${dealId}. Response:`, JSON.stringify({
                        status: hsResp?.status,
                        id: hsResp?.id,
                        properties: hsResp?.properties || {}
                    }));
                }
                catch (err) {
                    console.error(`[getQuoteStatus] HubSpot Sync Error for ${dealId}:`, {
                        status: err.response?.status,
                        data: err.response?.data || err.message,
                        updatePropsAttempted: updateProps
                    });
                }
            }
            else if (updateNeeded && Object.keys(updateProps).length === 0) {
                console.warn(`[getQuoteStatus] updateNeeded=true mas updateProps está vazio! Verificar lógica de condições.`);
            }
            // Fallback chain for nrNota displayed in the card: 
            // 1. Discovery result (Order/NFe) 
            // 2. HubSpot Property (sankhya_nunota_final or sankhya_nu_nota_pedido)
            // 3. Official Sankhya Quote Number (normalized to "0" if unconfirmed)
            const finalNrNota = effectiveNrNota
                || props.sankhya_nunota_final
                || props.sankhya_nu_nota_pedido
                || (quoteNrNota !== "0" ? quoteNrNota : null);
            return {
                success: true,
                status: {
                    dealId,
                    dealname,
                    hasQuote: true,
                    nunota: Number(orcNunota),
                    statusNota: quoteRow[0],
                    isConfirmed,
                    isOrderConfirmed,
                    vlrNota,
                    profitability,
                    profitabilityError,
                    isRentavel,
                    recalc_needed: (profitability && profitability.lucro === 0 && profitability.qtdItens > 0),
                    nuPedido: effectiveNuUnicoPedido,
                    nuUnicoPedido: effectiveNuUnicoPedido,
                    nrNota: finalNrNota,
                    nuNfe: effectiveNuUnicoNfe,
                    dealtype: updateProps.dealtype || props.dealtype,
                    buttonAction: !isConfirmed
                        ? (isRentavel ? "CONFIRM_QUOTE" : "VIEW_QUOTE")
                        : (effectiveNuUnicoPedido ? "BILL" : "NONE"),
                    buttonLabel: !isConfirmed
                        ? (isRentavel ? "Confirmar Orçamento" : "Ver Orçamento")
                        : (effectiveNuUnicoPedido ? "Faturar Pedido" : "Aguardando Evolução"),
                    didUpdateHubSpot: updateNeeded
                }
            };
        }
        catch (e) {
            console.error(`[getQuoteStatus] Discovery Error for ${orcNunota}: ${e.message}`);
            return { success: false, error: e.message };
        }
    }
    async confirmQuote(dealId, nunota, forceConfirm = false) {
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
        const confirmResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mgecom/service.sbr?serviceName=CACSP.confirmarNota&outputType=json', {
            serviceName: "CACSP.confirmarNota",
            requestBody: { nota: { NUNOTA: { "$": String(nunota) } } }
        });
        if (confirmResp.data.status !== "1") {
            const errorMsg = confirmResp.data.statusMessage || 'Erro desconhecido';
            const normalizedMsg = errorMsg.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            if (!normalizedMsg.includes('ja foi confirmada') && !normalizedMsg.includes('ja confirmada')) {
                throw new Error(`Falha ao confirmar nota: ${errorMsg}`);
            }
            console.log(`[QUOTE CONFIRM] Nota ${nunota} já estava confirmada. Procedendo com a atualização do HubSpot.`);
        }
        let confirmedNunota = nunota;
        const pkNunota = confirmResp.data?.responseBody?.pk?.NUNOTA;
        console.log(`[QUOTE CONFIRM] NUNOTA confirmado pelo Sankhya: ${confirmedNunota} (original: ${nunota})`);
        // Wait 1.5s for Sankhya to finish internal triggers (evolution to 1010)
        await new Promise(resolve => setTimeout(resolve, 1500));
        // Run nrNota and nuUnicoPedido in parallel to speed up
        const [nrNotaResp, pedidoResp] = await Promise.all([
            sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
                serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: `SELECT NUMNOTA FROM TGFCAB WHERE NUNOTA = ${confirmedNunota}` }
            }).catch(() => null),
            sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
                serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: `SELECT NUNOTA, NUMNOTA, NUMPEDIDO FROM TGFCAB WHERE NUNOTAORIG = ${confirmedNunota} AND CODTIPOPER = 1010 ORDER BY NUNOTA DESC` }
            }).catch(() => null)
        ]);
        const nrNota = nrNotaResp?.data?.responseBody?.rows?.[0]?.[0] || null;
        const pedidoRow = pedidoResp?.data?.responseBody?.rows?.[0] || null;
        const nuUnicoPedido = pedidoRow?.[0] || null;
        const nrNotaPedido = pedidoRow?.[1] || null;
        const nrPedidoVenda = pedidoRow?.[2] || null;
        // --- REVERTED GAP 1: TOP 1010 must NOT be confirmed automatically ---
        // Business Rule: The seller needs to make manual adjustments (freight, attachments, whatsapp screenshots)
        // in Sankhya before confirming the Order.
        if (nuUnicoPedido) {
            console.log(`[PEDIDO] Pedido gerado NUNOTA=${nuUnicoPedido}. Aguardando confirmação manual no Sankhya.`);
        }
        const nrNotaSafe = (nrNota && Number(nrNota) !== 0 && String(nrNota) !== String(confirmedNunota)) ? String(nrNota) : "0";
        const dealProperties = {
            orcamento_sankhya: String(confirmedNunota),
            sankhya_nunota: nrNotaSafe,
            dealstage: 'qualifiedtobuy'
        };
        if (nuUnicoPedido) {
            dealProperties.sankhya_nu_unico_pedido = String(nuUnicoPedido);
            // Logic: NUMNOTA -> NUMPEDIDO -> NUNOTA
            const displayNrNota = (nrNotaPedido && Number(nrNotaPedido) !== 0)
                ? nrNotaPedido
                : (nrPedidoVenda && Number(nrPedidoVenda) !== 0)
                    ? nrPedidoVenda
                    : nuUnicoPedido;
            dealProperties.sankhya_nu_nota_pedido = String(displayNrNota);
            dealProperties.dealtype = '1010'; // Evoluiu para Pedido
        }
        await hubspot_api_1.hubspotApi.updateDeal(dealId, dealProperties);
        // Anexar PDF do orcamento ao Deal (nao-bloqueante)
        try {
            console.log(`[QUOTE CONFIRM] Anexando PDF do orcamento ${confirmedNunota} ao Deal...`);
            await this.attachPdfToHubspot(dealId, confirmedNunota);
            console.log(`[QUOTE CONFIRM] PDF anexado com sucesso.`);
        }
        catch (pdfErr) {
            console.warn(`[QUOTE CONFIRM] Falha ao anexar PDF (nao-bloqueante):`, pdfErr.message);
        }
        return {
            success: true,
            confirmed: true,
            nunota: confirmedNunota,
            nrNota,
            nuUnicoPedido,
            message: "Orçamento confirmado e Deal atualizado. Status alterado no HubSpot!"
        };
    }
    /**
     * Evolves a note (Budget or Order) into another document.
     * targetTOP defaults to 1100 (NFe) if not specified.
     */
    async billOrder(dealId, nunotaOrigem, targetTOP = 1100, items) {
        console.log(`[ORDER BILLING] Evoluindo Nota #${nunotaOrigem} para TOP ${targetTOP}...`);
        const brDate = new Intl.DateTimeFormat('pt-BR', {
            timeZone: 'America/Sao_Paulo',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(new Date());
        const notaObj = { NUNOTA: { "$": String(nunotaOrigem) } };
        // Se itens foram fornecidos, realizar faturamento parcial/específico
        if (items && items.length > 0) {
            notaObj.itens = {
                item: items.map(it => ({
                    SEQUENCIA: { "$": String(it.sequencia) },
                    QTDUNIT: { "$": String(it.quantidade) }
                }))
            };
        }
        const billPayload = {
            serviceName: "SalesCentralSP.faturarNota",
            requestBody: {
                notas: {
                    nota: [notaObj]
                },
                codTipOper: { "$": String(targetTOP) },
                dtFaturamento: { "$": brDate }
            }
        };
        console.log(`[ORDER BILLING] Attempt 1: SalesCentralSP.faturarNota (Standard)`);
        let billResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mgecom/service.sbr?serviceName=SalesCentralSP.faturarNota&outputType=json', billPayload);
        // Chain of fallbacks for common Sankhya faturamento services
        if (billResp.data.status !== "1") {
            const firstError = String(billResp.data.statusMessage || "");
            console.warn(`[ORDER BILLING] SalesCentralSP failed: ${firstError}. Trying Attempt 2: CACSP.faturarNota`);
            const cacPayload = {
                serviceName: "CACSP.faturarNota",
                requestBody: {
                    nota: {
                        NUNOTA: { "$": String(nunotaOrigem) }
                    },
                    codTipOper: { "$": String(targetTOP) },
                    dtFaturamento: { "$": brDate }
                }
            };
            billResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mgecom/service.sbr?serviceName=CACSP.faturarNota&outputType=json', cacPayload);
            // Attempt 3: HAR Match - SelecaoDocumentoSP.faturar (The confirmed working structure)
            if (billResp.data.status !== "1") {
                const secondError = billResp.data.statusMessage || "";
                console.warn(`[ORDER BILLING] CACSP failed: ${secondError}. Trying Attempt 3: SelecaoDocumentoSP.faturar (HAR Match)`);
                const harPayload = {
                    serviceName: "SelecaoDocumentoSP.faturar",
                    requestBody: {
                        notas: {
                            codTipOper: String(targetTOP),
                            dtFaturamento: "",
                            serie: "1",
                            dtSaida: "",
                            hrSaida: "",
                            tipoFaturamento: "FaturamentoNormal",
                            dataValidada: true,
                            notasComMoeda: {},
                            nota: [{ "$": Number(nunotaOrigem) }],
                            codEmp: 1,
                            codLocalDestino: "",
                            conta2: 0,
                            faturarTodosItens: true,
                            umaNotaParaCada: "false",
                            ehWizardFaturamento: true,
                            dtFixaVenc: "",
                            ehPedidoWeb: false,
                            nfeDevolucaoViaRecusa: false,
                            isFaturamentoDanfeSeguranca: false
                        },
                        clientEventList: {
                            clientEvent: [
                                { "$": "br.com.sankhya.comercial.recalcula.pis.cofins" },
                                { "$": "br.com.sankhya.financeiro.alert.mudanca.titulo.baixa" },
                                { "$": "br.com.sankhya.actionbutton.clientconfirm" },
                                { "$": "br.com.sankhya.mgecom.enviar.recebimento.wms.sncm" },
                                { "$": "comercial.status.nfe.situacao.diferente" },
                                { "$": "comercial.status.nfcom.situacao.diferente" },
                                { "$": "br.com.sankhya.mgecom.compra.SolicitacaoComprador" },
                                { "$": "br.com.sankhya.mgecom.expedicao.SolicitarUsuarioConferente" },
                                { "$": "br.com.sankhya.mgecom.nota.adicional.SolicitarUsuarioGerente" },
                                { "$": "br.com.sankhya.mgecom.cancelamento.nfeAcimaTolerancia" },
                                { "$": "br.com.sankhya.mgecom.cancelamento.nfComForaPrazo" },
                                { "$": "br.com.sankhya.mgecom.cancelamento.processo.wms.andamento" },
                                { "$": "br.com.sankhya.mgecom.msg.nao.possui.itens.pendentes" },
                                { "$": "br.com.sankhya.mgecomercial.event.baixaPortal" },
                                { "$": "br.com.sankhya.comercial.desfaz.renegociacoes.vendamais" },
                                { "$": "br.com.sankhya.comercial.desfaz.renegociacoes.vendamais.devolucao" },
                                { "$": "br.com.sankhya.mgecom.valida.ChaveNFeCompraTerceiros" },
                                { "$": "br.com.sankhya.mgewms.expedicao.validarPedidos" },
                                { "$": "br.com.sankhya.mgecom.gera.lote.xmlRejeitado" },
                                { "$": "br.com.sankhya.comercial.solicitaContingencia" },
                                { "$": "br.com.sankhya.mgecom.cancelamento.notas.remessa" },
                                { "$": "br.com.sankhya.mgecomercial.event.compensacao.credito.debito" },
                                { "$": "br.com.sankhya.modelcore.comercial.cancela.nota.devolucao.wms" },
                                { "$": "br.com.sankhya.mgewms.expedicao.selecaoDocas" },
                                { "$": "br.com.sankhya.mgewms.expedicao.cortePedidos" },
                                { "$": "br.com.sankhya.modelcore.comercial.cancela.nfce.baixa.caixa.fechado" },
                                { "$": "br.com.utiliza.dtneg.servidor" },
                                { "$": "comercial.status.nfe.aceita.naoSomarItem.SelecaoDocumento" },
                                { "$": "br.com.sankhya.mgecomercial.event.estoque.insuficiente.produto" }
                            ]
                        }
                    }
                };
                billResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mgecom/service.sbr?serviceName=SelecaoDocumentoSP.faturar&outputType=json', harPayload);
            }
        }
        if (billResp.data.status !== "1") {
            console.error(`[ORDER BILLING] All billing attempts failed:`, billResp.data);
            throw new Error(parseSankhyaError(billResp.data.statusMessage || JSON.stringify(billResp.data)));
        }
        // Capture the new NUNOTA 
        const nuFaturamento = billResp.data?.responseBody?.pk?.NUNOTA
            || billResp.data?.responseBody?.NUNOTA
            || billResp.data?.responseBody?.faturamento?.NUNOTA
            || billResp.data?.responseBody?.notas?.nota?.$
            || (billResp.data?.responseBody?.notas?.nota?.[0]?.NUNOTA);
        console.log(`[ORDER BILLING] Nota #${nunotaOrigem} evoluída para #${nuFaturamento} (TOP ${targetTOP})`);
        // Wait for Sankhya internal triggers
        await new Promise(resolve => setTimeout(resolve, 2000));
        // Buscar NUMNOTA do NOVO registro gerado (Incluindo NUMPEDIDO)
        const searchSql = `SELECT NUMNOTA, NUNOTA, NUMPEDIDO FROM TGFCAB WHERE NUNOTA = ${nuFaturamento} OR (NUNOTAORIG = ${nunotaOrigem} AND CODTIPOPER = ${targetTOP}) ORDER BY NUNOTA DESC`;
        const searchResp = await sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json', {
            serviceName: "DbExplorerSP.executeQuery", requestBody: { sql: searchSql }
        });
        // Pegar o PRIMEIRO resultado (que deve ser o mais novo por causa do ORDER BY NUNOTA DESC)
        const nrNotaGerada = searchResp.data?.responseBody?.rows?.[0]?.[0] || null;
        const finalNuNota = searchResp.data?.responseBody?.rows?.[0]?.[1] || nuFaturamento;
        const nrPedidoGerado = searchResp.data?.responseBody?.rows?.[0]?.[2] || null;
        // Update HubSpot based on evolution type
        const updateProps = {
            dealtype: String(targetTOP)
        };
        if (targetTOP === 1010) {
            updateProps.sankhya_nu_unico_pedido = String(finalNuNota || "");
            // IMPORTANT: sankhya_nu_nota_pedido must be initialized to "0" when TOP 1010 is created
            // It will be updated to the correct NUMNOTA only after further processing/confirmation
            // This follows Sankhya's standard pattern: creation prop gets number, number prop starts at 0
            updateProps.sankhya_nu_nota_pedido = "0";
            updateProps.dealstage = 'presentationscheduled';
        }
        else if (targetTOP === 1100) {
            updateProps.sankhya_nu_unico_nfe = String(finalNuNota || "");
            // IMPORTANT: sankhya_nunota_final should be "0" initially, filled after NF-e emission
            // This follows Sankhya's standard pattern for property initialization
            updateProps.sankhya_nunota_final = "0";
            updateProps.nu_final_faturamento = String(finalNuNota || "");
            // Attach DANFE BEFORE moving to closed-won (Self-healing with retry)
            let danfeAttached = false;
            try {
                await this.withRetry(() => this.attachPdfToHubspot(dealId, finalNuNota));
                danfeAttached = true;
                console.log(`[ORDER BILLING] DANFE para ${finalNuNota} anexada com sucesso.`);
            }
            catch (danfeErr) {
                console.error(`[ORDER BILLING] Falha ao anexar DANFE após retries: ${danfeErr.message}`);
            }
            // Move to "Closed Won" (always, even if DANFE attachment failed)
            updateProps.dealstage = 'closedwon';
        }
        console.log(`[ORDER BILLING] Atualizando Deal ${dealId} no HubSpot:`, JSON.stringify(updateProps));
        await hubspot_api_1.hubspotApi.updateDeal(dealId, updateProps);
        return {
            success: true,
            nuFaturamento: finalNuNota,
            nrNotaGerada,
            message: `Nota #${nunotaOrigem} faturada com sucesso para a TOP ${targetTOP}!`
        };
    }
    // Retry mechanism with exponential backoff (3 attempts, 2s delay)
    async withRetry(fn, maxAttempts = 3, delayMs = 2000) {
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            }
            catch (err) {
                if (attempt === maxAttempts)
                    throw err;
                console.warn(`[RETRY] Tentativa ${attempt}/${maxAttempts} falhou. Aguardando ${delayMs}ms...`);
                await new Promise(r => setTimeout(r, delayMs));
            }
        }
        throw new Error('Max retry attempts exceeded');
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
        console.log(`[HS-ATTACH] Verificando se PDF para NUNOTA ${nunota} já existe no Deal ${dealId}...`);
        try {
            // Evitar duplicidade de notas no HubSpot buscando por notas existentes com o mesmo NUNOTA no corpo
            const existingNotesResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/notes?associations.deal=${dealId}&properties=hs_note_body`);
            const alreadyAttached = (existingNotesResp.data.results || []).some((n) => n.properties.hs_note_body?.includes(`Sankhya #${nunota}`));
            if (alreadyAttached) {
                console.log(`[HS-ATTACH] Nota para NUNOTA ${nunota} já encontrada no HubSpot. Pulando upload.`);
                return { success: true, message: "Arquivo já anexado anteriormente" };
            }
        }
        catch (err) {
            console.warn(`[HS-ATTACH] Erro ao verificar duplicidade: ${err}`);
        }
        const pdfData = await this.generateSankhyaPDF(nunota);
        return this.attachFileToHubspot(dealId, nunota, pdfData.base64, pdfData.fileName);
    }
    async attachFileToHubspot(dealId, nunota, base64, fileName) {
        // ETAPA 0: Verificar se já existe nota de anexo para este NUNOTA neste Deal
        try {
            const searchResponse = await hubspot_api_1.hubspotApi.post('/crm/v3/objects/notes/search', {
                filterGroups: [
                    {
                        filters: [
                            { propertyName: 'hs_note_body', operator: 'CONTAINS_TOKEN', value: `Sankhya #${nunota}` }
                        ]
                    }
                ],
                properties: ['hs_note_body']
            });
            // Se encontrar alguma nota que se refere ao mesmo NUNOTA, verificar associações (opcionalmente)
            // Para simplificar, se o corpo contém "Sankhya #NUNOTA", assumimos que já foi anexado para este workflow.
            if (searchResponse.data.total > 0) {
                // Agora verificar se essa nota está associada a ESTE deal especificamente
                // (Nota: o search busca globalmente, mas podemos filtrar por associações na query ou verificar depois)
                // Por simplicidade e segurança, se já existe uma nota com esse texto exato de identificação, vamos pular
                // para evitar a poluição que o usuário reclamou.
                console.log(`[HS-ATTACH] Nota para NUNOTA ${nunota} já identificada no HubSpot. Pulando duplicata.`);
                return { success: true, message: "Já anexado no HubSpot", skipped: true };
            }
        }
        catch (searchErr) {
            console.warn(`[HS-ATTACH] Falha ao verificar duplicidade no HubSpot: ${searchErr.message}`);
        }
        console.log(`[HS-ATTACH] Iniciando upload de ${fileName} para o Deal ${dealId}...`);
        const buffer = Buffer.from(base64, 'base64');
        const form = new form_data_1.default();
        form.append('file', buffer, { filename: fileName, contentType: 'application/pdf' });
        form.append('options', JSON.stringify({ access: 'PRIVATE', overwrite: false }));
        form.append('folderPath', '/Orcamentos');
        const hsUploadResp = await hubspot_api_1.hubspotApi.post('https://api.hubapi.com/files/v3/files', form, {
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
        const noteResp = await hubspot_api_1.hubspotApi.post('/crm/v3/objects/notes', notePayload);
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
    // Get deal attachments via Engagements API
    async getDealAttachments(dealId) {
        try {
            // Use associations endpoint to get notes for a specific deal
            const associationsResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/deals/${dealId}/associations/notes?limit=100`);
            const noteIds = (associationsResp.data?.results || []).map((assoc) => assoc.id);
            if (noteIds.length === 0) {
                console.log(`[DEAL ATTACHMENTS] No notes associated with deal ${dealId}`);
                return { success: true, attachments: [] };
            }
            // Fetch properties for each note
            const attachments = [];
            for (const noteId of noteIds) {
                try {
                    const noteResp = await hubspot_api_1.hubspotApi.get(`/crm/v3/objects/notes/${noteId}?properties=hs_attachment_ids,hs_note_body,hs_timestamp`);
                    const note = noteResp.data;
                    if (note.properties?.hs_attachment_ids) {
                        const fileIds = String(note.properties.hs_attachment_ids).split(';').filter((id) => id.trim());
                        let displayText = note.properties.hs_note_body || '';
                        // If no description or generic "Anexo", fetch actual file names
                        if (!displayText || displayText.trim() === 'Anexo') {
                            const fileNames = [];
                            for (const fileId of fileIds) {
                                try {
                                    const fileResp = await hubspot_api_1.hubspotApi.get(`/files/v3/files/${fileId}`);
                                    if (fileResp.data?.name) {
                                        fileNames.push(fileResp.data.name);
                                        console.log(`[DEAL ATTACHMENTS] File ${fileId}: ${fileResp.data.name}`);
                                    }
                                }
                                catch (fileErr) {
                                    console.warn(`[DEAL ATTACHMENTS] Could not fetch file name for ${fileId}:`, fileErr.message);
                                }
                            }
                            // Use file names if available, otherwise fallback
                            displayText = fileNames.length > 0 ? fileNames.join(', ') : 'Anexo';
                        }
                        attachments.push({
                            id: note.id,
                            fileIds,
                            body: displayText,
                            timestamp: note.properties.hs_timestamp
                        });
                    }
                }
                catch (noteErr) {
                    console.warn(`[DEAL ATTACHMENTS] Could not fetch note ${noteId}:`, noteErr.message);
                }
            }
            console.log(`[DEAL ATTACHMENTS] Found ${attachments.length} attachments for deal ${dealId}`);
            return { success: true, attachments };
        }
        catch (err) {
            console.error(`[DEAL ATTACHMENTS] Error fetching attachments:`, err.message);
            return { success: false, attachments: [], error: err.message };
        }
    }
    // Prepare order: Save obs to Sankhya (OBS_INTERNA field) + Update HubSpot + Download file + Attach
    async prepareOrderWithAttachment(dealId, nunota, fileId, obsInterna, rotaEntrega, rotaEntrega2) {
        try {
            console.log(`[PREPARE ORDER] Starting for Deal ${dealId}, NUNOTA ${nunota}, FileID ${fileId}, Rotas: ${rotaEntrega || 'N/A'}, ${rotaEntrega2 || 'N/A'}`);
            // 1. Save observation and rotas to Sankhya (OBS_INTERNA field + delivery routes)
            try {
                const localFields = {
                    OBS_INTERNA: { "$": obsInterna }
                };
                const fieldsetList = ["OBS_INTERNA"];
                // Add delivery routes if provided
                if (rotaEntrega) {
                    localFields.ROTA_ENTREGA_1 = { "$": rotaEntrega };
                    fieldsetList.push("ROTA_ENTREGA_1");
                }
                if (rotaEntrega2) {
                    localFields.ROTA_ENTREGA_2 = { "$": rotaEntrega2 };
                    fieldsetList.push("ROTA_ENTREGA_2");
                }
                await sankhya_api_1.sankhyaApi.post('/gateway/v1/mge/service.sbr?serviceName=CRUDServiceProvider.saveRecord&outputType=json', {
                    serviceName: "CRUDServiceProvider.saveRecord",
                    requestBody: {
                        dataSet: {
                            rootEntity: "CabecalhoNota",
                            includePresentationFields: "N",
                            dataRow: {
                                localFields,
                                key: {
                                    NUNOTA: { "$": nunota.toString() }
                                }
                            },
                            entity: {
                                fieldset: {
                                    list: fieldsetList.join(",")
                                }
                            }
                        }
                    }
                });
                console.log(`[PREPARE ORDER] Sankhya saved successfully:`, fieldsetList);
            }
            catch (obsErr) {
                console.warn(`[PREPARE ORDER] Warning: Could not save data to Sankhya:`, obsErr.message);
                // Don't throw - continue anyway
            }
            // 2. Update HubSpot properties (observacao_interna, rota_de_entrega_1, rota_de_entrega_2)
            try {
                const hsProps = {
                    observacao_interna: obsInterna
                };
                if (rotaEntrega) {
                    hsProps.rota_de_entrega_1 = rotaEntrega;
                }
                if (rotaEntrega2) {
                    hsProps.rota_de_entrega_2 = rotaEntrega2;
                }
                await hubspot_api_1.hubspotApi.patch(`/crm/v3/objects/deals/${dealId}`, {
                    properties: hsProps
                });
                console.log(`[PREPARE ORDER] HubSpot properties updated:`, Object.keys(hsProps));
            }
            catch (hsErr) {
                console.warn(`[PREPARE ORDER] Warning: Could not update HubSpot properties:`, hsErr.message);
                // Don't throw - continue anyway
            }
            // 3. Fetch file metadata from HubSpot Files API
            const fileResp = await hubspot_api_1.hubspotApi.get(`/files/v3/files/${fileId}`);
            console.log(`[PREPARE ORDER] File metadata response:`, JSON.stringify(fileResp.data, null, 2));
            const fileName = fileResp.data?.name || `pedido-${nunota}.pdf`;
            const fileUrl = fileResp.data?.url;
            if (!fileUrl) {
                throw new Error(`File URL not found for ${fileId}. Response: ${JSON.stringify(fileResp.data)}`);
            }
            console.log(`[PREPARE ORDER] Downloading file ${fileId}: ${fileName}, URL: ${fileUrl}`);
            // 4. Download file from HubSpot
            let fileBase64;
            try {
                const fileContent = await hubspot_api_1.hubspotApi.get(fileUrl, { responseType: 'arraybuffer' });
                fileBase64 = Buffer.from(fileContent.data).toString('base64');
                console.log(`[PREPARE ORDER] File downloaded successfully, size: ${fileBase64.length}`);
            }
            catch (downloadErr) {
                console.error(`[PREPARE ORDER] Download error for URL ${fileUrl}:`, downloadErr.message);
                throw downloadErr;
            }
            // 3. Attach file to Sankhya using Sankhya Gateway with FormData (multipart)
            const sessionKey = `ANEXO_SISTEMA_CabecalhoNota_${nunota}`;
            const params = new URLSearchParams({
                sessionKey,
                fitem: 'S'
            });
            console.log(`[PREPARE ORDER] Attaching to Sankhya with sessionKey: ${sessionKey}`);
            // Use FormData for multipart upload (Sankhya expects this format)
            const formData = new form_data_1.default();
            formData.append('ARQUIVO', Buffer.from(fileBase64, 'base64'), fileName);
            formData.append('DESCRICAO', 'Pedido Compra');
            const annexResp = await sankhya_api_1.sankhyaApi.post(`/gateway/v1/mge/service.sbr?${params}`, formData, {
                headers: formData.getHeaders()
            });
            console.log(`[PREPARE ORDER] File attached to Sankhya successfully, response:`, annexResp.data);
            return { success: true, message: 'Observação salva e arquivo anexado com sucesso!' };
        }
        catch (err) {
            console.error(`[PREPARE ORDER] Error:`, err.message);
            return { success: false, error: err.message };
        }
    }
    // Get available options for a HubSpot property
    async getPropertyOptions(propertyName) {
        try {
            console.log(`[PROPERTY OPTIONS] Fetching options for property: ${propertyName}`);
            const response = await hubspot_api_1.hubspotApi.get(`/crm/v3/properties/deals/${propertyName}`);
            const property = response.data;
            console.log(`[PROPERTY OPTIONS] Full response for ${propertyName}:`, JSON.stringify(property, null, 2));
            if (!property) {
                return { success: false, options: [], error: 'Property not found' };
            }
            // Extract options from the property definition
            const options = property.options || [];
            console.log(`[PROPERTY OPTIONS] Found ${options.length} options for ${propertyName}`);
            if (options.length > 0) {
                console.log(`[PROPERTY OPTIONS] First option sample:`, JSON.stringify(options[0]));
            }
            // Format options for frontend Select component
            const formattedOptions = options.map((opt) => ({
                label: opt.label || opt.value,
                value: opt.value
            }));
            console.log(`[PROPERTY OPTIONS] Formatted options:`, JSON.stringify(formattedOptions, null, 2));
            return { success: true, options: formattedOptions };
        }
        catch (err) {
            console.error(`[PROPERTY OPTIONS] Error:`, err.message);
            console.error(`[PROPERTY OPTIONS] Full error:`, err);
            return { success: false, options: [], error: err.message };
        }
    }
}
exports.quoteService = new QuoteService();
