# Prompt de Deploy (Copie e cole na nova sessão)

---

Ative a Arquitetura de Agentes (Blueprint Tradipar) e proceda no Modo EXECUTION. Nosso objetivo agora é realizar o deploy seguro de todo o trabalho validado que construímos na sessão anterior. 
Você não deve codificar novas features nesta sessão. Seu foco deve ser estritamente orquestrar e seguir os **Workflows oficios** de Continuous Delivery que escrevemos no diretório `.agents/workflows/`.

## Objetivos e Ordem de Execução

1. **Validação e Deploy da UI (HubSpot)**
   - **Leia e siga estritamente:** o workflow `.agents/workflows/hs-deploy.md`.
   - Use a sua skill `hubspot-ui-dev` para sanar qualquer erro de lint (caso exista).
   - Realize as validações WSL e PowerShell explícitas.
   - Só efetue o `hs project upload` após ter o meu consentimento bloqueante (notify_user).

2. **Validação e Deploy do Framework Core (Node.js/Oracle Cloud)**
   - **Novo Engine (tradipar-core-api):** Deploy via `npm run build` local e `rsync` para o servidor (137.131.243.179).
   - **Docker Volumes:** O container `core-api-sankhya` agora usa volumes para ler `dist/` e `.env` instantaneamente. Use `docker compose down && docker compose up -d` para aplicar mudanças no YAML.
   - **PDF Fix:** Validar que o `Content-Length` e `fitem=S` estão ativos para evitar o erro de cast no Sankhya.

3. **Validação e Deploy do Proxy (Node.js/AWS)**
   - **Leia e siga estritamente:** o workflow `.agents/workflows/proxy-docker-build.md`.
   - Use a sua skill `node-proxy-dev` para auditar a sintaxe base (`node --check`) no ambiente WSL.
   - Uma vez limpo, orquestre a cópia segura (`rsync` ou `scp`) e reconstrução da imagem Docker no servidor Alef de produção conforme documentado. Me requisite chaves ou acessos se necessário na etapa 2 do workflow.

Mantenha-me atualizado a cada avanço através de mensagens `notify_user` informando qual workflow está rodando e detalhado os resultados das execuções (passes no lint, success no build_probe, etc).
