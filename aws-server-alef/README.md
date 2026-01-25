# API Preços Sankhya - HubSpot Proxy

Servidor intermediário (Proxy) que conecta o HubSpot CRM ao ERP Sankhya via DBExplorer.  
Esta API é responsável por resolver Preços (Tabelas PV1/PV2/PV3) e Estoque disponível para Múltiplos Itens de um Negócio.

## 🚀 Deploy com Docker (Recomendado)

Esta API foi containerizada para fácil deploy e segurança. Siga os passos abaixo para rodar em produção (ex: Oracle Cloud, AWS).

### 1. Preparação
Certifique-se de ter o Docker e Docker Compose instalados no servidor.

Copie os arquivos do projeto para o servidor (ex: via `scp` ou `git clone`).

### 2. Configuração Segura (.env)
**IMPORTANTE:** Nunca comite o arquivo `.env` com senhas reais no Git.

Crie um arquivo `.env` na raiz do projeto (no servidor) baseado no exemplo:

```bash
cp .env.example .env
nano .env
```

Preencha as variáveis com os dados de produção:
```ini
# Credenciais Sankhya Gateway
SANKHYA_CLIENT_ID=seu_client_id
SANKHYA_CLIENT_SECRET=seu_client_secret
SANKHYA_XTOKEN=seu_token_app

# URL Base
SANKHYA_BASE_URL=https://api.sankhya.com.br

# Porta (Interna do Container)
PORT=3000

# Permissão HubSpot
HUBSPOT_ACCESS_TOKEN=pat-na1-xxxxxxxx (Token de Private App)
```

### 3. Rodando o Serviço
Utilize o `docker-compose` para subir o container de forma segura, carregando as variáveis do arquivo `.env` local.

```bash
# Construir e rodar em background
sudo docker compose up -d --build

# Ver logs em tempo real
docker logs -f api-precos-sankhya
```

---

## 📡 Endpoints

### 1. Consulta de Preços e Estoque (Multi-Item)
Endpoint principal chamado pelo Card do HubSpot.
- **URL:** `POST /hubspot/prices/deal`
- **Body:** `{ "objectId": 123456 }`
- **Lógica:**
    1. Busca todos os Itens de Linha do Negócio.
    2. Identifica Parceiro (Company/Contact) e Empresa (Filial).
    3. Consulta Preço (PV1/2/3) e Estoque para cada item.
- **Response:**
  ```json
  {
    "status": "SUCCESS",
    "items": [
      {
        "id": "123",
        "name": "Produto X",
        "stock": 42,
        "stockContext": "Filial MG",
        "prices": { "pv1": 10.0, "pv2": 9.5, "pv3": 9.0 }
      }
    ],
    "currentAmount": "300.00",
    "stageLabel": "Negociação"
  }
  ```

### 2. Update de Valor (Write-back)
Atualiza o valor total (`amount`) do Negócio.
- **URL:** `POST /hubspot/update/deal`
- **Body:** `{ "objectId": 123456, "amount": 500.00 }`

### 3. Conversão em Pedido
Gatilho para mover o negócio de fase.
- **URL:** `POST /hubspot/convert-to-order`

---

## 🛠️ Desenvolvimento Local
Para rodar sem Docker (Node.js direto):

```bash
npm install
npm run dev # (Requer nodemon) ou node index.js
```
