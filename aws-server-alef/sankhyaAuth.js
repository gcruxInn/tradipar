import axios from "axios";
import qs from "qs";

let cachedToken = null;
let tokenExpiresAt = 0;

function requireEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ausente: ${name}`);
  return v;
}

export async function getAccessToken() {
  const now = Date.now();

  if (cachedToken && now < tokenExpiresAt) {
    return cachedToken;
  }

  const baseUrl = requireEnv("SANKHYA_BASE_URL");
  const payload = qs.stringify({
    client_id: requireEnv("SANKHYA_CLIENT_ID"),
    client_secret: requireEnv("SANKHYA_CLIENT_SECRET"),
    grant_type: "client_credentials",
  });

  const resp = await axios.post(
    `${baseUrl}/authenticate`,
    payload,
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "X-Token": requireEnv("SANKHYA_XTOKEN"),
      },
      timeout: 15000,
    }
  );

  cachedToken = resp.data.access_token;

  // expira um pouco antes (margem de 30s)
  const expiresIn = Number(resp.data.expires_in || 0);
  tokenExpiresAt = now + (expiresIn * 1000) - 30000;

  return cachedToken;
}

export function invalidateToken() {
  cachedToken = null;
  tokenExpiresAt = 0;
}
