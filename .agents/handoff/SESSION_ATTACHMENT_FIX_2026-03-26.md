# SESSION: HubSpot Attachment Binary Download Fix
**Data:** 2026-03-26 / 2026-03-27
**Status:** CONCLUIDO
**Commits:** `aae162a`

---

## PROBLEMA

Ao clicar "Preparar Pedido" no card HubSpot, o sistema baixava o arquivo anexado ao Deal (ex: `shoptixes.png`) e re-upava como PUBLIC_NOT_INDEXABLE para gerar uma URL pública acessivel pelo Sankhya (TSIATA LINK).

**O arquivo estava sendo corrompido:**
- Original: 20.632 bytes, encoding: "png", md5: `cdabc92...`
- Re-upload: 22.140 bytes, encoding: "html", md5: `0bdcb95...`
- O HubSpot detectava o conteudo como HTML, nao como PNG

---

## ROOT CAUSE (3 tentativas ate acertar)

### Tentativa 1: axios puro com redirect manual
- `hubspotApi.get(signedUrl, { maxRedirects: 0 })` para capturar redirect
- `axios.get(redirectUrl, { responseType: 'arraybuffer' })` para baixar binario
- **Falhou:** A signed-url-redirect redirecionava para `https://app.hubspot.com/login?loginRedirectUrl=...` (pagina de login HTML)

### Tentativa 2: hubspotApi com Content-Type limpo
- `hubspotApi.get(signedUrl, { responseType: 'arraybuffer', headers: { 'Content-Type': '', Accept: '*/*' } })`
- **Falhou:** O HubSpot retornou 400 Bad Request por causa do Content-Type vazio

### Tentativa 3 (CORRETA): /files/v3/files/{id}/signed-url
- `hubspotApi.get('/files/v3/files/${fileId}/signed-url')` retorna JSON com URL do CDN
- `axios.get(cdnUrl, { responseType: 'arraybuffer' })` baixa o binario puro do CDN (sem auth)
- **Funcionou:** Buffer com magic bytes PNG `[137,80,78,71,13,10,26,10]`, arquivo intacto

**Causa raiz detalhada:**
O endpoint `signed-url-redirect` (v2 FileManager API) faz um 302 redirect. O `hubspotApi` (axios com interceptor) envia `Authorization: Bearer` + `Content-Type: application/json` no redirect, e o CDN responde com HTML em vez de binario. O endpoint correto e `/files/v3/files/{id}/signed-url` (v3 Files API) que retorna a CDN URL como JSON, permitindo download limpo com axios puro.

---

## MUDANCAS APLICADAS

**Arquivo:** `tradipar-core-api/src/services/quote.service.ts`

### 1. Import axios puro (linha 1)
```typescript
import axios from 'axios';
```

### 2. Download em 2 etapas (linhas ~1145-1159)
```typescript
// Step 1: Obter CDN URL via Files API v3 (com auth)
const signedRes = await hubspotApi.get(`/files/v3/files/${fileId}/signed-url`);
const cdnUrl = signedRes.data?.url;

// Step 2: Baixar binario do CDN (sem auth, axios puro)
const fileContent = await axios.get(cdnUrl, {
  responseType: 'arraybuffer',
  timeout: 30000,
  headers: { Accept: '*/*' }
});
const fileBuffer = Buffer.from(fileContent.data);
```

### 3. MIME type explicito no upload (linhas ~1166-1168)
```typescript
const mimeMap = { png: 'image/png', jpg: 'image/jpeg', pdf: 'application/pdf', ... };
const contentType = mimeMap[ext.toLowerCase()] || 'application/octet-stream';
formData.append('file', fileBuffer, { filename: uploadName, contentType, knownLength: fileBuffer.length });
```

---

## RESULTADO VALIDADO

```
[PREPARE ORDER] Got signed CDN URL: https://cdn2.hubspot.net/...
[PREPARE ORDER] Downloaded buffer: 20632 bytes, first bytes: [137,80,78,71,13,10,26,10]
[PREPARE ORDER] Re-upload: encoding: "png", access: "PUBLIC_NOT_INDEXABLE"
```

URL publica funcional: `https://50655884.fs1.hubspotusercontent-na1.net/hubfs/50655884/sankhya-attachments/shoptixes.png`

---

## LICAO APRENDIDA

| API Endpoint | Comportamento | Uso Correto |
|---|---|---|
| `/filemanager/api/v2/files/{id}/signed-url-redirect` | 302 redirect (quebra com auth headers) | NAO USAR para download programatico |
| `/files/v3/files/{id}/signed-url` | JSON `{ url: "cdn..." }` | USAR: obter URL, baixar com axios puro |
| `/files/v3/files/{id}` | Metadata (name, size, access) | USAR: verificar estado do arquivo |

---

Co-Authored-By: Claude Sonnet 3.7 <noreply@anthropic.com>
