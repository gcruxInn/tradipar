import { executeSankhyaQuery } from './sankhya.js'; // Ajuste o import conforme seu projeto (se sankhya.js exporta executeSankhyaQuery)
// Como o projeto usa 'type': 'module', e sankhya.js probably doesn't export nicely without tweaks, 
// let's copy the execution logic to be standalone and safe using axios directly.

import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

// Função "mock" do executeSankhyaQuery usando as vars de ambiente, 
// caso não consigamos importar do sankhya.js facilmente devido a deps.
async function runQuery(sql) {
    const token = process.env.HUBSPOT_ACCESS_TOKEN; // Usando token do env se precisar, mas aqui é Sankhya direct?
    // O index.js usa executeSankhyaQuery que faz o login. 
    // Vamos tentar importar o index.js? Não, ele sobe o server.

    // Vamos ler o sankhya.js para ver como importar?
    // Mais fácil: Usar o endpoint que já existe no index.js?
    // Não temos endpoint de query genérica (removemos).

    // Vou fazer este script assumir que consegue importar 'executeSankhyaQuery' do arquivo local './sankhya.js'
    // Se falhar, o user avisa.
}

// Melhor: Criar um script que faz o FLUXO COMPLETO de login Sankhya standalone.
// Vou copiar a lógica básica de login.

const SANKHYA_BASE_URL = process.env.SANKHYA_API_URL || "http://137.131.243.179:8180";
// O IP do sankhya service manager. O index.js usa services.sankhya.com.br?
// Vamos tentar importar de './services/sankhya.js' se existir.

// LENDO o arquivo sankhya.js do projeto seria ideal mas não tenho acesso agora fácil sem view_file.
// Vou fazer um script que tenta usar o endpoint /sankhya/login do PRÓPRIO servidor (localhost:3000) se existir?
// Não.

// APPROACH: Criar script que roda dentro do context do projeto e importa './services/sankhya.js' (supondo caminho).
// Se o index.js importa `executeSankhyaQuery`, ele deve vir de algum lugar.
// Vimos no index.js: `const { executeSankhyaQuery } = require('./services/sankhya');` (ou import).
// Vou assumir que está em `./services/sankhya.js`.

console.log("🔍 Diagnóstico de Preços Sankhya");

// Tentar importar dinamicamente
try {
    // Ajuste este caminho se necessário
    const sankhyaService = await import('./services/sankhya.js');

    // Query 1: Ver quais tabelas de preço existem e estão ativas
    console.log("\n📋 Tabelas de Preço Ativas (TGFTAB):");
    const tabelas = await sankhyaService.executeSankhyaQuery("SELECT NUTAB, NOMETAB FROM TGFTAB WHERE ATIVA = 'S' ORDER BY NUTAB");
    console.table(tabelas);

    // Query 2: Ver amostra de preços na TGFEXC
    console.log("\n💰 Amostra de Preços (TGFEXC) para os primeiros 10 produtos:");
    const precos = await sankhyaService.executeSankhyaQuery(`
        SELECT P.CODPROD, P.DESCRPROD, E.NUTAB, T.NOMETAB, E.VLRVENDA 
        FROM TGFPRO P
        JOIN TGFEXC E ON P.CODPROD = E.CODPROD
        JOIN TGFTAB T ON E.NUTAB = T.NUTAB
        WHERE P.ATIVO = 'S' AND ROWNUM <= 50
        ORDER BY P.CODPROD DESC
    `);

    if (precos.length === 0) {
        console.log("⚠️ NENHUM PREÇO ENCONTRADO na tabela TGFEXC para produtos ativos.");
    } else {
        console.table(precos);

        // Count frequency of NUTAB usage
        const counts = {};
        precos.forEach(p => {
            counts[p.NUTAB] = (counts[p.NUTAB] || 0) + 1;
        });
        console.log("\n📊 Frequência de Tabelas (NUTAB) na amostra:", counts);
    }

} catch (error) {
    console.error("❌ Erro fatal:", error);
}
