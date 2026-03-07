import axios from 'axios';

async function testAuth() {
  const clientId = "4453778a-a8eb-4a6f-8855-6bc816619d97";
  const clientSecret = "NWIHUC3XkFKimNgoO0hnieIEReicPAb7";
  const xToken = "687624be-6104-467c-89ea-c7984d92954d";
  const baseUrl = "https://api.sandbox.sankhya.com.br";

  console.log(`Testing Auth against ${baseUrl}...`);
  console.log(`Client ID: ${clientId}`);
  console.log(`X-Token: ${xToken}`);

  try {
    const params = new URLSearchParams();
    params.append('grant_type', 'client_credentials');
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);

    const response = await axios.post(`${baseUrl}/authenticate`, params, {
      headers: {
        'X-Token': xToken,
        'appkey': clientId,
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    console.log('SUCCESS!');
    console.log('Access Token acquired.');
    
    const accessToken = response.data.access_token;
    
    console.log('---');
    console.log('Testing a call to a service using Bearer token...');
    
    const serviceUrl = `${baseUrl}/gateway/v1/mge/service.sbr?serviceName=DbExplorerSP.executeQuery&outputType=json`;
    try {
      const qResp = await axios.post(serviceUrl, {
        serviceName: "DbExplorerSP.executeQuery",
        requestBody: { sql: "SELECT 1 AS TESTE FROM DUAL" }
      }, {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      
      console.log('SERVICE CALL SUCCESS!');
      console.log('Rows:', qResp.data?.responseBody?.rows);
    } catch (svcErr) {
      console.error('SERVICE CALL ERROR:');
      if (svcErr.response) {
        console.error('Status:', svcErr.response.status);
        console.error('Data:', svcErr.response.data);
      } else {
        console.error(svcErr.message);
      }
    }

  } catch (error) {
    console.error('ERROR during auth:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

testAuth();
