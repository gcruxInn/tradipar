# 🚀 Guia de Execução Técnica: Finalização do Ecossistema Tradipar (Framework .agents Optimized)

Este guia fornece o passo a passo auditado e definitivo para que o **ClaudeCode** execute a refatoração final do **Deal Lifecycle** (Phase 40), maximizando o uso das `skills` e `workflows` do diretório `.agents/`.

***

## 1. Auditoria e Framework Antigravity (.agents)

O repositório `gcruxInn/tradipar` utiliza um framework de agentes especializado para orquestrar o ecossistema. Antes de iniciar qualquer modificação, o ClaudeCode deve consultar as seguintes ferramentas:

### 📂 Diretório `.agents/`
- **Skills:** `hubspot-ui-dev` (UI), `node-proxy-dev` (Backend), `tradipar-core-api-dev` (Core API).
- **Workflows:** `core-api-deploy.md`, `hs-deploy.md`, `proxy-docker-build.md`.
- **Handoff:** `REFACTORING_MASTER_PLAN.md` (Plano mestre de refatoração).

***

## 2. Roteiro de Execução Técnica (Passo a Passo)

### 🛠️ Passo 1: Implementação de Resiliência (Self-healing)
**Arquivos:** `tradipar-core-api/src/adapters/sankhya.api.ts` e `tradipar-core-api/src/services/quote.service.ts`

1.  **Interceptor de Sessão:** Implementar no `sankhya.api.ts` a renovação automática do `JSESSIONID` em caso de erro 401 ou sessão expirada.
2.  **Saga Pattern (Compensation):** No `quote.service.ts`, garantir que, se a gravação do `NUNOTA` no HubSpot falhar, o sistema enfileire uma retentativa automática ou desfaça a criação no Sankhya via `CACSP.excluirNota`, conforme o `REFACTORING_MASTER_PLAN.md`.

### 🛠️ Passo 2: Evolução de Orçamento para Pedido e Venda (TOP 1010 ➔ 1100)
**Arquivos:** `tradipar-core-api/src/controllers/order.controller.ts` e `tradipar-core-api/src/services/quote.service.ts`

1.  **Orquestração `billOrder`:** Implementar a evolução sequencial: `SalesCentralSP.faturarNota` ➔ `CACSP.faturarNota`.
2.  **Error Parser de Banco:** Criar a camada de tradução de erros de triggers/procedures do Sankhya para mensagens amigáveis no HubSpot CRM Card.

### 🛠️ Passo 3: Otimização de UI e Auto-Save (Self-protection)
**Arquivo:** `sankhya-integration-innleaders/src/app/cards/PrecosCard.tsx`

1.  **Optimistic UI + Debounce:** Utilizar `useRef` para implementar o *debounce* de 1500-2000ms na sincronização de itens.
2.  **Cleanup Hook:** Adicionar a lógica de *Auto-Save* no `useEffect` de desmontagem para garantir que nenhuma alteração seja perdida ao fechar o card.

### 🛠️ Passo 4: Automação de Anexo de DANFE (Closed-loop)
**Arquivo:** `tradipar-core-api/src/services/quote.service.ts`

1.  **PDF Attachment Engine:** Após o faturamento (TOP 1100), gerar o PDF da DANFE e realizar o upload automático para o HubSpot Deal utilizando o protocolo `multipart/form-data` corrigido.

***

## 3. Workflow de Deploy e Handoff

1.  **Deploy do Backend:** Seguir o workflow `core-api-deploy.md` para realizar o deploy via rsync para o servidor Oracle Cloud.
2.  **Upload do Projeto HubSpot:** Executar `hs project upload` no diretório da extensão de UI.
3.  **Handoff de Agente:** Atualizar o arquivo `BACKLOG_2026-03-13.md` na pasta `.agents/handoff` com o status das tarefas concluídas.

***

## 4. Comando de Inicialização para ClaudeCode

> "Claude, execute a refatoração final da Phase 40 baseada no `Tradipar_Guia_Execucao_ClaudeCode_Final_V2.md`. Utilize as skills de `.agents/skills` e siga os workflows de deploy em `.agents/workflows`. O objetivo é um sistema 'Set-and-forget' com 100% de resiliência transacional entre Sankhya e HubSpot."
