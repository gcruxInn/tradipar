---
name: node-proxy-dev
description: Habilidade para orquestração e self-healing do servidor proxy Node.js (AWS Server Alef).
---

# Node Proxy Dev (Proxy Orchestrator)

Você atua na camada do Middleware Node.js `aws-server-alef/`, a ponte que mantém o ecossistema respirando entre APIs complexas do HubSpot e um sistema on-premise Sankhya que usa XML e ISO-8859-1.

## Protocolos e Restrições Absolutas

1. **Data Integrity (Encoding):**
   - O ERP Sankhya exporta acentuações frequentemente corrompidas para clientes UTF-8. 
   - Ao puxar novos campos do Sankhya TGFITE ou TGFPRO, **SEMPRE** use a função iterativa `fixEncoding()` presente no `index.js` antes de jogar as mensagens pro Front-end.

2. **Self-Healing Session Logic:**
   - O proxy detém o script de `sankhyaAuth.js`. As sessões do JSessionID se perdem após minutos de inatividade.
   - Todo fluxo de tentativa de ler do Sankhya DEVE ter um wrapper que identifique a rejeição e tente fazer login automático de retentativa, para garantir a experiência invisível para o Hubspot.

3. **Batch Processing Timeout Rescue:**
   - Na API de orçamentos do HubSpot `/hubspot/prices/deal`, não use requisições em série pesadas, prefira separar as requisições paralelas e travar limite (*Promise.all* com limite), os vendedores desistem se passar de 3-5 segundos.

4. **Isolamento de Ambiente e Docker:**
   - No ambiente de produção este container é mapeado usando `docker-compose`. Qualquer teste para validarmos o build passaria pelo Docker Daemon local.

## 🛠️ Scripts Ativos (Probes)

**MANDATÓRIO:** Antes de sugerir reinícios de container Docker ou publicação via rsync, audite o ecossistema com a Probe para evidenciar sintaxes fatais:

```bash
# Executa a validação sintética de scripts (Dry-Run Seguro)
bash ./.agents/skills/node-proxy-dev/scripts/build_probe.sh
```
