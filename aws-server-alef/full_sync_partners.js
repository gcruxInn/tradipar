import axios from 'axios';
import fs from 'fs';

/**
 * Full Sync em Batches - Importa TODOS os parceiros ativos do Sankhya
 * Processa em lotes com paginação (offset) até acabar todos os registros
 * 
 * Uso:
 *   node full_sync_partners.js [URL_BASE] [BATCH_SIZE]
 * 
 * Exemplo:
 *   node full_sync_partners.js https://api.gcrux.com
 *   node full_sync_partners.js https://api.gcrux.com 500
 */

const STATE_FILE = './sync_state.json';

function loadState() {
    if (fs.existsSync(STATE_FILE)) {
        try {
            return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        } catch {
            return { lastOffset: 0, lastSync: null };
        }
    }
    return { lastOffset: 0, lastSync: null };
}

function saveState(offset, stats) {
    fs.writeFileSync(STATE_FILE, JSON.stringify({
        lastOffset: offset,
        lastSync: new Date().toISOString(),
        lastStats: stats
    }, null, 2));
}

async function fullSyncPartners() {
    const baseUrl = process.argv[2] || "http://localhost:3000";
    const batchSize = parseInt(process.argv[3]) || 1000;
    const resumeFromState = process.argv[4] === '--resume';
    const endpoint = `${baseUrl}/sankhya/import/partners`;

    console.log("🚀 Full Sync em Batches - Parceiros Sankhya -> HubSpot");
    console.log(`📡 Target: ${endpoint}`);
    console.log(`📦 Batch Size: ${batchSize}`);

    const state = loadState();
    let currentOffset = resumeFromState ? state.lastOffset : 0;

    if (resumeFromState && state.lastOffset > 0) {
        console.log(`🔄 Resumindo do offset ${state.lastOffset} (último sync: ${state.lastSync})`);
    }
    console.log("");

    const startTime = Date.now();
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    let totalProcessed = 0;
    let batchNumber = 0;

    try {
        while (true) {
            batchNumber++;
            console.log(`\n📊 ========== BATCH ${batchNumber} (offset: ${currentOffset}) ==========`);

            const response = await axios.post(endpoint, {
                limit: batchSize,
                offset: currentOffset
            }, {
                timeout: 300000 // 5 minutos
            });

            const { stats, processed, nextOffset } = response.data;

            // Se não processou nada, acabaram os registros
            if (processed === 0) {
                console.log(`✅ Nenhum registro novo encontrado. Sync completo!`);
                break;
            }

            const batchCreated = stats.created || 0;
            const batchUpdated = stats.updated || 0;
            const batchErrors = stats.errors || 0;

            totalCreated += batchCreated;
            totalUpdated += batchUpdated;
            totalErrors += batchErrors;
            totalProcessed += processed;

            console.log(`   Processados: ${processed}`);
            console.log(`   ├─ Criados: ${batchCreated}`);
            console.log(`   ├─ Atualizados: ${batchUpdated}`);
            console.log(`   └─ Erros: ${batchErrors}`);

            // Atualizar offset usando o nextOffset retornado pela API
            currentOffset = nextOffset;

            // Salvar estado após cada batch (crash recovery)
            saveState(currentOffset, { totalCreated, totalUpdated, totalErrors, totalProcessed });

            // Se processou menos que o batch size, acabaram os registros
            if (processed < batchSize) {
                console.log(`\n✅ Último batch processado (${processed} < ${batchSize}). Sync completo!`);
                break;
            }

            // Delay entre batches para não sobrecarregar
            console.log(`⏳ Aguardando 2s antes do próximo batch...`);
            await new Promise(r => setTimeout(r, 2000));
        }


        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log("\n\n✅ ========== SYNC COMPLETO ==========");
        console.log(`⏱️  Tempo Total: ${duration}s`);
        console.log(`📦 Batches: ${batchNumber}`);
        console.log(`📊 Total Processados: ${totalProcessed}`);
        console.log(`   ├─ Criados: ${totalCreated}`);
        console.log(`   ├─ Atualizados: ${totalUpdated}`);
        console.log(`   └─ Erros: ${totalErrors}`);

        if (totalErrors > 0) {
            console.log(`\n⚠️  Taxa de erro: ${((totalErrors / totalProcessed) * 100).toFixed(2)}%`);
            console.log("💡 Verifique os logs do servidor para detalhes dos erros.");
        }

        console.log("\n🎉 Full Sync concluído com sucesso!");

    } catch (error) {
        console.error("\n❌ Erro no Full Sync:");
        if (error.response) {
            console.error(`   Status: ${error.response.status}`);
            console.error(`   Mensagem: ${JSON.stringify(error.response.data)}`);
        } else if (error.code === 'ECONNABORTED') {
            console.error(`   Timeout atingido. Tente aumentar o timeout ou reduzir o batch size.`);
        } else {
            console.error(`   ${error.message}`);
        }

        if (totalProcessed > 0) {
            console.log(`\n📊 Parcialmente concluído antes do erro:`);
            console.log(`   Total Processados: ${totalProcessed}`);
            console.log(`   Criados: ${totalCreated} | Atualizados: ${totalUpdated} | Erros: ${totalErrors}`);
        }

        process.exit(1);
    }
}

fullSyncPartners();
