/**
 * Script para CRIAR a propriedade tipo_negociacao no HubSpot
 * Com todas as opções do Sankhya - DUPLICATAS CORRIGIDAS
 * 
 * Uso: node create-tipo-negociacao.js
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;

// Mapeamento: "Rótulo" : "ID Sankhya"
const mappingData = {
    "<SEM TIPO DE VENDA>": "0",
    "A VISTA": "1",
    "VBV": "2",
    "CARTÃO": "3",
    "28 DIAS BOLETO (4)": "4",        // Duplicata - adicionado código
    "28/56 PARCELADO BOLETO": "5",
    "28/56/84 PARCELADO BOLETO": "6",
    "A PRAZO - 0 DIAS": "11",
    "7 DIAS - DEPOSITO": "12",
    "15 DIAS BOLETO (13)": "13",      // Duplicata - adicionado código
    "20 DIAS - DEPOSITO": "14",
    "21 DIAS - DEPOSITO": "15",
    "28 DIAS - DEPOSITO": "16",
    "30 DIAS - DEPOSITO": "17",
    "45 DIAS - DEPOSITO": "18",
    "30/60 PARCELADO - DEPOSITO": "20",
    "30/60/90 PARCELADO - DEPOSITO": "21",
    "30/60/90/120 PARCELADO DEPOSITO": "22",
    "PIX": "500",
    "30 DIAS BOLETO (503)": "503",    // Duplicata - adicionado código
    "60 DIAS BOLETO": "505",
    "90 DIAS BOLETO": "507",
    "120 DIAS BOLETO": "509",
    "30/60 PARCELADO BOLETO": "516",
    "30/60/90 PARCELADO BOLETO": "517",
    "30/60/90/120 PARCELADO BOLETO": "518",
    "30/60/90/120/180/210 PARCELADO BOLET": "520",
    "45/60/75/90/105 PARCELADO BOLETO": "524",
    "30/45 PARCELADO BOLETO": "526",
    "30/45/60 PARCELADO BOLETO": "527",
    "30/45/60/75 PARCELADO BOLETO": "528",
    "30/45/60/75/90/105/120 PARCELADO BOL": "531",
    "28/35/42 PARCELADO BOLETO": "534",
    "28/42 PARCELADO BOLETO": "539",
    "DEVOLUCAO DE VENDA - CRED CLIENTE": "548",
    "90 DIAS - DEPOSITO": "550",
    "20 - DIAS BOLETO - FORA DEZENA": "551",
    "07 DIAS - BOLETO - COMPRAS": "552",
    "07/14 DIAS - BOLETO - COMPRAS": "554",
    "07/14/21 DIAS - BOLETO - COMPRAS": "555",
    "07/14/21/28 DIAS - BOLETO - COMPRAS": "556",
    "07/14/21/28/35 DIAS - BOLETO COMPRAS": "557",
    "14 DIAS - BOLETO - COMPRAS": "558",
    "21/28 DIAS - BOLETO - COMPRAS": "559",
    "14/21/28 DIAS - BOLETO - COMPRAS": "560",
    "14/21/28/35 DIAS - BOLETO - COMPRAS": "561",
    "14/28 DIAS - BOLETO - COMPRAS": "562",
    "14/28/42 DIAS - BOLETO - COMPRAS": "563",
    "14/28/42/56 DIAS - BOLETO - COMPRAS": "564",
    "14/28/42/56/70 DIAS - BOLETO COMPRAS": "565",
    "14/28/42/56/70/84 BOLETO - COMPRAS": "566",
    "21 DIAS - BOLETO - COMPRAS": "568",
    "21/28/35 DIAS - BOLETO - COMPRAS": "569",
    "28 DIAS - BOLETO - COMPRAS": "570",
    "28/56 DIAS - BOLETO - COMPRAS": "571",
    "28/56/84 DIAS - BOLETO - COMPRAS": "572",
    "28/56/84/112/140 DIAS - BLT - COMPRA": "573",
    "30 DIAS - DEPÓSITO - COMPRAS": "574",
    "30 DIAS - BOLETO - COMPRAS": "575",
    "30/45 DIAS - BOLETO - COMPRAS": "576",
    "30/45/60 DIAS - BOLETO - COMPRAS": "577",
    "30/45/60/75 DIAS - BOLETO - COMPRAS": "578",
    "30/45/60/75/90 DIAS - BOLETO COMPRAS": "579",
    "30/45/60/75/90/105 - BOLETO COMPRAS": "580",
    "30/45/60/75/90/105/120 BOLETO COMPRA": "581",
    "30/60 DIAS - BOLETO - COMPRAS": "582",
    "30/60/90 DIAS - BOLETO - COMPRAS": "583",
    "30/60/90/120 DIAS - BOLETO - COMPRAS": "584",
    "30/60/90/120/150 DIAS BOLETO COMPRAS": "585",
    "30/60/90/120/150/180 BOLETO COMPRAS": "586",
    "45 DIAS - BOLETO - COMPRAS": "587",
    "45 DIAS - DEPÓSITO - COMPRAS": "588",
    "45/60 DIAS - BOLETO - COMPRAS": "589",
    "45/60/75 DIAS - BOLETO - COMPRAS": "590",
    "45/60/75/90 DIAS - BOLETO - COMPRAS": "591",
    "45/60/75/90/105 - BOLETO - COMPRAS": "592",
    "45/60/75/90/105/120 - BOLETO COMPRA": "593",
    "60 DIAS - BOLETO - COMPRAS": "594",
    "60/90 DIAS - BOLETO - COMPRAS": "595",
    "60/90/120 DIAS - BOLETO - COMPRAS": "596",
    "60/90/120/150 DIAS - BOLETO COMPRAS": "597",
    "90 DIAS - BOLETO - COMPRAS": "598",
    "À VISTA - BOLETO - COMPRAS": "599",
    "À VISTA - PIX - COMPRAS": "600",
    "CARTÃO DE CRÉDITO - COMPRAS": "601",
    "ENT + 30/60 DIAS - BOLETO - COMPRAS": "602",
    "DINHEIRO": "603",
    "SUJEITO A ANALISE DE CREDITO": "605",
    "60 DIAS - DEPOSITO": "606",
    "28/42/56 DIAS - BOLETO - COMPRAS": "607",
    "DEPOSITO - SHOPEE": "608",
    "DEPOSITO - MERCADO LIVRE": "609",
    "30 DIAS - SHOPEE": "610",
    "30 DIAS - MERCADO LIVRE": "611",
    "150 DIAS DEPOSITO": "612",
    "49/56/63 DIAS - BOLETO - COMPRAS": "613",
    "42/70 DIAS - BOLETO - COMPRAS": "614",
    "35 DIAS - BOLETO - COMPRAS": "615",
    "45 DIAS BOLETO": "616",
    "35/42/49 DIAS - BOLETO - COMPRAS": "617",
    "56/60/75 - BOLETO COMPRA": "618",
    "ENTRADA + 45 DIAS - BOLETO - COMPRAS": "619",
    "DEVOLUÇÃO DE COMPRA": "620",
    "28/42/56/70/84 - BOLETO - COMPRAS": "621",
    "ENTRADA + 15 DIAS - BOLETO - COMPRAS": "622",
    "28/35/42 DIAS - BOLETO - COMPRAS": "623",
    "28/35 DIAS - BOLETO - COMPRAS": "624",
    "45/60/75/90/105/120/135 - BLT COMPR": "625",
    "42/56/70 DIAS - BOLETO - COMPRAS": "626",
    "28/42 DIAS - BOLETO - COMPRAS": "627",
    "56 DIAS - BOLETO - COMPRAS": "628",
    "20/30/40/50/60/70/80 DIAS - BLT COMP": "629",
    "60/75/90 DIAS - BOLETO - COMPRAS": "630",
    "30/60/90/120/150/180/210/240 - BCOMP": "631",
    "28/42/56/70/84/98 - BOLETO - COMPRAS": "632",
    "30/60/90/120/150/180/210/240/270/300 (633)": "633", // Duplicata
    "20 DIAS - BOLETO - COMPRAS": "634",
    "45/60 PARCELADO BOLETO": "637",
    "15 DIAS - BOLETO - COMPRAS": "638",
    "15/30 DIAS - BOLETO - COMPRAS": "639",
    "50% ENT + 50% FATURADO - COMPRAS": "640",
    "28/56/84/112/140/168/196/224 - B COM": "641",
    "30/40/50/60/70 DIAS - BLT COMP": "642",
    "28/35/42/49 DIAS - BOLETO - COMPRAS": "643",
    "28/42/56/70 - BOLETO - COMPRAS": "644",
    "10 DIAS - BOLETO - COMPRAS": "645",
    "90/120/150/180/210 DIAS - BLT - COMP": "646",
    "30/60/90/120/150 PARCELADO BOLETO": "647",
    "30/60/90/120/150 PARCELADO DEPOSITO": "648",
    "35/42/49/56 DIAS - BOLETO - COMPRAS": "649",
    "21/35 DIAS - BOLETO - COMPRAS": "650",
    "60/90 PARCELADO BOLETO": "651",
    "35/63/91/119 DIAS - BOLETO - COMPRAS": "652",
    "30/40/50/60 DIAS - BLT COMP": "653",
    "28/56/84/112/140/168 - B COM": "654",
    "45/60/90 DIAS - BOLETO - COMPRAS": "655",
    "32 DIAS - BOLETO - COMPRAS": "656",
    "35 DIAS BOLETO": "657",
    "42/49/56/63/70 - BOLETO - COMPRAS": "658",
    "ENT + 28/56 DIAS - BOLETO - COMPRAS": "659",
    "35/50/65/80 DIAS - BOLETO - COMPRAS": "660",
    "21/42/56 DIAS - BOLETO - COMPRAS": "661",
    "150 DIAS BOLETO": "662",
    "42/49/56 - BOLETO - COMPRAS": "663",
    "28/42/56 PARCELADO - DEPOSITO": "664",
    "28/42/56 PARCELADO - BOLETO": "665",
    "75 DIAS - BOLETO - COMPRAS": "666",
    "45/60/75/90 PARCELADO BOLETO": "667",
    "40 DIAS DEPOSITO": "668",
    "30/40/50 DIAS - BLT COMP": "669",
    "42 DIAS - BOLETO - COMPRAS": "670",
    "56/70/84 DIAS - BOLETO - COMPRAS": "672",
    "60/75 DIAS - BOLETO - COMPRAS": "673",
    "ENT + 30/60/90 DIAS - BOLETO - COMP": "674",
    "ENTRADA + 30 DIAS - BOLETO - COMPRAS": "675",
    "42/56/70/84/98 DIAS - BOLETO COMPRAS": "677",
    "45/60/75 PARCELADO BOLETO": "678",
    "60 DIAS - PIX - COMPRAS": "679",
    "7 DIAS - BOLETO": "680",
    "10 DIAS - BOLETO": "681",
    "30/45/60/75/90 DIAS BOLETO": "682",
    "42/56/70/84 DIAS - BOLETO COMPRAS": "683",
    "30/60/90/120/150/180/210/240/270/300 (684)": "684", // Duplicata
    "45/60/90 PARCELADO BOLETO": "685",
    "SEM FINANCEIRO - NÃO USAR": "686",
    "60/70/80/90 DIAS - BLT COMP": "689",
    "63/77/91 DIAS - BOLETO - COMPRAS": "690",
    "60/75/90/105/120 DIAS - BLT COMPRAS": "691",
    "20/30/40 DIAS - BOLETO - COMPRAS": "692",
    "55 DIAS - BOLETO - COMPRAS": "693",
    "49 DIAS - BOLETO - COMPRAS": "694",
    "42/56/63/75 DIAS - BOLETO - COMPRAS": "695",
    "21 DIAS - BOLETO": "696",
    "120 DIAS - BOLETO - COMPRAS": "697",
    "35/49/63 DIAS - BOLETO - COMPRAS": "698",
    "CARTAO AGILLITAS": "699",
    "56/84 DIAS - BOLETO - COMPRAS": "700",
    "45/60 PARCELADO DEPOSITO": "701",
    "150 DIAS - BOLETO - COMPRAS": "702",
    "90/120 DIAS - BOLETO - COMPRAS": "703",
    "27 DIAS - BOLETO - COMPRAS": "704",
    "20/40 DIAS - BOLETO - COMPRAS": "705",
    "35 DIAS DEPOSITO": "706",
    "40/68/96/124 DIAS - BOLETO - COMPRAS": "707",
    "10/30/61/91 DIAS - BOLETO - COMPRAS": "708",
    "10/20/30/40 DIAS - BOLETO - COMPRAS": "709",
    "35/63/91 DIAS - BOLETO - COMPRAS": "710",
    "120/150/180 DIAS - BOLETO COMPRAS": "711",
    "56/84/112 DIAS - BOLETO - COMPRAS": "712",
    "45/75/105 DIAS - BOLETO - COMPRAS": "713",
    "60/75/90/105 DIAS - BLT COMPRAS": "714",
    "45/90 DIAS - BOLETO - COMPRAS": "715",
    "28/35/42/49/56 DIAS - BLT - COMPRAS": "716",
    "5 DIAS - BOLETO - COMPRAS": "717",
    "20/40/60 DIAS - BOLETO - COMPRAS": "718",
    "35/42/49/56/63 DIAS - BLT - COMPRAS": "719",
    "ENT+30/60/90/120/150 DIAS - BLT COMP": "720",
    "ENTRADA + 28 DIAS - BOLETO - COMPRAS": "721",
    "ENT + 30/45 DIAS - BOLETO - COMPRAS": "722",
    "28/56/84/112 PARCELADO BOLETO": "723",
    "30/60/90/105 DIAS - BOLETO - COMPRAS": "724",
    "30/60/75/90 PARCELADO BOLETO": "725",
    "28/56/84/112 - B COMPRAS": "726",
    "40/60/90 DEPOSITO": "727",
    "45/60/90 DEPOSITO": "728",
    "7 DIAS BOLETO": "729",
    "15 DIAS BOLETO (730)": "730",    // Duplicata - adicionado código
    "20 DIAS BOLETO": "732",
    "28 DIAS BOLETO (733)": "733",    // Duplicata - adicionado código
    "30 DIAS BOLETO (734)": "734",    // Duplicata - adicionado código
    "28/35 PARC BOLETO": "735",
    "28/35/42 PARC BOLETO": "736",
    "30/60 PARC BOLETO": "737",
    "30/60/90 PARC BOLETO": "738",
    "30/44/58/72/86/100 DIAS - BLT COMP": "747",
    "28/35/42/56/70 DIAS - BLT - COMPRAS": "748",
    "45/75/105 PARCELADO BOLETO": "749",
    "45/75 PARCELADO BOLETO": "750",
    "28/35/42/56 DIAS - BOLETO - COMPRAS": "751",
    "10 DIAS DEPOSITO": "752",
    "ENT + CARTÃO DE CRÉDITO - COMPRAS": "753",
    "7/60/90 PARC BOLETO": "755",
    "120/150 DIAS - BOLETO COMPRAS": "756",
    "90/120/150 DIAS - BOLETO - COMPRAS": "757",
    "ESPRESSO DESPESAS": "758",
    "45/75/105/135 DIAS - BLT - COMPRAS": "759",
    "40/50/60/70/80 DIAS - BLT COMP": "760",
    "37 DIAS - DEPOSITO": "761",
    "28/49/70/91- BOLETO - COMPRAS": "762",
    "45/60/75/90/105 - BOLETO COMPRAS": "763",
    "75/90/105/120 DIAS - BLT COMPRAS": "764",
    "COMPRAS COM FINANCEIRO ST": "765",
    "30 DIAS - DEPOSITO COMODATO": "766",
    "60 DIAS - DEPOSITO COMODATO": "767",
    "30 DIAS - LOJA INTEGRADA": "768",
    "45 DE 07 EM 07 ATÉ 122D - BLT - COMP": "769"
};

// Converter para array de options
const options = Object.entries(mappingData).map(([label, value], index) => ({
    label,
    value,
    displayOrder: index,
    hidden: false
}));

async function createProperty() {
    const url = 'https://api.hubapi.com/crm/v3/properties/deals';

    const propertyData = {
        name: 'tipo_negociacao',
        label: 'Tipo Negociação',
        type: 'enumeration',
        fieldType: 'select',
        groupName: 'dealinformation',
        description: 'Tipo de negociação/forma de pagamento (código Sankhya)',
        options
    };

    const response = await axios.post(url, propertyData, {
        headers: {
            Authorization: `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
        }
    });

    return response.data;
}

async function main() {
    console.log('🚀 Criando propriedade tipo_negociacao no HubSpot...');
    console.log(`📋 ${options.length} opções a serem criadas\n`);

    try {
        const result = await createProperty();
        console.log('✅ Propriedade criada com sucesso!');
        console.log(`   Nome: ${result.name}`);
        console.log(`   Label: ${result.label}`);
        console.log(`   Opções: ${result.options?.length || 0}`);
    } catch (err) {
        if (err.response?.status === 409) {
            console.log('⚠️ Propriedade já existe! Delete ela no HubSpot e tente novamente.');
        } else {
            throw err;
        }
    }
}

main().catch(err => {
    console.error('❌ Erro:', err.response?.data || err.message);
    process.exit(1);
});
