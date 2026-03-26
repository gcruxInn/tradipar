# 🚀 Backend Deployment Guide

O backend foi compilado com sucesso. Agora precisa ser deployado para `api.gcrux.com`.

## Status Atual

✅ **Código compilado localmente:** `/home/rochagabriel/dev/tradipar/tradipar-core-api/dist/`
❌ **Servidor remoto:** Ainda com versão antiga (sem novos endpoints)

## Opção 1: Deploy via SSH (Recomendado)

Se você tem acesso SSH ao servidor onde roda `api.gcrux.com`:

```bash
#!/bin/bash
# Conectar ao servidor
ssh user@server-host

# Dentro do servidor, no diretório da aplicação:
cd /caminho/para/tradipar-core-api

# Sincronizar arquivos do seu WSL (execute em outro terminal no WSL):
rsync -avz --exclude 'node_modules' --exclude '.git' \
  /home/rochagabriel/dev/tradipar/tradipar-core-api/dist/ \
  user@server-host:/caminho/para/tradipar-core-api/dist/

# Reiniciar o container
docker compose restart core-api

# Verificar se está rodando
docker compose logs -f core-api
```

## Opção 2: Deploy via rsync direto (Shell Script)

Salve como `deploy.sh` e execute:

```bash
#!/bin/bash
set -e

echo "📦 Building backend..."
cd /home/rochagabriel/dev/tradipar/tradipar-core-api
npm run build

echo "🚀 Syncing to remote server..."
rsync -avz --exclude 'node_modules' --exclude '.git' \
  ./dist/ \
  user@api.gcrux.com:/app/dist/

echo "🔄 Restarting container on remote..."
ssh user@api.gcrux.com 'cd /app && docker compose restart core-api'

echo "✅ Deployment complete!"

# Verify
echo "🔍 Testing new endpoints..."
sleep 2
curl -s https://api.gcrux.com/hubspot/property-options/rota_de_entrega_1 | head -20
```

## Opção 3: Local Docker Testing (Se houver Docker no WSL)

Se você tiver Docker instalado localmente:

```bash
cd /home/rochagabriel/dev/tradipar/tradipar-core-api

# Build local image
docker build -t tradipar-core-api:latest .

# Run container locally
docker run -d -p 3005:3000 \
  --env-file .env \
  --name core-api-local \
  tradipar-core-api:latest

# Test
curl http://localhost:3005/hubspot/property-options/rota_de_entrega_1

# View logs
docker logs -f core-api-local

# Stop
docker stop core-api-local
docker rm core-api-local
```

## Verificação Após Deploy

Depois que o deploy for realizado, execute estes testes:

```bash
# 1. Health check
curl https://api.gcrux.com/health

# 2. Test property options endpoint
curl https://api.gcrux.com/hubspot/property-options/rota_de_entrega_1

# 3. Test discovery endpoint
curl https://api.gcrux.com/sankhya/discovery/delivery-routes

# 4. Check HubSpot card logs (deve mostrar opções sendo carregadas)
# Abra a UI do HubSpot e verifique o console do navegador
```

## Expected Results After Deploy

✅ **Property options endpoint responds with:**
```json
{
  "success": true,
  "options": [
    { "label": "Rota 1", "value": "opt1" },
    { "label": "Rota 2", "value": "opt2" }
  ]
}
```

✅ **Card shows dropdowns populated** with actual rota options from HubSpot

✅ **Both rota fields** (Rota 1 obrigatória, Rota 2 opcional) appear on same line

## Problemas Comuns

| Problema | Solução |
|----------|---------|
| `rsync: command not found` | Instale rsync: `apt-get install rsync` |
| `SSH connection refused` | Verifique host/user, ou use VPN se necessário |
| `Permission denied` | Verifique permissões SSH e acesso ao diretório `/app/` |
| `docker compose restart` falha | Verifique se container está rodando com `docker ps` |

---

**Proximos Passos:**
1. Execute um dos 3 métodos de deploy acima
2. Aguarde ~30s para o container reiniciar
3. Teste os endpoints com curl
4. Abra a UI HubSpot e verifique se as opções carregam

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
