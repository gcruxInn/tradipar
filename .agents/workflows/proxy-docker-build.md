---
description: Deploy ou atualização de módulos de orquestração via Node Proxy (Docker)
---

# Deploy do AWS Server Alef (Protocolo Proxy)

Ao editar o middleware Node.js, não jogue diretamente às escuras. O processo de publicação deve ser auditado.

// turbo
1. Verifique a sintaxe fatal subjacente do index:
```bash
cd aws-server-alef && node -c index.js
```

2. Requisite ao usuário as chaves ou autorizações pre-deploy via SSH para o ambiente online do servidor dedicado `~/htdocs/api.gcrux.com/aws-server-alef/`.

3. Prepare os comandos de Rsync ou `scp` instruindo para cópia somente dos arquivos necessários.

4. (Servidor Alef) Suba o cluster do Proxy forçando build.
```bash
sudo docker compose up -d --build
```
