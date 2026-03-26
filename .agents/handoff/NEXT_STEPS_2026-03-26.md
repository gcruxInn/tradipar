# 📋 PRÓXIMOS PASSOS - TRADIPAR ECOSYSTEM
**Data:** 2026-03-26
**Status:** Phase 40 Completo → Preparação Phase 41
**Context:** Padrão de Inicialização de Propriedades das TOPs (TOP-999 → 1010 → 1100)

---

## 🎯 ACHADO CRÍTICO: Padrão de Inicialização de Propriedades

### Observação do Deal 58332228456
**Timeline:**
1. **TOP 999 (Orçamento) - CRIADO**
   - orcamento_sankhya = 461974 ✅
   - sankhya_nunota = **"0"** (inicialmente)
   - sankhya_nunota = "159537" (após confirmação) ✅

2. **TOP 1010 (Pedido) - CRIADO**
   - sankhya_nu_unico_pedido = 461976 ✅
   - sankhya_nu_nota_pedido = **461976** ❌ INCORRETO
   - sankhya_nu_nota_pedido deveria = **"0"** (inicialmente)
   - sankhya_nu_nota_pedido = correto (após evolução para 1100)

3. **TOP 1100 (NF-e) - PRÓXIMO**
   - sankhya_nu_unico_nfe = número (inicialmente)
   - sankhya_nu_unico_nfe = **"0"** (inicialmente - PADRÃO)
   - sankhya_nu_unico_nfe = correto (após emissão)

---

## 🔍 PADRÃO IDENTIFICADO

O Sankhya segue um padrão consistente de inicialização:

| TOP | Propriedade Criação | Propriedade Número | Status Inicial | Status Final |
|-----|---------------------|-------------------|---|---|
| **999** | `orcamento_sankhya` | `sankhya_nunota` | "0" | número_real |
| **1010** | `sankhya_nu_unico_pedido` | `sankhya_nu_nota_pedido` | **"0"** | número_real |
| **1100** | `sankhya_nu_unico_nfe` | (não existe) | - | - |

**Regra:** Quando uma TOP é criada, a propriedade "número" deve ser inicializada com **"0"**, não com o número gerado.

---

## ⚠️ PROBLEMA ATUAL

**Código em `order.service.ts` (linha ~200):**
```typescript
// INCORRETO - preenche ambas simultaneamente
await hubspotApi.updateDeal(dealId, {
  dealtype: "1010",
  sankhya_nu_unico_pedido: "461976",    // Criação ✅
  sankhya_nu_nota_pedido: "461976"      // Deveria ser "0" ❌
});
```

**Comportamento Esperado:**
```typescript
// CORRETO - inicializa com 0
await hubspotApi.updateDeal(dealId, {
  dealtype: "1010",
  sankhya_nu_unico_pedido: "461976",    // Número criado
  sankhya_nu_nota_pedido: "0"           // Inicializado em 0
});
```

---

## 📋 TAREFAS PARA IMPLEMENTAÇÃO

### Task 1: Corrigir Inicialização de TOP 1010
**Arquivo:** `tradipar-core-api/src/services/order.service.ts`
**Função:** `billOrder()` ou método de evolução

**Mudanças Necessárias:**
```typescript
// Quando criar TOP 1010
const updateProps = {
  dealtype: "1010",
  sankhya_nu_unico_pedido: nuNota.toString(),  // Número gerado
  sankhya_nu_nota_pedido: "0"                   // Inicializar em 0
};

await hubspotApi.updateDeal(dealId, updateProps);
```

**Status:** 🔴 PENDENTE

### Task 2: Corrigir Inicialização de TOP 999
**Arquivo:** `tradipar-core-api/src/services/quote.service.ts`
**Função:** `createQuote()`

**Verificar:** Se está inicializando `sankhya_nunota` com "0" ou direto com número

**Status:** 🟡 VERIFICAR

### Task 3: Adicionar Logging para Rastreamento
**Arquivo:** `order.service.ts`

**Adicionar:**
```typescript
console.log(`[ORDER-BILLING] TOP 1010 Created:
  - sankhya_nu_unico_pedido = ${nuNota}
  - sankhya_nu_nota_pedido = 0 (initialized)
  - dealstage = presentationscheduled
`);
```

**Status:** 🔴 PENDENTE

### Task 4: Documentar Padrão em CLAUDE.md
**Arquivo:** `CLAUDE.md`

**Adicionar Seção:**
```markdown
## 📊 Padrão de Inicialização de Propriedades (TOPs)

Todas as TOPs seguem o mesmo padrão:
1. Criação → Propriedade de criação recebe número
2. Inicialização → Propriedade de número recebe "0"
3. Confirmação/Evolução → Propriedade de número recebe número real

**Exemplo (TOP 1010):**
- Criar: sankhya_nu_unico_pedido = 461976
- Inicializar: sankhya_nu_nota_pedido = "0"
- Confirmar: sankhya_nu_nota_pedido = 461976 (após processamento)
```

**Status:** 🔴 PENDENTE

---

## 🚀 ROADMAP PHASE 41 & BEYOND

### Phase 41: TOP 1010 Evolution & Refinement (1-2 sprints)
**Objetivo:** Completar o ciclo TOP 999 → 1010 → 1100

| Task | Prioridade | Esforço | Status |
|------|-----------|--------|--------|
| Corrigir inicialização sankhya_nu_nota_pedido | 🔴 CRÍTICA | 1h | PENDENTE |
| Adicionar logging de evolução | 🟡 ALTA | 30m | PENDENTE |
| Testar ciclo completo 999→1010→1100 | 🟡 ALTA | 2h | PENDENTE |
| Documentar padrão de evolução | 🟢 MÉDIA | 30m | PENDENTE |

### Phase 42: NF-e Emission & TOP 1100 (2-3 sprints)
**Objetivo:** Emitir NF-e e completar ciclo de faturamento

**Funcionalidades:**
- [ ] billOrder → TOP 1100 (invoice)
- [ ] Auto-emit NF-e (nota fiscal eletrônica)
- [ ] PDF attachment (DANFE + NF-e XML)
- [ ] dealstage → closedwon (automático)
- [ ] Sync properties: sankhya_nu_unico_nfe, nuNfe

### Phase 43: Profitability Gates & Approval Workflows (2-3 sprints)
**Objetivo:** Implementar gates de rentabilidade e workflows de aprovação

**Funcionalidades:**
- [ ] Auto-reject se rentabilidade < threshold
- [ ] Manager approval workflow
- [ ] Risk scoring
- [ ] Margin alerts

### Phase 44: Reporting & Analytics (2-3 sprints)
**Objetivo:** Dashboard de visibilidade de deals

**Funcionalidades:**
- [ ] Deal pipeline analytics
- [ ] TOP status dashboard
- [ ] Profitability heatmap
- [ ] Export reports

---

## 🎯 ESTADO ATUAL (2026-03-26)

### ✅ COMPLETO
- [x] TOP 999 Creation ✅
- [x] TOP 999 Confirmation ✅
- [x] Auto-Healing PDF ✅
- [x] Profitability Calculation ✅
- [x] TOP 1010 Evolution ✅
- [x] Card UX & Transitions ✅
- [x] Error Handling & Retry ✅

### 🟡 PARCIALMENTE COMPLETO
- [ ] TOP 1010 Initialization (sankhya_nu_nota_pedido = 0)
- [ ] Logging Standardization
- [ ] Full Cycle Testing (999→1010→1100)

### 🔴 NÃO INICIADO
- [ ] TOP 1100 Implementation
- [ ] NF-e Auto-Emission
- [ ] Approval Workflows
- [ ] Analytics Dashboard

---

## 📊 DESCOBERTAS IMPORTANTES

### Discovery 1: Property Initialization Pattern
**O Sankhya usa um padrão consistente de inicialização:**
- Propriedade de **criação** recebe o número gerado imediatamente
- Propriedade de **número** começa em "0"
- Propriedade de **número** é atualizada apenas após confirmação/evolução

**Implicação:** Devemos sempre inicializar com "0" para respeitar o padrão.

### Discovery 2: Deal Lifecycle Is Continuous
**O Deal não termina em TOP 999:**
- TOP 999 (Orçamento) → Confirmação
- TOP 1010 (Pedido) → Evolução
- TOP 1100 (NF-e) → Emissão
- closedwon (Final)

**Implicação:** Cada stage tem seu próprio ciclo de confirmação.

### Discovery 3: PDF Attachment Timing
**PDFs devem ser anexados EM CADA EVOLUÇÃO:**
- TOP 999 PDF (Orçamento) → após confirmação
- TOP 1010 PDF (Pedido) → após evolução para 1010
- DANFE (NF-e) → após emissão

**Implicação:** Sistema de auto-healing PDF funciona em cascata.

---

## 🔐 PADRÕES A MANTER

### 1. Property Initialization
Sempre inicializar propriedades "número" com "0" quando criar uma TOP.

### 2. HTTP 200 Status
Manter compatibilidade com HubSpot proxy (200 status mesmo em erros).

### 3. Auto-Healing
Implementar auto-healing para PDFs em cada estágio.

### 4. Logging
Logar transições de stage para rastreabilidade.

---

## 📝 COMMITS PRÓXIMOS

**Esperado para próxima sessão:**
```
fix: correct sankhya_nu_nota_pedido initialization to "0" for TOP 1010

- sankhya_nu_nota_pedido now initialized as "0" when TOP 1010 created
- Matches Sankhya standard pattern for property initialization
- Aligns with TOP 999 and future TOP 1100 behavior
- Fixes Deal 58332228456 historical data (manual correction needed)

Files:
- tradipar-core-api/src/services/order.service.ts
- CLAUDE.md (pattern documentation)
```

---

## ✅ VALIDAÇÃO CHECKLIST

- [ ] Verify sankhya_nu_nota_pedido initialization pattern
- [ ] Test TOP 999 → 1010 evolution
- [ ] Confirm PDF attachments at each stage
- [ ] Validate HubSpot property sync
- [ ] Check Sankhya audit trail
- [ ] Review browser console for errors
- [ ] Monitor API logs for warnings
- [ ] Validate profitability calculations

---

## 📚 REFERÊNCIAS

**Documentos Relacionados:**
- AUDIT_PLAN_2026-03-26.md — Auditoria completa Phase 40
- BACKLOG_2026-03-13.md — Requisitos Sprint 1-3
- SESSION_SANKHYA_NUNOTA_RECOVERY_2026-03-26.md — Phase 40 Debug
- CLAUDE.md — Diretrizes de Arquitetura

**Deal de Referência:**
- Deal ID: 58332228456
- Deal Name: POSTO GT 3
- TOP 999: 461974
- TOP 1010: 461976
- Status: presentationscheduled (aguardando próximas ações)

---

## 📌 RESUMO EXECUTIVO

**O sistema está funcionando bem, mas com um detalhe importante:**

Ao criar TOP 1010, devemos inicializar `sankhya_nu_nota_pedido` com "0" (não com o número), seguindo o padrão que o Sankhya usa para todas as TOPs:

1. **TOP 999:** sankhya_nunota inicia "0" → após confirmação recebe número
2. **TOP 1010:** sankhya_nu_nota_pedido deve iniciar "0" → após evolução recebe número
3. **TOP 1100:** sankhya_nu_unico_nfe deve iniciar "0" → após emissão recebe número

**Próxima Ação:** Corrigir `order.service.ts` para respeitar esse padrão.

---

**Status Geral:** 🟢 Sistema Operacional | 🟡 Detalhe de Inicialização Pendente | 🚀 Pronto para Phase 41
