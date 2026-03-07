---
description: Deploy ou atualização do Framework Core API v2.0 (Node.js/TypeScript)
---

# Deploy do Tradipar Core API (v2.0)

Este workflow rege a publicação segura do novo motor de orquestração no servidor Oracle Cloud.

// turbo
1. Realize a compilação local e validação de sintaxe no WSL:
```bash
# Navega e compila o TypeScript
cd /home/rochagabriel/dev/tradipar/tradipar-core-api && npm run build
```

2. Valide se a build gerou o servidor corretamente:
```bash
node --check /home/rochagabriel/dev/tradipar/tradipar-core-api/dist/server.js
```

3. Sincronize os arquivos compilados e configurações para o servidor Oracle:
*Importante:* Utilize a senha presente em `GCRUX_API_SSH` no arquivo root `.env` local.
```bash
# Sincroniza via rsync (ignora node_modules por causa dos volumes no Docker)
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude '.env' /home/rochagabriel/dev/tradipar/tradipar-core-api/ gcrux-api@137.131.243.179:~/htdocs/api.gcrux.com/tradipar-core-api/
```

4. No servidor remoto, aplique as mudanças. 
*Nota:* Se houve alteração no `docker-compose.yml` ou `.env`, é necessário reiniciar o container.
```bash
# Reinício seguro para registrar volumes ou envs novos
ssh gcrux-api@137.131.243.179 "cd ~/htdocs/api.gcrux.com/tradipar-core-api && docker compose down && docker compose up -d"
```

5. Monitore os logs para garantir que a conexão com o Gateway Sankhya foi restabelecida:
```bash
ssh gcrux-api@137.131.243.179 "docker logs -f core-api-sankhya"
```

---
Co-Authored-By: Claude Sonnet 3.7 <noreply@anthropic.com>
