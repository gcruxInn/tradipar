import axios from 'axios';
import fs from 'fs';

async function testAuth() {
  const envContent = fs.readFileSync('.env', 'utf-8');
  const env = {};
  envContent.split('\n').forEach(line => {
    const [key, ...values] = line.split('=');
    if (key && values.length > 0) {
      env[key.trim()] = values.join('=').trim();
    }
  });

  const clientId = env.SANKHYA_CLIENT_ID;
  const clientSecret = env.SANKHYA_CLIENT_SECRET;
  const xToken = env.SANKHYA_XTOKEN;
  const baseUrl = env.SANKHYA_BASE_URL;

  console.log(`Testing Auth against ${baseUrl}...`);
  console.log(`Client ID: ${clientId}`);
  console.log(`X-Token: ${xToken}`);

  try {
    const tokenBuffer = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    
    // According to Sankhya OM new auth guide (https://developer.sankhya.com.br/reference/post_authenticate)
    // usually it's GET/POST to /api/authenticate with token and Authorization headers
    const response = await axios.post(`${baseUrl}/api/authenticate`, {}, {
      headers: {
        'Authorization': `Bearer ${tokenBuffer}`, // or Basic, we'll try Basic if Bearer fails
        'token': xToken,
        'appkey': clientId,
        'Content-Type': 'application/json'
      }
    });

    console.log('SUCCESS!');
    console.log(response.data);
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
