# API Preços Sankhya (AWS Server)

API Node.js para consulta de preços PV1/PV2/PV3 via função Sankhya `AD_PRECO_TRADIPAR`.

## 🚀 Deploy

**Servidor:** AWS Lightsail (Ubuntu 22.04)  
**IP:** 98.92.46.144  
**Porta:** 3000  
**Process Manager:** PM2

## 📡 Endpoint

**Produção (HTTPS):**
```
POST https://api.gcrux.com/precos
Content-Type: application/json

{
  "codProd": 8286,
  "codParc": 375,
  "codEmp": 1
}
```

**Response:**
```json
{
  "tabela1": 15.375,
  "tabela2": 14.686,
  "tabela3": 14.057
}
```

## ⚙️ Instalação Local

```bash
npm install
cp .env.example .env
# Editar .env com credenciais Sankhya
npm start
```

## 🔑 Acesso SSH

```bash
ssh -i ~/.ssh/LightsailDefaultKey-us-east-1.pem ubuntu@98.92.46.144
```

## 📁 Estrutura

```
├── index.js           # API Express
├── sankhyaAuth.js     # Auth Sankhya OAuth2
├── package.json       # Dependências
├── .env.example       # Template de variáveis
└── README.md
```

## 🔧 Comandos PM2

```bash
pm2 status                    # Ver status
pm2 logs api-precos-sankhya   # Ver logs
pm2 restart api-precos-sankhya # Reiniciar
```
