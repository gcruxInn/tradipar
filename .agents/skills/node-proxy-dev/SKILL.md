---
name: node-proxy-dev
description: Habilidade para orquestração e self-healing do servidor proxy Node.js (AWS Server Alef).
---

# Node Proxy Dev (Legacy Orchestrator - ⚠️ VER TRADIPAR-CORE-API)

> [!CAUTION]
> Esta habilidade refere-se ao motor legado `aws-server-alef/`. 
> A partir de Março/2026, novas implementações devem ser feitas exclusivamente no novo framework `tradipar-core-api/` utilizando a skill `tradipar-core-api-dev`.

Você atua na camada do Middleware Node.js `aws-server-alef/`, a ponte que mantém o ecossistema respirando entre APIs complexas do HubSpot e um sistema on-premise Sankhya que usa XML e ISO-8859-1.

## Protocolos e Restrições Absolutas

1. **Data Integrity & Vínculo Mestre:**
   - O ERP Sankhya usa ISO-8859-1. **SEMPRE** mantenha intacta e utilize a função `fixEncoding()` do `index.js` antes de jogar mensagens pro Front-end.
   - **Vínculo Mestre:** `orcamento_sankhya` é a fonte da verdade definitiva. `nunota` é tratado como um vínculo secundário ou metadado temporário.

2. **Self-Healing Session Logic:**
   - O proxy detém o script de `sankhyaAuth.js`. As sessões do JSessionID se perdem após minutos de inatividade.
   - Todo fluxo que lê do Sankhya DEVE ter um wrapper de try/catch que refaça o login automático de forma invisível para o Hubspot.

3. **Batch Processing Timeout Rescue:**
   - Use `Promise.all` com limites para evitar estrangulamento. Exclua diretórios pesados de buscas ativas (`node_modules`) para evitar timeouts de execução.

4. **Isolamento de Ambiente, Docker e Caminho WSL:**
   - Nunca use o caminho Windows literal `\\wsl.localhost\...` dentro das ferramentas MCP. Quando rodar testes sintáticos (como o Node check), use caminhos absolutos do WSL local: `wsl -d Ubuntu-22.04 sh -c "cd /home/rochagabriel/dev/tradipar && node --check aws-server-alef/index.js"`.

5. **Deploy Automatizado (AWS Server):**
   - O upload das edições deve ser feito usando `scp` da máquina local direto para o servidor `gcrux-api@137.131.243.179`.
   - Após a cópia, orquestre a reinicialização dos containers via ssh rodando `docker compose up -d --build --force-recreate` e monitore usando `docker logs -f api-precos-sankhya`.
   - A senha do servidor Alef encontra-se na variável local `GCRUX_API_SSH` no arquivo root `.env`.

## 🛠️ Scripts Ativos (Probes)

**MANDATÓRIO:** Antes de sugerir reinícios de container Docker ou publicação via rsync, audite o ecossistema com a Probe para evidenciar sintaxes fatais:

```bash
# Executa a validação sintética de scripts (Dry-Run Seguro)
bash ./.agents/skills/node-proxy-dev/scripts/build_probe.sh
```

## 🧠 Peculiaridades da API Sankhya (Sankhya API Quirks)

Identificamos comportamentos contra-intuitivos super essenciais na API de gravação de itens (`CACSP.incluirAlterarItemNota`). Para não cair em "Modo Zumbi" (Soft-Rollbacks) ou Erros de Chave Primária, siga estritamente o guia em anexo ao lidar com Inclusão (CREATE) vs Alteração (UPDATE):

- **[Documentação de Payload Quirks (SEQUENCIA e INFORMARPRECO)](./resources/sankhya-incluir-alterar-quirks.md)**
  _Lembre-se sempre de ler esse recurso antes de montar qualquer Payload envolvendo a tabela de Itens TGFITE!_

### Script Tester Mestre
Caso necessite testar os payloads num ambiente blindado que já monta as credenciais e chama os requests para debugar o auto-incremento da API, execute:
```bash
node ./.agents/skills/node-proxy-dev/scripts/test-sankhya-payload.js
```
