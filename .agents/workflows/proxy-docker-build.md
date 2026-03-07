---
description: Deploy ou atualização de módulos de orquestração via Node Proxy (Docker)
---

# Deploy do AWS Server Alef (⚠️ LEGACY - VER core-api-deploy)

> [!CAUTION]
> Este workflow refere-se ao motor legado `aws-server-alef/`. 
> Para o novo framework `tradipar-core-api/`, utilize o workflow `/core-api-deploy.md`.

// turbo
1. Verifique a sintaxe fatal subjacente usando o roteamento rígido do WSL (conforme CLAUDE.md):
```bash
# Validação WSL nativa garantindo compatibilidade via caminho absoluto
cd /home/rochagabriel/dev/tradipar/aws-server-alef && node --check index.js
```

2. Sincronize o arquivo principal (.js) diretamente na pasta do servidor remoto:
*Importante:* Para o acesso SSH/SCP (`gcrux-api@137.131.243.179`), utilize a senha presente em `GCRUX_API_SSH` no arquivo root `.env` local.
```bash
# Sincroniza o core do servidor AWS
scp /home/rochagabriel/dev/tradipar/aws-server-alef/index.js gcrux-api@137.131.243.179:~/htdocs/api.gcrux.com/aws-server-alef/
```

3. Suba ou reinicie o cluster do Proxy forçando o rebuild do container:
```bash
ssh gcrux-api@137.131.243.179 "cd ~/htdocs/api.gcrux.com/aws-server-alef && docker compose up -d --build --force-recreate"
```

4. Acompanhe os logs da máquina remota para se certificar de que os endpoints REST estabilizaram e estão online:
```bash
ssh gcrux-api@137.131.243.179 "docker logs -f api-precos-sankhya"
```
