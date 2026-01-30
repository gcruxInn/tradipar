import axios from 'axios';
import fs from 'fs';

/**
 * Full Sync de Produtos em Batches - Sankhya -> HubSpot
 * 
 * Uso:
 *   node full_sync_products.js [URL_BASE] [BATCH_SIZE] [--resume]
 */

const STATE_FILE = './product_sync_state.json';

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

async function fullSyncProducts() {
    const baseUrl = process.argv[2] || "http://localhost:3000";
    const batchSize = parseInt(process.argv[3]) || 1000;
    const resumeFromState = process.argv.includes('--resume');
    const isIncremental = process.argv.includes('--incremental');
    const endpoint = `${baseUrl}/sankhya/import/products`;

    console.log("🚀 Sync de Produtos - Sankhya -> HubSpot");
    console.log(`📡 Target: ${endpoint}`);
    console.log(`📦 Batch Size: ${batchSize}`);
    console.log(`🔄 Mode: ${isIncremental ? 'INCREMENTAL (Last 24h)' : 'FULL SYNC'}`);

    // Incremental logic
    let sinceDate = null;
    if (isIncremental) {
        const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000); // 24h ago
        sinceDate = yesterday.toISOString().split('.')[0];
    }

    const state = loadState();
    let currentOffset = (resumeFromState && !isIncremental) ? state.lastOffset : 0;

    if (resumeFromState && !isIncremental && state.lastOffset > 0) {
        console.log(`⏩ Resumindo do offset ${state.lastOffset} (último sync: ${state.lastSync})`);
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
                offset: currentOffset,
                since: sinceDate
            }, {
                timeout: 300000 // 5 minutos
            });

            const { stats, processed, nextOffset } = response.data;

            if (processed === 0) {
                console.log(`✅ Nenhum produto novo encontrado. Sync completo!`);
                break;
            }

            totalCreated += (stats.created || 0);
            totalUpdated += (stats.updated || 0);
            totalErrors += (stats.errors || 0);
            totalProcessed += processed;

            console.log(`   Processados: ${processed}`);
            console.log(`   ├─ Criados: ${stats.created || 0}`);
            console.log(`   ├─ Atualizados: ${stats.updated || 0}`);
            console.log(`   └─ Erros: ${stats.errors || 0}`);

            currentOffset = nextOffset;
            saveState(currentOffset, { totalCreated, totalUpdated, totalErrors, totalProcessed });

            if (processed < batchSize) {
                console.log(`\n✅ Último batch processado. Sync completo!`);
                break;
            }

            console.log(`⏳ Aguardando 2s antes do próximo batch...`);
            await new Promise(r => setTimeout(r, 2000));
        }

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);
        console.log("\n\n✅ ========== SYNC DE PRODUTOS COMPLETO ==========");
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

        console.log("\n🎉 Sync de Produtos concluído com sucesso!");

    } catch (error) {
        console.error("\n❌ Erro no Sync de Produtos:");
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

fullSyncProducts();
