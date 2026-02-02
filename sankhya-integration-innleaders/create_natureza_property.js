/**
 * Script para criar/atualizar a propriedade natureza_id no HubSpot
 * com todas as naturezas do Sankhya
 */

const axios = require('axios');
require('dotenv').config();

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;

// Lista de naturezas parseadas do input do usuário
const naturezas = [
    { label: "Abatimentos da Receita", value: "200000" },
    { label: "ACORDOS PROCESSUAIS TRABALHISTAS", value: "401021" },
    { label: "ADIANTAMENTO SALARIAL", value: "401002" },
    { label: "ADMINISTRATIVA", value: "402000" },
    { label: "ÁGUA E ESGOTO", value: "402002" },
    { label: "AJUDA DE CUSTO RCA", value: "401011" },
    { label: "AJUSTE DE ESTOQUE", value: "801009" },
    { label: "Aluguel de Imóveis", value: "402019" },
    { label: "Aluguel de máquinas de cartão", value: "404009" },
    { label: "Aluguel de máquinas e equipamentos", value: "402014" },
    { label: "Aluguel de Veículos", value: "403016" },
    { label: "Alvará / Taxa de localização", value: "501003" },
    { label: "AMOSTRA GRÁTIS", value: "801008" },
    { label: "ANTECIPAÇÃO DE RECEBÍVEIS", value: "101003" },
    { label: "Anúncios TV / rádio / jornais / revistas", value: "405004" },
    { label: "Arquivei", value: "407004" },
    { label: "Assessoria técnica", value: "402012" },
    { label: "ASSISTÊNCIA MÉDICA / ODONTOLÓGICA", value: "401009" },
    { label: "ATIVO IMOBILIZADO", value: "603001" },
    { label: "Ativy", value: "407013" },
    { label: "AUXÍLIO ALIMENTAÇÃO", value: "401010" },
    { label: "BENFEITORIA EM IMÓVEIS DE TERCEIROS", value: "603007" },
    { label: "Bens de pequeno valor", value: "301003" },
    { label: "BONIFICAÇÕES", value: "801007" },
    { label: "Brindes / Presentes", value: "405005" },
    { label: "CANOPUS - GRUPO 006600 - 006601", value: "601018" },
    { label: "Cofins", value: "503002" },
    { label: "Combustíveis e lubrificantes", value: "403002" },
    { label: "COMISSIONAMENTO", value: "401019" },
    { label: "Conciliadora", value: "407007" },
    { label: "Conservação de veículos", value: "403011" },
    { label: "CONSÓCIOS", value: "601000" },
    { label: "CONVÊNIOS", value: "401006" },
    { label: "Correios / Despachos", value: "406005" },
    { label: "Cortex", value: "407003" },
    { label: "Cred Localiza", value: "407006" },
    { label: "CREDITOS DE CLIENTES", value: "201003" },
    { label: "Csll", value: "503004" },
    { label: "Cursos / Treinamentos e Consultorias", value: "402017" },
    { label: "Custas processuais", value: "402013" },
    { label: "DEBITO TITULOS CAPITAL", value: "404014" },
    { label: "DÉBITO TÍTULOS DESCONTADOS", value: "404012" },
    { label: "Deduções", value: "201000" },
    { label: "Descontos concedidos", value: "201002" },
    { label: "Despachante", value: "403015" },
    { label: "Despachante aduaneiro", value: "406007" },
    { label: "DESPESAS COM CONTRATOS", value: "701002" },
    { label: "DESPESAS GERAIS", value: "400000" },
    { label: "Despesas Tributárias", value: "500000" },
    { label: "Devoluções", value: "201001" },
    { label: "DIRETORIA", value: "700000" },
    { label: "Emplacamento", value: "403010" },
    { label: "EMPRESTIMO DE CAPITAL DE SOCIO - MATEUS", value: "602016" },
    { label: "Empréstimos e Financiamentos", value: "602000" },
    { label: "ENERGIA ELÉTRICA", value: "402001" },
    { label: "Estadual", value: "502000" },
    { label: "Estoque", value: "301000" },
    { label: "ESTORNOS DE TARIFAS E JUROS", value: "102005" },
    { label: "EXAMES MÉDICOS / PCMSO / PPRA", value: "401014" },
    { label: "Êxitos de processos judicias", value: "406002" },
    { label: "Federal", value: "503000" },
    { label: "FÉRIAS", value: "401005" },
    { label: "Festas e confraternizações", value: "402009" },
    { label: "FGTS", value: "401017" },
    { label: "FGTS RESCISÓRIO", value: "401018" },
    { label: "Finame 44009694724", value: "602002" },
    { label: "Finame 44010597290", value: "602003" },
    { label: "Financeiras e Bancárias", value: "404000" },
    { label: "Frete CIF", value: "403012" },
    { label: "Frete exportação", value: "403014" },
    { label: "Frete FOB", value: "403013" },
    { label: "GERENCIAL", value: "701000" },
    { label: "GERENCIAMENTO DE TRANSAÇÕES", value: "800000" },
    { label: "Hafid", value: "407002" },
    { label: "Honorários advocatícios", value: "406001" },
    { label: "Honorários contábeis", value: "406003" },
    { label: "Icms", value: "502001" },
    { label: "ICMS ANTECIPADO ESPECIAL 1173", value: "502007" },
    { label: "Icms difal não contribuinte", value: "502003" },
    { label: "Icms difal uso e consumo", value: "502002" },
    { label: "Icms ST", value: "502004" },
    { label: "Imobilizado / Intangível", value: "603000" },
    { label: "IMÓVEIS", value: "603003" },
    { label: "Impostos Retidos", value: "503006" },
    { label: "Ingressos / Eventos", value: "402010" },
    { label: "INSS / IMPOSTO DE RENDA", value: "401016" },
    { label: "INTERNET / CONEXÕES", value: "402004" },
    { label: "Interponto", value: "407014" },
    { label: "INVESTIMENTOS", value: "600000" },
    { label: "Iof", value: "404003" },
    { label: "Iptu", value: "501002" },
    { label: "IPVA / Licenciamentos", value: "403004" },
    { label: "Irpj", value: "503003" },
    { label: "ISS", value: "501004" },
    { label: "Iss Retido", value: "501001" },
    { label: "ITAU - CARTOES - 3272264551", value: "602008" },
    { label: "Itaú - 11784", value: "602001" },
    { label: "ITAU - 3724487 - 029028", value: "601003" },
    { label: "ITAU - 40054/253 - 005465", value: "601005" },
    { label: "ITAU ITC - 017101", value: "602007" },
    { label: "ITAU LIS - 8841070304", value: "602014" },
    { label: "ITAU LIS - 884167967816", value: "602015" },
    { label: "ITAU 3724498 - 029027", value: "601004" },
    { label: "ITBI", value: "501005" },
    { label: "ITR", value: "503010" },
    { label: "Juros", value: "404002" },
    { label: "LCG CONSULTORIA", value: "406008" },
    { label: "LICENÇA SOFTWARE", value: "603005" },
    { label: "Logística", value: "403000" },
    { label: "Manutenção de equipamentos", value: "402005" },
    { label: "Manutenção de veículos", value: "403001" },
    { label: "Mão-de-obra de terceiros", value: "406004" },
    { label: "MARCAS / REGISTROS / PATENTES", value: "603006" },
    { label: "Marketing / Publicidade", value: "405000" },
    { label: "Material de escritório", value: "402006" },
    { label: "Material de limpeza", value: "402007" },
    { label: "Material impresso", value: "405001" },
    { label: "MATEUS SANTOS MARQUES", value: "701001" },
    { label: "Mercado eletrônico", value: "407008" },
    { label: "Multa contratual", value: "402016" },
    { label: "Multas", value: "404004" },
    { label: "Multas de trânsito", value: "403007" },
    { label: "Municipal", value: "501000" },
    { label: "Nimbi", value: "407010" },
    { label: "OBRA SEDE CARATINGA", value: "603008" },
    { label: "OPERACIONAL", value: "801000" },
    { label: "Oracle Cloud", value: "407012" },
    { label: "OUTRAS REMESSAS", value: "801004" },
    { label: "OUTROS RETORNOS", value: "801005" },
    { label: "Padaria", value: "402020" },
    { label: "Parcelamento Icms", value: "502005" },
    { label: "Parcelamento Previdenciário", value: "503007" },
    { label: "Parcelamento Simples Nacional", value: "503008" },
    { label: "Participações em feiras / eventos", value: "405003" },
    { label: "Patrocínios", value: "405002" },
    { label: "Pedágios", value: "403006" },
    { label: "PENSÃO ALIMENTÍCIA", value: "401013" },
    { label: "PERDAS", value: "801006" },
    { label: "Pesquisas Due Diligence", value: "402015" },
    { label: "PESSOAL", value: "401000" },
    { label: "Pis", value: "503001" },
    { label: "PLOOMES", value: "407016" },
    { label: "PORTOBENS - 012296", value: "601002" },
    { label: "Produtos para revenda", value: "301001" },
    { label: "PRÓ-LABORE", value: "401003" },
    { label: "Quadren", value: "407009" },
    { label: "Rastreador", value: "403008" },
    { label: "Receita de serviços", value: "101002" },
    { label: "RECEITA DE SERVIÇOS DE MANUTENÇÃO STIHL", value: "101004" },
    { label: "Receita de vendas", value: "101001" },
    { label: "Receitas", value: "100000" },
    { label: "Receitas de vendas", value: "101000" },
    { label: "Receitas não-operacionais", value: "102000" },
    { label: "RECURSOS BANCÁRIOS", value: "102003" },
    { label: "RECURSOS CAIXA", value: "102004" },
    { label: "REEMBOLSO DE CONSORCIO", value: "102006" },
    { label: "REMESSA EM COMODATO", value: "801002" },
    { label: "Rendimentos financeiros", value: "102001" },
    { label: "RESCISÕES / INDENIZAÇÕES", value: "401007" },
    { label: "RETIRADA DE LUCROS E DIVIDENDO", value: "401020" },
    { label: "RETORNO DE COMODATO", value: "801003" },
    { label: "RURAL GABRIEL", value: "602011" },
    { label: "RURAL MATEUS", value: "602010" },
    { label: "SAFRA - 8373846", value: "602012" },
    { label: "SAFRA - 8373927", value: "602013" },
    { label: "SALÁRIOS E ORDENADOS", value: "401001" },
    { label: "Sankhya", value: "407001" },
    { label: "Segurança / Alarmes", value: "406006" },
    { label: "Seguros de automóveis", value: "403005" },
    { label: "Seguros patrimoniais", value: "402011" },
    { label: "<SEM NATUREZA>", value: "0" },
    { label: "SERASA", value: "407015" },
    { label: "Serviços Tomados", value: "406000" },
    { label: "SICOOB - RENEGOCIAÇÃO - 1014559", value: "602018" },
    { label: "SICOOB - RENEGOCIAÇÃO - 1014566", value: "602017" },
    { label: "SICOOB - 001000/0246 - 05456", value: "601001" },
    { label: "SICOOB - 001108/00501 - 036488", value: "601016" },
    { label: "SICOOB - 001273/0691 - 014062", value: "601012" },
    { label: "SICOOB - 001286/0962 - 027559", value: "601011" },
    { label: "SICOOB - 001286/0968 - 027558", value: "601009" },
    { label: "SICOOB - 001286/957- 027560", value: "601007" },
    { label: "SICOOB - 001349/00293 - 036493", value: "601017" },
    { label: "SICOOB - 001349/00351 - 036491", value: "601015" },
    { label: "SICOOB - 001349/00362 - 036492", value: "601014" },
    { label: "SICOOB - 001349/00384 - 036494", value: "601013" },
    { label: "SICOOB - 012554", value: "602006" },
    { label: "SICOOB - 01273/0756 - 017202", value: "601008" },
    { label: "SICOOB - 032009", value: "602005" },
    { label: "SICOOB - 1279/944 - 017201", value: "601006" },
    { label: "Sicoob - 21142", value: "602004" },
    { label: "SICOOB - 880804", value: "602009" },
    { label: "Simples Nacional", value: "503005" },
    { label: "Softwares", value: "407000" },
    { label: "Suprimentos", value: "300000" },
    { label: "Tarifas cambiais", value: "404011" },
    { label: "Tarifas de cobrança", value: "404007" },
    { label: "Tarifas de emprest. e financ.", value: "404010" },
    { label: "Tarifas de manutenção", value: "404001" },
    { label: "Tarifas de prorrogação", value: "404006" },
    { label: "Tarifas TED / PIX", value: "404005" },
    { label: "Taxas", value: "502006" },
    { label: "Taxas e emolumentos cartorários", value: "402008" },
    { label: "TELEFONE", value: "402003" },
    { label: "TERRENOS", value: "603002" },
    { label: "Títulos descontados", value: "404008" },
    { label: "TRANSFERÊNCIAS ENTRE MATRIZ E FILIAL", value: "801001" },
    { label: "TREINAMENTOS / CERTIFICADOS", value: "401015" },
    { label: "UNIFORMES / PROTEÇÃO INDIVIDUAL", value: "401012" },
    { label: "Uso e consumo", value: "301002" },
    { label: "VALE TRANSPORTE", value: "401008" },
    { label: "VEÍCULOS", value: "603004" },
    { label: "Venda do ativo imobilizado", value: "102002" },
    { label: "Viagens", value: "403003" },
    { label: "13º SALÁRIO", value: "401004" },
    { label: "4Infra", value: "407005" }
];

async function createOrUpdateNaturezaProperty() {
    try {
        console.log('Criando/atualizando propriedade natureza_id no HubSpot...');

        const propertyPayload = {
            name: 'natureza_id',
            label: 'Natureza da Operação (Sankhya)',
            type: 'enumeration',
            fieldType: 'select',
            groupName: 'dealinformation',
            description: 'Código da Natureza da Operação no Sankhya (CODNAT)',
            options: naturezas.map(n => ({
                label: n.label,
                value: n.value,
                displayOrder: -1,
                hidden: false
            }))
        };

        // Tentar criar a propriedade
        try {
            const createResp = await axios.post(
                'https://api.hubapi.com/crm/v3/properties/deals',
                propertyPayload,
                {
                    headers: {
                        'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            console.log(`✅ Propriedade natureza_id criada com sucesso!`);
            console.log(`Total de opções: ${naturezas.length}`);
        } catch (createError) {
            if (createError.response?.status === 409) {
                // Propriedade já existe, fazer update
                console.log('Propriedade já existe, atualizando opções...');
                const updateResp = await axios.patch(
                    `https://api.hubapi.com/crm/v3/properties/deals/natureza_id`,
                    { options: propertyPayload.options },
                    {
                        headers: {
                            'Authorization': `Bearer ${HUBSPOT_TOKEN}`,
                            'Content-Type': 'application/json'
                        }
                    }
                );
                console.log(`✅ Propriedade natureza_id atualizada com ${naturezas.length} opções!`);
            } else {
                throw createError;
            }
        }

    } catch (error) {
        console.error('❌ Erro ao criar/atualizar propriedade:', error.response?.data || error.message);
        process.exit(1);
    }
}

createOrUpdateNaturezaProperty();
