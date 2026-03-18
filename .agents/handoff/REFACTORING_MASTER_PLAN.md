# 🎯 PLANO MESTRE DE REFATORAÇÃO - TRADIPAR ECOSYSTEM

**Data:** 2026-03-18
**Status Atual:** 100/100 (Todas as Regras de Negócio e Gaps Arquiteturais Concluídos)
**Auditoria:** ✅ Completa

---

## 📊 RESUMO EXECUTIVO

### ✅ Módulos Implementados (Status)

| Módulo | Descrição | Status | Score |
|--------|-----------|--------|-------|
| **Módulo 1** | Quote Refactoring (TypeScript MVC) | ✅ 100% | 10/10 |
| **Módulo 2** | Order Evolution (TOP 1010 Pendente) | ✅ 100% | 10/10 |
| **Módulo 3** | Discovery & Lifecycle Sync | ✅ 100% | 10/10 |
| **Módulo 4** | Product Enrichment (Stock RT) | ✅ 100% | 10/10 |

**Score Geral:** 100/100

---

## 🟢 REGRAS DE NEGÓCIO E GAPS RESOLVIDOS

### Regra de Negócio: TOP 1010 Pendente (Confirmação Manual)
**Arquivo:** `tradipar-core-api/src/services/quote.service.ts`

**Definição:**
- ✅ O pedido (TOP 1010) é gerado corretamente no Sankhya ao confirmar um Orçamento (TOP 0) via HubSpot.
- 🔴 **Restrição Crítica:** O pedido **NÃO** deve ser confirmado automaticamente por código.
- ✅ **Motivo:** O vendedor precisa revisar manualmente dados de frete, rota, anexos (OS, prints de conversa) no Sankhya antes de gerar o faturamento (`NUMNOTA`) e evoluir para a TOP 1100.

**Status:** ✅ Implementado (Código de auto-confirmação removido para respeitar o fluxo humano).

---

### Gap: HubSpot Token Refresh (OAuth2)
**Arquivo:** `tradipar-core-api/src/adapters/hubspot.api.ts`

**Problema:**
- ✅ Antigo Token hardcoded removido.
- ✅ Implementado sistema de `getValidToken()` com auto-refresh usando `refresh_token`.
- 🔴 **Resultado:** A integração não expira mais a cada 6 hours.

**Status:** ✅ Concluído.

---

### Gap: Enriquecimento de Busca (Estoque Real-Time)
**Arquivo:** `catalog.service.ts` e `PrecosCard.tsx`

**Problema:**
- ✅ Busca de produtos no Card HubSpot agora exibe estoque da Matriz e Filial em tempo real.
- ✅ Query otimizada em lote (Bulk Query) para evitar latência.

**Status:** ✅ Concluído.

---

## 🟡 OPORTUNIDADES DE REFATORAÇÃO (DEBT TÉCNICO) - PRÓXIMOS PASSOS

### 1. UTF-8 Encoding Helper (Centralização)
**Arquivos:** `order.service.ts`, `sync.service.ts`, `catalog.service.ts`
- **Ação:** Mover `fixEncoding` duplicado para `src/utils/encoding.ts` e usar interceptores no Axios para automação.

### 2. Error Handling Unificado
- **Ação:** Substituir `try/catch` genéricos por classes de erro especializadas (`SankhyaError`, `HubSpotError`) com status codes apropriados.
