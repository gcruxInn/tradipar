/**
 * Script para atualizar opções de Tipo de Negociação no HubSpot
 * Altera os nomes internos para usar códigos do Sankhya
 * 
 * Uso: node update-tipo-negociacao.js
 */

import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const HUBSPOT_TOKEN = process.env.HUBSPOT_ACCESS_TOKEN;
const PROPERTY_NAME = 'tipo_negociacao'; // ID da propriedade no HubSpot

// Mapeamento completo: Descrição Sankhya → Código Sankhya
const SANKHYA_TYPES = {
    '<SEM TIPO DE VENDA>': '0',
    'A VISTA': '1',
    'VBV': '2',
    'CARTÃO': '3',
    '28 DIAS BOLETO': '4',
    '28/56 PARCELADO BOLETO': '5',
    '28/56/84 PARCELADO BOLETO': '6',
    'A PRAZO - 0 DIAS': '11',
    '7 DIAS - DEPOSITO': '12',
    '15 DIAS BOLETO': '13',
    '20 DIAS - DEPOSITO': '14',
    '21 DIAS - DEPOSITO': '15',
    '28 DIAS - DEPOSITO': '16',
    '30 DIAS - DEPOSITO': '17',
    '45 DIAS - DEPOSITO': '18',
    '30/60 PARCELADO - DEPOSITO': '20',
    '30/60/90 PARCELADO - DEPOSITO': '21',
    '30/60/90/120 PARCELADO DEPOSITO': '22',
    'PIX': '500',
    '30 DIAS BOLETO': '503',
    '60 DIAS BOLETO': '505',
    '90 DIAS BOLETO': '507',
    '120 DIAS BOLETO': '509',
    '30/60 PARCELADO BOLETO': '516',
    '30/60/90 PARCELADO BOLETO': '517',
    '30/60/90/120 PARCELADO BOLETO': '518',
    '30/60/90/120/180/210 PARCELADO BOLET': '520',
    '45/60/75/90/105 PARCELADO BOLETO': '524',
    '30/45 PARCELADO BOLETO': '526',
    '30/45/60 PARCELADO BOLETO': '527',
    '30/45/60/75 PARCELADO BOLETO': '528',
    '30/45/60/75/90/105/120 PARCELADO BOL': '531',
    '28/35/42 PARCELADO BOLETO': '534',
    '28/42 PARCELADO BOLETO': '539',
    'DEVOLUCAO DE VENDA - CRED CLIENTE': '548',
    '90 DIAS - DEPOSITO': '550',
    '20 - DIAS BOLETO - FORA DEZENA': '551',
    '07 DIAS - BOLETO - COMPRAS': '552',
    '07/14 DIAS - BOLETO - COMPRAS': '554',
    '07/14/21 DIAS - BOLETO - COMPRAS': '555',
    '07/14/21/28 DIAS - BOLETO - COMPRAS': '556',
    '07/14/21/28/35 DIAS - BOLETO COMPRAS': '557',
    '14 DIAS - BOLETO - COMPRAS': '558',
    '21/28 DIAS - BOLETO - COMPRAS': '559',
    '14/21/28 DIAS - BOLETO - COMPRAS': '560',
    '14/21/28/35 DIAS - BOLETO - COMPRAS': '561',
    '14/28 DIAS - BOLETO - COMPRAS': '562',
    '14/28/42 DIAS - BOLETO - COMPRAS': '563',
    '14/28/42/56 DIAS - BOLETO - COMPRAS': '564',
    '14/28/42/56/70 DIAS - BOLETO COMPRAS': '565',
    '14/28/42/56/70/84 BOLETO - COMPRAS': '566',
    '21 DIAS - BOLETO - COMPRAS': '568',
    '21/28/35 DIAS - BOLETO - COMPRAS': '569',
    '28 DIAS - BOLETO - COMPRAS': '570',
    '28/56 DIAS - BOLETO - COMPRAS': '571',
    '28/56/84 DIAS - BOLETO - COMPRAS': '572',
    '28/56/84/112/140 DIAS - BLT - COMPRA': '573',
    '30 DIAS - DEPÓSITO - COMPRAS': '574',
    '30 DIAS - BOLETO - COMPRAS': '575',
    '30/45 DIAS - BOLETO - COMPRAS': '576',
    '30/45/60 DIAS - BOLETO - COMPRAS': '577',
    '30/45/60/75 DIAS - BOLETO - COMPRAS': '578',
    '30/45/60/75/90 DIAS - BOLETO COMPRAS': '579',
    '30/45/60/75/90/105 - BOLETO COMPRAS': '580',
    '30/45/60/75/90/105/120 BOLETO COMPRA': '581',
    '30/60 DIAS - BOLETO - COMPRAS': '582',
    '30/60/90 DIAS - BOLETO - COMPRAS': '583',
    '30/60/90/120 DIAS - BOLETO - COMPRAS': '584',
    '30/60/90/120/150 DIAS BOLETO COMPRAS': '585',
    '30/60/90/120/150/180 BOLETO COMPRAS': '586',
    '45 DIAS - BOLETO - COMPRAS': '587',
    '45 DIAS - DEPÓSITO - COMPRAS': '588',
    '45/60 DIAS - BOLETO - COMPRAS': '589',
    '45/60/75 DIAS - BOLETO - COMPRAS': '590',
    '45/60/75/90 DIAS - BOLETO - COMPRAS': '591',
    '45/60/75/90/105 - BOLETO - COMPRAS': '592',
    '45/60/75/90/105/120 - BOLETO COMPRA': '593',
    '60 DIAS - BOLETO - COMPRAS': '594',
    '60/90 DIAS - BOLETO - COMPRAS': '595',
    '60/90/120 DIAS - BOLETO - COMPRAS': '596',
    '60/90/120/150 DIAS - BOLETO COMPRAS': '597',
    '90 DIAS - BOLETO - COMPRAS': '598',
    'À VISTA - BOLETO - COMPRAS': '599',
    'À VISTA - PIX - COMPRAS': '600',
    'CARTÃO DE CRÉDITO - COMPRAS': '601',
    'ENT + 30/60 DIAS - BOLETO - COMPRAS': '602',
    'DINHEIRO': '603',
    'SUJEITO A ANALISE DE CREDITO': '605',
    '60 DIAS - DEPOSITO': '606',
    '28/42/56 DIAS - BOLETO - COMPRAS': '607',
    // ... continua com todos os outros
};

// Função para normalizar texto (remover acentos, maiúsculas, espaços extras)
function normalizeText(text) {
    return text
        .toUpperCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// Buscar código pelo label (com matching flexível)
function findSankhyaCode(label) {
    const normalizedLabel = normalizeText(label);

    for (const [desc, code] of Object.entries(SANKHYA_TYPES)) {
        if (normalizeText(desc) === normalizedLabel) {
            return code;
        }
    }

    // Tentar match parcial
    for (const [desc, code] of Object.entries(SANKHYA_TYPES)) {
        if (normalizedLabel.includes(normalizeText(desc)) ||
            normalizeText(desc).includes(normalizedLabel)) {
            return code;
        }
    }

    return null;
}

async function getPropertyOptions() {
    const url = `https://api.hubapi.com/crm/v3/properties/deals/${PROPERTY_NAME}`;

    const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${HUBSPOT_TOKEN}` }
    });

    return response.data;
}

async function updatePropertyOptions(options) {
    const url = `https://api.hubapi.com/crm/v3/properties/deals/${PROPERTY_NAME}`;

    const response = await axios.patch(url, { options }, {
        headers: {
            Authorization: `Bearer ${HUBSPOT_TOKEN}`,
            'Content-Type': 'application/json'
        }
    });

    return response.data;
}

async function main() {
    console.log('🔄 Buscando propriedade tipo_negociacao...\n');

    const property = await getPropertyOptions();
    console.log(`📋 Encontradas ${property.options.length} opções\n`);

    let matched = 0;
    let unmatched = 0;

    const updatedOptions = property.options.map((option) => {
        const sankhyaCode = findSankhyaCode(option.label);

        if (sankhyaCode) {
            console.log(`✅ "${option.label}" → ${sankhyaCode}`);
            matched++;
            return { ...option, value: sankhyaCode };
        } else {
            console.log(`⚠️ "${option.label}" → SEM MATCH (mantendo "${option.value}")`);
            unmatched++;
            return option;
        }
    });

    console.log(`\n📊 Resultados: ${matched} matches, ${unmatched} sem match\n`);

    if (matched > 0) {
        console.log('🚀 Atualizando propriedade...');
        await updatePropertyOptions(updatedOptions);
        console.log('✅ Propriedade atualizada com sucesso!');
    } else {
        console.log('❌ Nenhum match encontrado. Verifique o mapeamento.');
    }
}

main().catch(err => {
    console.error('❌ Erro:', err.response?.data || err.message);
    process.exit(1);
});
