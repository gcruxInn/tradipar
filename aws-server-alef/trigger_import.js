const axios = require('axios');

async function triggerImport() {
    try {
        console.log("🚀 Triggering Partner Import (Sankhya -> HubSpot)...");
        // Adjust URL if testing locally or on prod
        const url = process.argv[2] || "http://localhost:3000/sankhya/import/partners";

        console.log(`Target: ${url}`);

        // Start timestamp
        const start = Date.now();

        const response = await axios.post(url, { limit: 100 }); // Optional params

        const duration = (Date.now() - start) / 1000;
        console.log(`✅ Import Completed in ${duration}s`);
        console.log("Stats:", JSON.stringify(response.data.stats, null, 2));

    } catch (error) {
        console.error("❌ Import Failed:", error.message);
        if (error.response) console.log("Details:", error.response.data);
    }
}

triggerImport();
