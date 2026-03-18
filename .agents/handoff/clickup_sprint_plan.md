# 💎 ROADMAP ESTRATÉGICO DE ENGENHARIA (PHASE 1-42+) — TRADIPAR ECOSYSTEM

> **Versão Master:** 18-03-2026 | **Auditado por:** Gabriel Rocha & IAs de ponta (Gemini e ClaudeCode)
> Hub de Gestão de Engenharia — Integração HubSpot ↔ Sankhya

---

## 📈 VISÃO GERAL DO PRODUTO

O Ecossistema Tradipar consolida a integração **HubSpot ↔ Sankhya** como um terminal de vendas de alta performance. O foco é a eliminação do retrabalho e visibilidade total do estoque e status financeiro sem sair do CRM.

**Meta Estratégica:**
> Automatizar 100% do ciclo comercial: da cotação no HubSpot até a Nota Fiscal (NFE/DANFE) emitida no Sankhya, com rastreabilidade e governança em cada etapa.

---

## ✅ FASES CONCLUÍDAS: O QUE JÁ ENTREGAMOS

---

### 🏗️ MÓDULO I — INFRAESTRUTURA & CONECTIVIDADE (Phases 1–9)
> **Status:** ✅ CONCLUÍDO | **Impacto:** Estabilidade da ponte e segurança enterprise.

| Phase | Entrega | Ambiente |
|-------|---------|---------|
| 1–4 | Setup de servidor, túneis Cloudflare, arquitetura de rede | DevOps |
| 5–7 | Conectividade M2M JSON/XML com Sankhya | Core API |
| 8–9 | OAuth2 HubSpot Bridge com `refresh_token` automático | Core API |

---

### 🔄 MÓDULO II — FLUXO TRANSACIONAL & AUTOMAÇÃO (Phases 10–11)
> **Status:** ✅ CONCLUÍDO | **Impacto:** Redução no tempo de emissão de orçamentos.

| Phase | Entrega | Ambiente |
|-------|---------|---------|
| 10 | Motor de `STATUSNOTA` e lógica SQL de orçamentos TOP 999 | Core API |
| 11 | Sync de cabeçalhos `TGFCAB` e observações de frete/internas | Core API |
| 11+ | Self-Healing PDF: anexação automática ao HubSpot Deal | Core API |

---

### 🖥️ MÓDULO III — CRM CARD & UX (Phases 12–32)
> **Status:** ✅ CONCLUÍDO | **Impacto:** Experiência nativa do Sankhya dentro do HubSpot.

| Phase | Entrega | Ambiente |
|-------|---------|---------|
| 12–20 | Componente `PrecosCard.tsx` com Glassmorphism | UI Extension |
| 21–25 | Busca via Biblioteca HubSpot com referência cruzada `codProd` | UI Extension + API |
| 26–30 | Rentabilidade real-time (`PERCLUCRO`) e lotes (`CONTROLE`) | UI Extension |
| 31–32 | CRUD completo: Adição, Duplicação e Exclusão de Itens | UI Extension |

---

### 🛡️ MÓDULO IV — AUDITORIA, PERFORMANCE & GOVERNANÇA (Phases 35–39)
> **Status:** ✅ CONCLUÍDO | **Impacto:** Confiabilidade total dos dados e alinhamento com regras da Tradipar.

| Phase | Entrega | Ambiente |
|-------|---------|---------|
| 35 | Otimização de queries `TGFITE` para alto volume de itens | Core API |
| 36 | Mapeamento avançado de erros Sankhya → HubSpot (amigável) | Core API |
| 37 | TypeScript Strict Mode: eliminação de `noImplicitAny` | Core API |
| 38 | Docker/Oracle Cloud: deploy e auto-recovery | DevOps |
| 39 | Governança: TOP 1010 manual (conferência de frete/anexos) | Core API |

---

## 🔵 FASES PENDENTES: O QUE AINDA PRECISAMOS ENTREGAR

---

### 🚀 MÓDULO V — DEAL LIFECYCLE COMPLETION (Phase 40) — 🔵 PRIORIDADE MÁXIMA
> **Status:** 🔵 A FAZER | **Impacto:** Fecha o ciclo financeiro completo.

#### Sprint Goal: "Da confirmação do Pedido à DANFE no HubSpot"

| # | Task | Descrição Técnica | Ambiente |
|---|------|--------------------|---------|
| 40.1 | UI: Botão "Faturar Pedido" | Trigger visual no CRM Card para evolução TOP 1010 → 1100 | UI Extension |
| 40.2 | API: `billOrder()` Orchestration | Acionamento das procedures (`SalesCentralSP.faturarNota` → `CACSP.faturarNota`) | Core API |
| 40.3 | Sync: Captura do `NUMNOTA` Final | Atualizar `sankhya_nu_unico_nfe` e `sankhya_nunota_final` no Deal | Core API |
| 40.4 | ⭐ Attachment: DANFE (PDF da NFE) | Upload automático da DANFE emitida no HubSpot Deal | Core API |
| 40.5 | Pipeline: Closed Won Automation | Mover o Deal para "Fechado Ganho" após confirmação do anexo | HubSpot |

> ⚠️ **Bloqueio:** As Phases 41 e 42 (abaixo) **ficam em espera** até que esta Phase 40 seja totalmente validada em produção e a DANFE esteja sendo anexada com sucesso.

---

### ⚠️ MÓDULO VI — BUSINESS RULES: VALIDAÇÃO AVANÇADA (Phases 41–42) — 🟡 BACKLOG (Pós-DANFE)
> **Status:** 🟡 BACKLOG ESTRATÉGICO | **Impacto:** Governança financeira e logística de alto risco.
>
> Estas duas features são **primordiais para o projeto** mas devem ser retomadas **somente após a entrega estável da DANFE (Phase 40)**, para evitar sobrecarga no sprint e risco de regressão.

---

#### 📦 Phase 41: Validação de Estoque (Stock Cut Engine)
> **Quando:** Ao confirmar um orçamento (TOP 999 → 1010)

**Regra de Negócio:**
- Antes de transformar o orçamento em pedido, o sistema deve **consultar o saldo disponível** no Sankhya (`TGFEST`).
- Se o estoque for **insuficiente para 1 ou mais itens**, o sistema deve:
  1. Exibir um modal/aviso na UI com os itens e divergências de quantidade.
  2. Oferecer ao vendedor a opção de **Corte Parcial**: confirmar apenas a quantidade disponível em estoque.
  3. Registrar o corte como uma propriedade no HubSpot Deal (`sankhya_stock_cut_items`).
- Se o vendedor oumutar ou confirmar com estoque zero/negativo, deve haver um **bloqueio com mensagem clara**.

**Estimativa Técnica:**
- `catalog.service.ts`: Método `validateStockBeforeOrder(items[])`
- `PrecosCard.tsx`: Modal de validação de estoque pré-confirmação
- `quote.service.ts`: Guard de pré-confirmação

---

#### 💰 Phase 42: Aprovação por Rentabilidade (Profitability Gate)
> **Quando:** Ao confirmar um orçamento com margem negativa ou em prejuízo

**Regra de Negócio:**
- Antes de gerar o pedido, o sistema deve **calcular a rentabilidade consolidada** de todos os itens do deal.
- Se a rentabilidade estiver **abaixo do limiar de aprovação** (ex: `PERCLUCRO < 0`), o sistema deve:
  1. **Bloquear a confirmação** automática pelo vendedor.
  2. **Disparar uma notificação** (HubSpot Task ou Email) para um **usuário aprovador** (Gerente/Gestor Comercial).
  3. **Registrar o status pendente** no Deal (`sankhya_approval_status: pending`).
  4. Somente após a aprovação manual do superior, o sistema libera a geração da TOP 1010.

**Estimativa Técnica:**
- `PrecosCard.tsx`: Badge/aviso de "Orçamento em Análise"
- `core API`: Endpoint `POST /hubspot/approval-request` + lógica de notificação
- `hubspot.api.ts`: Criação de Task/Nota no Deal com atribuição ao Gerente

---

---

## ⚖️ PONTO DE DECISÃO ESTRATÉGICA (STAKEHOLDERS)

Conforme alinhado, as **Phases 41 (Estoque/Cortes) e 42 (Rentabilidade/Superior)** são os pilares de segurança e rentabilidade da operação. Entretanto, para maximizar o valor comercial imediato, a estratégia de desenvolvimento segue este critério:

1.  **Prioridade 1: Phase 40 (DANFE)** → Entrega o ciclo completo (Closed Won com comprovante fiscal).
2.  **Prioridade 2: Phases 41/42** → Retomada imediata após a estabilização da DANFE no Deal.

*Esta decisão visa garantir que a integração básica de faturamento esteja 100% funcional antes de aplicar as camadas de bloqueios e aprovações gerenciais.*

---

## 🗓️ LINHA DO TEMPO SUGERIDA

```
Mar 2026         Abr 2026          Mai 2026
  |                 |                  |
  ▼                 ▼                  ▼
[Phase 40 DANFE] → [Validate & UAT] → [Phase 41 Stock Cut + Phase 42 Approval Gate]
```

---

## ⚙️ CONFIGURAÇÃO PARA IMPORTAÇÃO NO CLICKUP

**Folder:** `Tradipar Sankhya-HubSpot`
**Lists:** `Concluído (Archive)`, `Em Andamento`, `Backlog Estratégico`

| Phase | Task | Status | Priority | Estimativa | File Reference |
|-------|------|--------|----------|------------|----------------|
| 39 | Governance: TOP 1010 Manual | ✅ Done | Resolvido | — | `quote.service.ts` |
| 40.1 | UI: Botão "Faturar Pedido" | 🔵 Todo | 🔴 Urgente | **5h** | `PrecosCard.tsx` |
| 40.2 | API: `billOrder()` Orchestration | 🔵 Todo | 🔴 Urgente | **8h** | `quote.service.ts` |
| 40.3 | Sync: NUMNOTA Final (TOP 1100) | 🔵 Todo | 🔴 Urgente | **4h** | `quote.service.ts` |
| 40.4 | ⭐ DANFE PDF Attachment | 🔵 Todo | 🔴 Urgente | **8h** | `quote.service.ts` |
| 40.5 | Closed Won Automation | 🔵 Todo | 🔴 Urgente | **3h** | HubSpot Pipeline |
| 41.1 | Stock: `validateStockBeforeOrder` | 🟡 Backlog | 🟡 Alta | **6h** | `catalog.service.ts` |
| 41.2 | API: Guard Pré-Confirmação | 🟡 Backlog | 🟡 Alta | **5h** | `order.controller.ts` |
| 41.3 | UI: Modal de Validação de Corte | 🟡 Backlog | 🟡 Alta | **7h** | `PrecosCard.tsx` |
| 42.1 | Backend: Rentabilidade Consolidada | 🟡 Backlog | 🟡 Alta | **5h** | `quote.service.ts` |
| 42.2 | API: Approval Gate + HubSpot Task | 🟡 Backlog | 🟡 Alta | **7h** | `hubspot.api.ts` |
| 42.3 | UI: Badge "Em Aprovação" | 🟡 Backlog | 🟡 Alta | **7h** | `PrecosCard.tsx` |
| — | QA + Staging para Ph. 41 e 42 | 🟡 Backlog | 🟡 Alta | **9h** | — |
| **TOTAL** | **Phases 40–42 completas** | — | — | **🕐 76h (~10 dias úteis)** | — |

---

> 🤖 **Auditado por Gabriel Rocha & IAs de ponta (Gemini e ClaudeCode) na data 18/03/2026.** A arquitetura atual suporta expansão imediata para as Phases 41 e 42 sem refatoração do core. A decisão estratégica de priorizar a DANFE (Phase 40) antes é tecnicamente acertada — ela fecha a visibilidade do deal e cria a base para os gates de aprovação.
