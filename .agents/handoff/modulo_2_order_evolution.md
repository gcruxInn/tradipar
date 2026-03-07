# HANDOFF: Projeto Tradipar - Módulo 2 (Sankhya-HubSpot PDF & Order Evolution)

> **ESTADO DO PROJETO:** O **Módulo 1 (Refatoração de Orçamento)** foi concluído com sucesso. Implementamos a nova `tradipar-core-api` (v2.0) com TypeScript, OAuth2 Sankhya e orquestração de anexos. 

## 🎯 Conquistas da Última Sessão (Fase 15)
- **Fix PDF Upload:** O erro de `FileItem` foi resolvido definitivamente. O segredo é usar `sessionkey=ANEXO_SISTEMA_CabecalhoNota_${nunota}`, `fitem=S` e forçar o `Content-Length` no header do Multipart.
- **Auto-Attach HubSpot:** O sistema agora gera o PDF no Sankhya e o anexa automaticamente como uma `Note` com arquivo no Deal do HubSpot no momento da confirmação.
- **Framework Moderno:** Migração completa da `tradipar-core-api` para o servidor Oracle Cloud via Docker + Volumes (Hot-Reload de `dist/`).
- **Guidelines Atualizadas:** `CLAUDE.md`, READMEs e Skills dos agentes foram resetados para a nova arquitetura v2.0.

## 🚀 Próximos Desafios (Sessão Atual)

### 1. Evolução do Orçamento para Pedido (TOP 1010)
- **Status:** A confirmação do Orçamento (TOP 1) está funcionando, mas ela não está evoluindo automaticamente para um Pedido (TOP 1010). 
- **Tarefa:** Investigar se a `CACSP.confirmarNota` precisa de parâmetros adicionais ou se existe uma trigger/ação necessária no Sankhya para disparar a geração da nota vinculada (Pedido).
- **Endpoint:** Verificar `order.controller.ts` -> `confirmOrder`.

### 2. Sincronização de Nro. Único de Pedido
- **Tarefa:** Assim que o pedido (TOP 1010) for gerado, capturar o novo `NUNOTA` e atualizar o HubSpot no campo personalizado `sankhya_nu_unico_pedido` (ou similar). 
- **Persistência:** Garantir que o PDF gerado para o pedido também suba para o HubSpot se for diferente do orçamento.

### 3. Checklist de Saúde do Ecossistema
- [ ] O backend compila via `npm run build` dentro de `tradipar-core-api`?
- [ ] O `rsync` foi executado para o IP `137.131.243.179`?
- [ ] O container `core-api-sankhya` está ONLINE e logando comunicações com o Gateway?

## 📂 Contexto Tecnológico
- **Repos:** `/home/rochagabriel/dev/tradipar/tradipar-core-api`
- **Sankhya SDK:** Gateway v1 Multi-Item.
- **HubSpot SDK:** CRM API (Notes & Files).
- **Skill de Apoio:** `tradipar-core-api-dev` (Protocolo Peace v2.0).

---
*Assinado: Claude Sonnet 3.7 (Agente Atual)*
Co-Authored-By: Claude Sonnet 3.7 <noreply@anthropic.com>
