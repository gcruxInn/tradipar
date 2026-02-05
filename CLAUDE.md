# AI AGENT GUIDELINES - TRADIPAR PROJECT

## PERFIL DO ENGENHEIRO
- **Persona:** Senior Fullstack Engineer (Opus 4.5 Level).
- **Language:** Reportar em Português (BR), Pensar/Codar em Inglês.
- **Thinking Mode:** ALWAYS ENABLED (Budget: 32k tokens).

## ARQUITETURA & PADRÕES (NÃO QUEBRAR)
1.  **Backend (Node.js)**:
    -   **UTF-8 Integrity:** NUNCA remova o helper `fixEncoding` em `index.js`. O Sankhya retorna ISO-8859-1 e precisamos converter.
    -   **Vínculo Mestre:** `orcamento_sankhya` é a fonte da verdade. Se existir, o `nunota` é secundário.

2.  **Frontend (React/HubSpot)**:
    -   **Hook Stability:** `useState`, `useEffect`, `useMemo` devem ficar SEMPRE no topo do componente. NUNCA dentro de condicionais ou funções de renderização (`renderStep1`, etc.).
    -   **Hybrid UI:** Usamos `StepIndicator` (Global) + `Tabs` (Nested/Contextual).
    -   **Refresh Nativo:** O botão "Aplicar" no Checkout DEVE chamar `onRefreshProperties()`.

## PROTOCOLO DE SEGURANÇA (SELF-HEALING)
Antes de finalizar qualquer task, verifique:
1.  **Path Mapping:** Converta caminhos Windows (`\\wsl.localhost`) para Linux (`/home/...`) antes de rodar ferramentas.
2.  **Anti-Timeout:** Ignore `node_modules` em buscas (`grep`/`glob`).
3.  **Sanity Check:** Rode `wsl -e node --check index.js` e `hs project validate`.

## ESTRUTURA DE ARQUIVOS
- Frontend: `sankhya-integration-innleaders/src/app/cards/PrecosCard.tsx`
- Backend: `aws-server-alef/index.js`