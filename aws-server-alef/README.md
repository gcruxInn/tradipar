# API Preços Sankhya (AWS Proxy)

Servidor de proxy resiliente para integrar o HubSpot UI Extension com o Sankhya ERP em tempo real.

## 🚀 Deploy

**Servidor:** AWS Lightsail (`api.gcrux.com`)  
**IP:** 98.92.46.144  
**Process Manager:** PM2 (Executando via `index.js`)

## 📡 Endpoints Principais

### 1. Consulta de Preços (Deal Context)
Busca associações de Empresa e Item de Linha para calcular o preço dinâmico.
- **URL:** `POST /hubspot/prices/deal`
- **Body:** `{ "objectId": 123456 }`
- **Response:**
  ```json
  {
    "status": "SUCCESS",
    "prices": { "pv1": 3.54, "pv2": 3.32, "pv3": 3.12 },
    "currentAmount": "300.00"
  }
  ```

### 2. Atualização de Valor (Write-back)
Atualiza a propriedade `amount` do Negócio no HubSpot.
- **URL:** `POST /hubspot/update/deal`
- **Body:** `{ "objectId": 123456, "amount": 3.32 }`

### 3. Consulta Genérica (Legacy/Generic)
- **URL:** `POST /precos`
- **Body:** `{ "codProd": 80, "codParc": 262, "codEmp": 1 }`

## 🛡️ Resiliência & Self-Healing

O servidor implementa lógica de **Auto-Recovery**:
- **Gateway 401**: Se o token do gateway expira, ele é renovado automaticamente.
- **Sankhya Status 3**: Se a sessão interna do Sankhya expira ("Não autorizado"), o servidor detecta o status 3, invalida o token e tenta novamente com uma nova sessão.

## 🔧 Manutenção

```bash
# Acesso SSH
ssh -i ~/.ssh/LightsailDefaultKey-us-east-1.pem ubuntu@98.92.46.144

# PM2 (Diretório ~/api-precos-sankhya)
pm2 logs 0                 # Ver logs em tempo real
pm2 restart 0 --update-env # Reiniciar com novas variáveis de ambiente
```

## 📁 Estrutura

- `index.js`: Lógica principal de rotas e busca de associações HubSpot.
- `sankhyaAuth.js`: Gerenciamento de tokens e sessões Sankhya.
- `.env`: Configurado com `SANKHYA_BASE_URL` e `HUBSPOT_ACCESS_TOKEN`.
