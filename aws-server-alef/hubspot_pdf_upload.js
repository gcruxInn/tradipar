/**
 * Upload de PDF para o HubSpot Files API
 * @param {string} fileName -Nome do arquivo (ex: "461431_Orcamento.pdf")
 * @param {string} base64Data - Conteúdo do PDF em Base64
 * @returns {Promise<{fileId: string, url: string}>} - ID e URL do arquivo no HubSpot
 */
async function uploadPDFToHubSpot(fileName, base64Data) {
    const hubspotToken = requireEnv('hubspotToken');
    const buffer = Buffer.from(base64Data, 'base64');

    // HubSpot Files API requer multipart/form-data
    const FormData = (await import('form-data')).default;
    const form = new FormData();

    form.append('file', buffer, {
        filename: fileName,
        contentType: 'application/pdf'
    });

    form.append('options', JSON.stringify({
        access: 'PRIVATE',
        overwrite: false
    }));

    form.append('folderPath', '/Orcamentos');

    console.log(`[HUBSPOT] Uploading PDF: ${fileName}...`);

    const response = await axios.post(
        'https://api.hubapi.com/files/v3/files',
        form,
        {
            headers: {
                ...form.getHeaders(),
                'Authorization': `Bearer ${hubspotToken}`
            },
            maxContentLength: Infinity,
            maxBodyLength: Infinity
        }
    );

    console.log(`[HUBSPOT] Upload concluído. File ID: ${response.data.id}`);

    return {
        fileId: response.data.id,
        url: response.data.url
    };
}

/**
 * Cria uma nota no HubSpot com o PDF anexado e associa ao Deal
 * @param {string} dealId - ID do Deal no HubSpot
 * @param {string} fileId - ID do arquivo no HubSpot (retornado do upload)
 * @param {string} nunota - Número da nota no Sankhya
 */
async function createNoteWithPDFAttachment(dealId, fileId, nunota) {
    const hubspotToken = requireEnv('hubspotToken');

    const payload = {
        properties: {
            hs_timestamp: new Date().toISOString(),
            hs_note_body: `Orçamento Sankhya #${nunota} anexado automaticamente.`,
            hs_attachment_ids: fileId.toString()
        },
        associations: [
            {
                to: { id: dealId },
                types: [{
                    associationCategory: 'HUBSPOT_DEFINED',
                    associationTypeId: 214 // Note to Deal
                }]
            }
        ]
    };

    console.log(`[HUBSPOT] Criando nota com anexo no Deal ${dealId}...`);

    const response = await axios.post(
        'https://api.hubapi.com/crm/v3/objects/notes',
        payload,
        {
            headers: {
                'Authorization': `Bearer ${hubspotToken}`,
                'Content-Type': 'application/json'
            }
        }
    );

    console.log(`[HUBSPOT] Nota criada com sucesso. Note ID: ${response.data.id}`);

    return response.data.id;
}
