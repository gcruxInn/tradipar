# AI AGENT GUIDELINES - TRADIPAR PROJECT

## 🧠 PERFIL DO ENGENHEIRO
- [cite_start]**Persona:** Senior Fullstack Engineer (Opus 4.5 Level)[cite: 1].
- **Language:** Reportar em Português (BR), Pensar/Codar em Inglês.
- [cite_start]**Thinking Mode:** ALWAYS ENABLED (Budget: 32k tokens)[cite: 1].

## 🏗️ ARQUITETURA & PADRÕES (NÃO QUEBRAR)
1.  **Backend (Node.js)**:
    -   **UTF-8 Integrity:** NUNCA remova o helper `fixEncoding` em `index.js`. [cite_start]O Sankhya retorna ISO-8859-1 e precisamos converter para UTF-8[cite: 1].
    -   **Vínculo Mestre:** `orcamento_sankhya` é a fonte da verdade definitiva para o vínculo. [cite_start]Se existir, o `nunota` é tratado como secundário[cite: 1].

2.  **Frontend (React/HubSpot)**:
    -   **Hook Stability:** `useState`, `useEffect`, `useMemo` devem ficar SEMPRE no topo do componente. [cite_start]NUNCA os coloque dentro de condicionais ou funções de renderização interna para evitar o erro #310[cite: 1].
    -   **Hybrid UI Flow:** O `StepIndicator` rege o fluxo global (1. Conexão, 2. Gestão, 3. Fechamento). [cite_start]As `Tabs` são usadas apenas dentro do Passo 2 para alternar entre "Adicionar", "Carrinho" e "Detalhes"[cite: 2].
    -   **State Persistence:** Garanta que a troca de abas no Passo 2 não limpe o estado da busca ou os filtros da tabela.
    -   [cite_start]**Refresh Nativo:** O botão "Aplicar" no Checkout DEVE obrigatoriamente chamar `onRefreshProperties()` para sincronizar o CRM[cite: 2].

3.  **Git & Commits**:
    -   **Padrão:** Sempre use o sufixo `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>` (ou Opus conforme configurado) em todos os commits solicitados.

## 🛡️ PROTOCOLO DE SEGURANÇA (SELF-HEALING)
Antes de finalizar qualquer task, verifique:
1.  **Path Mapping:** Converta caminhos Windows (`\\wsl.localhost`) para Linux (`/home/...`) antes de rodar ferramentas.
2.  **Anti-Timeout:** Ignore explicitamente `node_modules`, `.git` e `dist` em buscas (`grep`/`glob`).
3.  [cite_start]**Sanity Check:** Rode `wsl -d Ubuntu-22.04 sh -c "cd /home/rochagabriel/dev/tradipar && node --check aws-server-alef/index.js"` e `hs project validate`[cite: 1].

## 📂 ESTRUTURA DE ARQUIVOS (CONTEXT MAP)
- **Root:** `/home/rochagabriel/dev/tradipar/`
- **Frontend App:** `/home/rochagabriel/dev/tradipar/sankhya-integration-innleaders`
- **Backend API:** `/home/rochagabriel/dev/tradipar/aws-server-alef`
- **Arquivo Principal UI:** `src/app/cards/PrecosCard.tsx`
- **Arquivo Principal Motor:** `index.js`

## 🛠️ SYSTEM ENVIRONMENT & PATH GUIDELINES (CRITICAL)
- **🚨 WSL/LINUX ONLY:** Este agente roda dentro do WSL (Ubuntu).
- **Rule:** Nunca passe caminhos `\\wsl.localhost` para as ferramentas `Read`, `Grep` ou `Ls`. Use caminhos relativos a partir da raiz do projeto.

## ⚡ PERFORMANCE & TIMEOUT PREVENTION
- **Ignore Dependencies:** ALWAYS exclude `node_modules` from searches.
- **Be Specific:** Não busque na raiz `.`. Foque em diretórios específicos como `src/` ou `app.functions/`.

## 🧪 VALIDATION COMMANDS
- **Backend Check:** `wsl -d Ubuntu-22.04 sh -c "cd /home/rochagabriel/dev/tradipar && node --check aws-server-alef/index.js"`
- **Nota:** Ignore erros de `UtilTranslatePathList` no console; o check é bem-sucedido se o Node não retornar mensagens de erro de sintaxe.