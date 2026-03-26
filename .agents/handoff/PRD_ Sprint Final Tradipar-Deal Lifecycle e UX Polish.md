# 📄 Documento de Requisitos de Produto (PRD): Sprint Final Tradipar - Deal Lifecycle & UX Polish

**Autor:** Manus AI (Orquestrador Antigravity)
**Data:** 19 de Março de 2026
**Versão:** 5.0 (AI-Driven Framework Optimized)

***

## 1. Introdução

Este Documento de Requisitos de Produto (PRD) detalha os objetivos e o escopo da sprint final do projeto Tradipar, focando na consolidação da integração bidirecional entre HubSpot e Sankhya. Esta versão 5.0 foi otimizada para utilizar o **Framework de Agentes Antigravity** localizado em `.agents/` [13], integrando as `skills` de desenvolvimento de UI, API e Integração Java, além de seguir os protocolos de `handoff` e `workflows` estabelecidos no repositório.

### 1.1. Visão Geral e Objetivos da Sprint

O objetivo central é finalizar o *Deal Lifecycle* (TOP 999 ➔ 1010 ➔ 1100) utilizando a **Tradipar Core API v2.0** (Node.js/TypeScript) [13]. O sistema deve operar sob os princípios de **Autonomic Computing**, garantindo que a infraestrutura e a lógica de negócio sejam autogerenciáveis, resilientes e otimizadas para alta performance, eliminando a manutenção técnica diária.

### 1.2. Framework de Inteligência Artificial (.agents)

O desenvolvimento deve ser orquestrado utilizando as ferramentas nativas do repositório:
*   **Skills:** Utilizar `hubspot-ui-dev` para extensões de UI e `tradipar-core-api-dev` para o backend [13].
*   **Workflows:** Seguir rigorosamente os fluxos de deploy em `core-api-deploy.md` e `hs-deploy.md` [13].
*   **Handoff:** Consultar o `REFACTORING_MASTER_PLAN.md` e os módulos de sincronização de lifecycle para manter a continuidade do projeto [13].

***

## 2. Escopo de Funcionalidades (Épicos)

### 🔴 Épico 1: Desbloqueio da Criação de Orçamento (TOP 999 sem Itens)

*   **Lógica de Cabeçalho (TGFCAB):** Utilizar a `skill` `node-proxy-dev` para implementar a criação exclusiva de cabeçalho via `orcamentoService.generateHeader`.
*   **Self-healing:** Implementar o padrão de compensação detalhado no `REFACTORING_MASTER_PLAN.md`. Se a gravação do `NUNOTA` no HubSpot falhar, o sistema deve enfileirar a retentativa ou realizar o *rollback* no Sankhya via `CACSP.excluirNota`.

### 🔵 Épico 2: UX de Sincronização na "Gestão de Itens"

*   **Optimistic UI + Debounce:** Implementar conforme o `README.md` do repositório, utilizando `useRef` para evitar loops de renderização.
*   **Self-protection (Cleanup):** O componente `PrecosCard.tsx` deve garantir o *Auto-Save* no desmontagem, conforme as diretrizes da `skill` `hubspot-ui-dev`.

### 🟢 Épico 3: Deal Lifecycle (Confirmação e Faturamento)

*   **Evolução TOP 1010 ➔ 1100:** Utilizar a orquestração de serviços `SalesCentralSP.faturarNota` e `CACSP.faturarNota` mapeada na `skill` `tradipar-core-api-dev`.
*   **Error Parser Inteligente:** Implementar a camada de tradução de erros de banco (triggers/procedures) para mensagens amigáveis no HubSpot `<Alert>`, conforme o mindset de "Construção Blindada" do framework.
*   **Closed-Loop (Anexo de DANFE):** Utilizar o `PDF Attachment Engine` da Core API v2.0 para gerar e anexar automaticamente o PDF no HubSpot Deal após o faturamento.

***

## 3. Diretrizes de Implementação e Framework

1.  **Sankhya Gateway OAuth2:** O sistema deve utilizar o gerenciamento automático de tokens M2M implementado em `sankhya.api.ts` [21].
2.  **Protocolo de Upload:** Seguir o `File Storage Fix` (multipart/form-data) para garantir que os anexos de DANFE não falhem.
3.  **Self-configuration:** A infraestrutura em Oracle Cloud (Docker) deve se autoconfigurar conforme o workflow `proxy-docker-build.md`.
4.  **Handoff e Memória:** O ClaudeCode deve atualizar o `BACKLOG_2026-03-13.md` na pasta `.agents/handoff` ao concluir cada etapa da Phase 40.

***

## 4. Referências

[13] [https://github.com/gcruxInn/tradipar] - Repositório GitHub e Framework `.agents`
[17] [https://github.com/gcruxInn/tradipar/blob/main/tradipar-core-api/src/services/quote.service.ts] - Lógica de Faturamento e PDF Engine
[19] [https://github.com/gcruxInn/tradipar/blob/main/sankhya-integration-innleaders/src/app/cards/PrecosCard.tsx] - UI Extension e Optimistic UI
[21] [https://github.com/gcruxInn/tradipar/blob/main/tradipar-core-api/src/adapters/sankhya.api.ts] - Sankhya Gateway OAuth2
[22] [Pasted_content.txt] - Master Prompt e Princípios de Autonomic Computing
