const axios = require('axios');
(async () => {
    try {
        const loginPayload = {
            serviceName: 'MobileLoginSP.login',
            requestBody: {
                NOMUSU: { $: 'gcrux' },
                INTERNO: { $: 'Dksd523x262!' }
            }
        };
        const authUrl = "https://sankhya.tradipar.com.br:8180/mge/workspace/logon.do?outputType=json";
        const loginRes = await axios.post(authUrl, loginPayload);
        const jsessionid = loginRes.data.responseBody.jsessionid.$ || loginRes.headers['set-cookie'][0].split(';')[0];

        const payload = {
            serviceName: "CACSP.excluirItemNota",
            requestBody: {
                item: {
                    NUNOTA: { "$": 461693 },
                    SEQUENCIA: { "$": 1 }
                }
            }
        };
        const baseUrl = "https://sankhya.tradipar.com.br:8180";
        const delResp = await axios.post(`${baseUrl}/gateway/v1/mgecom/service.sbr?serviceName=CACSP.excluirItemNota&outputType=json`, payload, {
            headers: { Authorization: `Bearer ${jsessionid}`, Cookie: `JSESSIONID=${jsessionid}` }
        });

        console.log("Response:", JSON.stringify(delResp.data, null, 2));
    } catch (e) {
        console.error(e.response ? e.response.data : e.message);
    }
})();
