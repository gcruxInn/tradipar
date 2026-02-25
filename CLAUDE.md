# AI AGENT GUIDELINES - TRADIPAR PROJECT

## 🧠 PERFIL DO ENGENHEIRO
- **Persona:** Senior Fullstack Engineer (Opus 4.5 Level).
- **Language:** Reportar em Português (BR), Pensar/Codar em Inglês.
- **Thinking Mode:** ALWAYS ENABLED (Budget: 32k tokens).

## 🏗️ ARQUITETURA & PADRÕES (NÃO QUEBRAR)
1.  **Backend (Node.js)**:
    -   **UTF-8 Integrity:** NUNCA remova o helper `fixEncoding` em `index.js`. O Sankhya retorna ISO-8859-1 e precisamos converter para UTF-8.
    -   **Vínculo Mestre:** `orcamento_sankhya` é a fonte da verdade definitiva para o vínculo. Se existir, o `nunota` é tratado como secundário.

2.  **Frontend (React/HubSpot)**:
    -   **Hook Stability:** `useState`, `useEffect`, `useMemo` devem ficar SEMPRE no topo do componente. NUNCA os coloque dentro de condicionais ou funções de renderização interna para evitar o erro #310.
    -   **Hybrid UI Flow:** O `StepIndicator` rege o fluxo global (1. Conexão, 2. Gestão, 3. Fechamento). As `Tabs` são usadas apenas dentro do Passo 2 para alternar entre "Adicionar", "Carrinho" e "Detalhes".
    -   **State Persistence:** Garanta que a troca de abas no Passo 2 não limpe o estado da busca ou os filtros da tabela.
    -   **Refresh Nativo:** O botão "Aplicar" no Checkout DEVE obrigatoriamente chamar `onRefreshProperties()` para sincronizar o CRM.

3.  **Git & Commits**:
    -   **Padrão:** Sempre use o sufixo `Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>` (ou Opus conforme configurado) em todos os commits solicitados.

## 🛡️ PROTOCOLO DE SEGURANÇA (SELF-HEALING)
Antes de finalizar qualquer task, verifique:
1.  **Path Mapping:** Converta caminhos Windows (`\\wsl.localhost`) para Linux (`/home/...`) antes de rodar ferramentas.
2.  **Anti-Timeout:** Ignore explicitamente `node_modules`, `.git` e `dist` em buscas (`grep`/`glob`).
3.  **Sanity Check:** Rode `wsl -d Ubuntu-22.04 sh -c "cd /home/rochagabriel/dev/tradipar && node --check aws-server-alef/index.js"` e `hs project validate`.

## 📂 ESTRUTURA DE ARQUIVOS (CONTEXT MAP)
- **Root:** `/home/rochagabriel/dev/tradipar/`
- **Frontend App:** `/home/rochagabriel/dev/tradipar/sankhya-integration-innleaders`
- **Backend API:** `/home/rochagabriel/dev/tradipar/aws-server-alef`
- **Arquivo Principal UI:** `src/app/cards/PrecosCard.tsx`
- **Arquivo Principal Motor:** `index.js`

## 🛠️ SYSTEM ENVIRONMENT & PATH GUIDELINES (CRITICAL)
- **🚨 WSL PATH MAPPING:** Para ferramentas do MCP (ClaudeCode/Grep/Read/Ls/etc), **NUNCA** use caminhos Windows UNC (`\\wsl.localhost\...` ou `//wsl.localhost/...`).
- **CORRETO:** Use caminhos absolutos Linux nativos: `/home/rochagabriel/dev/tradipar/...`
- **ERRADO:** `\\wsl.localhost\Ubuntu-22.04\home\rochagabriel\dev\tradipar\...`
- **Motivo:** O ambiente de execução do MCP espera caminhos locais do Linux dentro do WSL.

## ⚡ PERFORMANCE & TIMEOUT PREVENTION
- **Ignore Dependencies:** ALWAYS exclude `node_modules` from searches.
- **Be Specific:** Não busque na raiz `.`. Foque em diretórios específicos como `src/` ou `app.functions/`.

## 🧪 VALIDATION COMMANDS
- **Backend Check:** `wsl -d Ubuntu-22.04 sh -c "cd /home/rochagabriel/dev/tradipar && node --check aws-server-alef/index.js"`
- **HubSpot Upload:** Para comandos `hs`, prefira usar via PowerShell no Windows se o binário Linux falhar: `powershell -Command "cd \\\\wsl.localhost\\Ubuntu-22.04\\home\\rochagabriel\\dev\\tradipar\\... ; hs project upload"`

## 🛑 REGRAS DE EXECUÇÃO MCP (MANDATÓRIO)
1. **Grep/Read/Ls:** Ao chamar estas ferramentas, converta AUTOMATICAMENTE qualquer caminho `\\wsl.localhost` para `/home/rochagabriel/...`.
   - *Exemplo Input:* `\\wsl.localhost\Ubuntu-22.04\home\rochagabriel\dev\tradipar\index.js`
   - *Exemplo Tool Call:* `path: "/home/rochagabriel/dev/tradipar/index.js"`
2. **Terminal:** Se for rodar comandos via `run_command` que dependem de variáveis de ambiente Windows (como `hs` instalado no Windows), use `powershell`. Se for script nativo (node, npm), use `wsl`.