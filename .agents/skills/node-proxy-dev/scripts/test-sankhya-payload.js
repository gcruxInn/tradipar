/**
 * TESTE SEGURO DE PAYLOADS SANKHYA VIA GW/CACSP
 * Este script testa a mecânica de Inclusão e Alteração da API do Sankhya, validando a teoria
 * de SEQUENCIA vazia combinada com INFORMARPRECO=True para bypass de inserção (CREATE).
 * Utilização: node -r dotenv/config .agents/skills/node-proxy-dev/scripts/test-sankhya-payload.js
 */
const axios = require('axios');
const querystring = require('querystring');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../../aws-server-alef/.env') });

async function testPayloadSanity() {
    const SANKHYA_CLIENT_ID = process.env.SANKHYA_CLIENT_ID;
    const SANKHYA_CLIENT_SECRET = process.env.SANKHYA_CLIENT_SECRET;
    const SANKHYA_BASE_URL = process.env.SANKHYA_BASE_URL;

    if (!SANKHYA_CLIENT_ID || !SANKHYA_BASE_URL) {
        console.error("ERRO: Variáveis de ambiente .env do aws-server-alef não carregadas.");
        return;
    }

    const authData = querystring.stringify({
        grant_type: 'client_credentials'
    });

    const authConfig = {
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Token': process.env.SANKHYA_XTOKEN
        }
    };

    try {
        console.log(`[AUTH] Conectando a ${SANKHYA_BASE_URL}...`);
        const response = await axios.post(SANKHYA_BASE_URL + '/authenticate', authData, authConfig);
        const token = response.data.access_token;

        // Altere NUNOTA para um orçamento/nota válido de testes em Sandbox
        const testNunota = 461693;

        const payload = {
            serviceName: 'CACSP.incluirAlterarItemNota',
            requestBody: {
                nota: {
                    NUNOTA: testNunota.toString(),
                    itens: {
                        INFORMARPRECO: "True", // Bypass para salvar totais e pular soft-rollback
                        item: {
                            NUNOTA: { '$': testNunota },
                            SEQUENCIA: { '$': '' }, // Chave Vazia pra disparar o trigger de INSERT
                            CODPROD: { '$': 8569 },
                            QTDNEG: { '$': 1 },
                            VLRUNIT: { '$': 5.50 },
                            VLRTOT: { '$': 5.50 },
                            CODVOL: { '$': 'UN' },
                            CODLOCALORIG: { '$': 101000 },
                            PERCDESC: { '$': 0 },
                            VLRDESC: { '$': 0 },
                            CONTROLE: { '$': '41' }
                        }
                    }
                }
            }
        };

        console.log('\n[TESTE CREATE] Testando CREATE com INFORMARPRECO=True e SEQUENCIA=""...');
        let resp = await axios.post(`${SANKHYA_BASE_URL}/gateway/v1/mgecom/service.sbr?serviceName=CACSP.incluirAlterarItemNota&outputType=json`, payload, {
            headers: { Authorization: 'Bearer ' + token }
        });
        console.log('[RESP CREATE]:', JSON.stringify(resp.data, null, 2));

        // Validação de update: para dar update precisa especificar SEQUENCIA válida do banco
        payload.requestBody.nota.itens.item.SEQUENCIA = { '$': 9999 };
        console.log('\n[TESTE UPDATE] Testando UPDATE inválido com SEQUENCIA="9999" (Espera-se erro de PK não existente para provar funcionamento)...');
        let resp2 = await axios.post(`${SANKHYA_BASE_URL}/gateway/v1/mgecom/service.sbr?serviceName=CACSP.incluirAlterarItemNota&outputType=json`, payload, {
            headers: { Authorization: 'Bearer ' + token }
        });
        console.log('[RESP UPDATE]:', JSON.stringify(resp2.data, null, 2));

    } catch (error) {
        console.error('[ERRO FATAL]', error.response ? JSON.stringify(error.response.data) : error.message);
    }
}

testPayloadSanity();
