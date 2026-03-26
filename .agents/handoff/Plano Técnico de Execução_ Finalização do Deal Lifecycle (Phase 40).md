# 🛠️ Plano Técnico de Execução: Finalização do Deal Lifecycle (Phase 40)

Este plano detalha as etapas necessárias para que o **ClaudeCode** execute e finalize a **Phase 40** do ecossistema Tradipar, focando na transição de Pedido (TOP 1010) para Venda (TOP 1100) e o anexo automático da DANFE no HubSpot. Este documento incorpora as diretrizes do **Master Prompt Aprimorado** [22], com ênfase nos princípios de **Autonomic Computing** (*Self-configuration, Self-healing, Self-optimization, Self-protection*).

***

## 1. Objetivos da Sprint (Phase 40)

*   **Finalizar a conversão TOP 1010 ➔ 1100:** Implementar o gatilho visual e a orquestração de backend.
*   **Captura e Anexo da DANFE:** Garantir que o PDF da nota fiscal seja baixado do Sankhya e anexado ao Deal no HubSpot.
*   **Automação de Pipeline:** Mover o Deal para "Fechado Ganho" após a confirmação do anexo.
*   **Garantir Autonomia:** Assegurar que a implementação siga os princípios de Autonomic Computing para um sistema escalável, sem fricção de UI, altamente automatizado e livre de manutenção técnica diária [22].

***

## 2. Roadmap de Implementação

### 🔹 Passo 1: Interface (UI Extension) - `Self-optimization` & `Self-protection`
**Arquivo:** `sankhya-integration-innleaders/src/app/cards/PrecosCard.tsx` [19]

1.  **Botão "Faturar Pedido":**
    *   Adicionar condicional para exibir o botão apenas quando o status do Deal permitir (ex: após confirmação da TOP 1010).
    *   Implementar chamada ao endpoint `/sankhya/pedido/faturar`.
    *   Utilizar `<LoadingSpinner />` imediatamente após o clique para feedback visual.
2.  **Tratamento de Erros:**
    *   Integrar o componente `<Alert>` para exibir mensagens amigáveis retornadas pelo *Error Parser* do backend.
3.  **Prevenção de Perda de Dados (`Self-protection`):**
    *   Adicionar um `useEffect` de *cleanup*. Quando o componente `PrecosCard.tsx` for desmontado (e.g., usuário muda de aba ou fecha o card) e houver um timer ativo no `debounceTimer.current`, o sistema deve forçar a sincronização síncrona imediatamente antes da destruição do componente, garantindo que nenhum *input* do usuário seja perdido [20, 22].

### 🔹 Passo 2: Orquestração de Backend (Core API) - `Self-healing` & `Self-protection`
**Arquivos:** `tradipar-core-api/src/controllers/order.controller.ts` [18] e `tradipar-core-api/src/services/quote.service.ts` [17]

1.  **Método `billOrder`:**
    *   Acionar as procedures do Sankhya: `SalesCentralSP.faturarNota` ➔ `CACSP.faturarNota`.
    *   Mapear o `targetTOP` como 1100 (padrão para Venda).
2.  **Implementação do Error Parser (`Self-healing`):**
    *   Interceptar respostas XML/JSON do Sankhya (especialmente da rotina `CACSP`).
    *   Extrair mensagens de erro de negócio (ex: falta de estoque, erro de CFOP) e traduzi-las para o HubSpot UI.
    *   Retornar um payload limpo para o frontend: `{ success: false, error: "Mensagem Amigável" }` [20, 22].
3.  **Gestão de Sessão do Sankhya (JSESSIONID) - `Self-healing` & `Self-configuration`:**
    *   No módulo `sankhya.api` [21], configurar um interceptor do Axios para identificar códigos de erro 401 ou avisos de sessão expirada do Sankhya.
    *   Em caso de expiração, renovar o login automaticamente (*Self-configuration*) e re-executar a requisição original de forma transparente para o usuário [20, 22].

### 🔹 Passo 3: Sincronização e Anexos (Closed-Loop) - `Self-healing` & `Self-protection`
**Arquivo:** `tradipar-core-api/src/services/quote.service.ts` [17]

1.  **Captura do NUMNOTA Final:**
    *   Atualizar as propriedades do Deal: `sankhya_nu_unico_nfe` e `sankhya_nunota_final`.
2.  **Automação DANFE (PDF):**
    *   Utilizar `generateSankhyaPDF` para obter o Base64 da nota emitida.
    *   Utilizar `attachPdfToHubspot` para realizar o upload para o HubSpot e criar a nota de anexo no Deal.
    *   **Resiliência (`Self-healing`):** Implementar lógica de *Retry Mechanism* para retentar o anexo caso a API do HubSpot falhe momentaneamente (por *rate limit*, *timeout* da AWS ou erro 5xx do HubSpot), evitando registros órfãos [20, 22].

### 🔹 Passo 4: Automação HubSpot - `Self-configuration`
**Ambiente:** HubSpot Portal

1.  **Workflow de Pipeline:**
    *   Configurar gatilho: Quando `sankhya_nunota_final` for preenchido e a nota de anexo for criada.
    *   Ação: Mover estágio do Deal para "Fechado Ganho".
    *   **Auto-registro de Webhooks/Extensions:** Garantir que a infraestrutura esteja configurada para auto-registrar webhooks e extensões no HubSpot na inicialização, conforme o princípio de `Self-configuration` [22].

***

## 3. Checklist de Validação para ClaudeCode

- [ ] O botão "Faturar" aparece corretamente no CRM Card?
- [ ] A chamada para `billOrder` resulta na criação da TOP 1100 no Sankhya?
- [ ] Erros de faturamento (ex: crédito) são exibidos de forma amigável no `<Alert>` (via *Error Parser*)?
- [ ] A renovação automática do `JSESSIONID` do Sankhya funciona sem interrupção para o usuário?
- [ ] O PDF da DANFE aparece na aba "Notas" (Notes) do Deal no HubSpot?
- [ ] As propriedades `sankhya_nu_unico_nfe` e `sankhya_nunota_final` foram atualizadas?
- [ ] O mecanismo de *Retry* para o anexo do PDF no HubSpot está funcional?
- [ ] O *cleanup hook* em `PrecosCard.tsx` garante que nenhum *input* do usuário seja perdido ao fechar o card?
- [ ] O Deal é movido automaticamente para "Fechado Ganho" no HubSpot após a conclusão do processo?

***

## 4. Referências Técnicas

*   **PRD Auditado:** `Tradipar_PRD_Aprimorado_V4.md`
*   **Roadmap:** `TRAHUB251-ROADMAP-ESTRATÉGICO-ENGENHARIA.pdf`
*   **Repositório:** `gcruxInn/tradipar` [13]
*   **Master Prompt Aprimorado:** `pasted_content.txt` [22]
