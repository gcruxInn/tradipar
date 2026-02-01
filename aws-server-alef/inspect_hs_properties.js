import axios from 'axios';
import dotenv from 'dotenv';
dotenv.config();

const token = process.env.HUBSPOT_ACCESS_TOKEN;

async function listProperties() {
    try {
        console.log("🔍 Buscando propriedades de PRODUTOS no HubSpot...");
        const response = await axios.get('https://api.hubspot.com/crm/v3/properties/products', {
            headers: { Authorization: `Bearer ${token}` }
        });

        const props = response.data.results;
        console.log(`✅ ${props.length} propriedades encontradas.`);

        // Filtrar as que parecem ser unidade, grupo, marca, ncm e PRECO
        const relevant = props.filter(p =>
            p.name.includes('uni') ||
            p.name.includes('desc') ||
            p.name.includes('marca') ||
            p.name.includes('ncm') ||
            p.name.includes('grupo') ||
            p.name.includes('price') ||
            p.name.includes('preco') ||
            p.label.toLowerCase().includes('unidade')
        );

        console.log("\n📋 Propriedades Relevantes Encontradas:");
        relevant.forEach(p => {
            console.log(`- Label: "${p.label}" | Name (Internal): "${p.name}" | Type: ${p.type}`);
        });

    } catch (error) {
        console.error("❌ Erro:", error.response ? error.response.data : error.message);
    }
}

listProperties();
