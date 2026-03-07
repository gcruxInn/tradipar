import { quoteService } from './src/services/quote.service';

async function run() {
    try {
        const nunota = "461838";
        console.log(`Testando geração de PDF para o Pedido NUNOTA: ${nunota}`);
        const result = await quoteService.generateSankhyaPDF(nunota);
        console.log("PDF Gerado com sucesso!");
        console.log("FileName:", result.fileName);
        console.log("Base64 length:", result.base64.length);
    } catch (e: any) {
        console.error("ERRO na geração do PDF:", e.message);
    }
}

run();
