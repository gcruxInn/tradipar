### 📄 Documento de Requisitos de Produto (PRD): Sprint Final Tradipar - Deal Lifecycle & UX Polish
**Autor:** Manus AI | **Data:** 19 de Março de 2026 | **Versão:** 3.0 [1]

---

#### 1. Introdução
Este Documento de Requisitos de Produto (PRD) detalha os objetivos e o escopo da sprint final do projeto Tradipar, focando na consolidação da integração bidirecional entre HubSpot e Sankhya [1]. O documento aborda o fechamento do *Deal Lifecycle*, a remoção de bloqueios operacionais e a refatoração da experiência do usuário (UX) da extensão do HubSpot, alinhando-se às melhores práticas oficiais de HubSpot UI Extensions [1].

**1.1. Visão Geral e Objetivos da Sprint**
O principal objetivo desta sprint é permitir a criação de cabeçalhos de orçamentos (TOP 999) a partir de Negócios sem itens no HubSpot, aprimorar significativamente a experiência do usuário (UX) no Frontend (HubSpot CRM Card) e finalizar a esteira de conversão de Pedido (TOP 1010) e Faturamento (TOP 1100) [2].

**1.2. Escopo do Documento**
Este PRD descreve os requisitos funcionais e não funcionais, as diretrizes de implementação e as referências para os épicos a serem desenvolvidos [2]. Ele serve como um guia para a equipe de desenvolvimento, garantindo clareza e alinhamento com as expectativas do produto, com foco adicional em resiliência, tolerância a falhas e integridade transacional [2].

---

#### 2. Escopo de Funcionalidades (Épicos)

##### 🔴 Épico 1: Desbloqueio da Criação de Orçamento (TOP 999 sem Itens)
**2.1. Contexto do Problema:** Atualmente, a Etapa 1 ("Conexão") do card da interface de usuário (UI) impede o avanço ou a sincronização caso o Negócio no HubSpot não possua *Line Items* [3]. Este bloqueio gera fricção no processo de vendas e impede a criação antecipada de orçamentos no Sankhya [3].

**2.2. Solução Proposta e Requisitos:**
*   **Remoção do Bloqueio Front-end:** O botão de iniciar integração na Etapa 1 ("Conexão") deve ser habilitado independentemente da presença de *Line Items* no payload do HubSpot [4]. Isso permitirá que o usuário inicie o processo de criação de orçamento no Sankhya mesmo que o Deal no HubSpot ainda não possua itens associados [4].
*   **Criação Exclusiva de Cabeçalho (TGFCAB) via `orcamentoService.generateHeader`:** No backend Node.js, o endpoint `/hubspot/generate-header` será invocado [4]. A lógica deve ser ajustada para aceitar a criação da TOP 999 contendo apenas os dados essenciais do formulário do Deal (e.g., CODPARC, CODVEND, Empresa/Local) [4]. O sistema Sankhya permite a geração do NUNOTA apenas com o cabeçalho, sem a necessidade de itens associados inicialmente [4].
*   **Gravação do NUNOTA com Resiliência (Self-healing):** O `sankhya_nunota` gerado pelo Sankhya deve ser imediatamente salvo no objeto Deal correspondente no HubSpot [4]. É imperativo implementar um padrão de compensação (Saga Pattern ou Retry Mechanism) [4]. Se a atualização no HubSpot falhar, o sistema deve entrar em modo de *Self-protection*, enfileirar a requisição para tentar novamente, ou enviar um comando de deleção para o Sankhya desfazer a criação do cabeçalho [4].

##### 🔵 Épico 2: UX de Sincronização na "Gestão de Itens" (Auto-Save vs. Botão)
**2.3. Contexto do Problema:** Na Etapa 2, a sincronização de itens apresenta um atraso no feedback visual, resultando em uma experiência de usuário insatisfatória [5].

**2.4. Solução Proposta e Requisitos (Padrão HubSpot UI):**
*   **Feedback Imediato (Skeleton/LoadingSpinner):** No início de qualquer ação de sincronização, a interface deve transicionar **imediatamente** para um estado de carregamento [5]. Isso pode ser um `<LoadingSpinner />` centralizado ou um esqueleto visual [5].
*   **Estratégia Híbrida (Optimistic UI + Debounce) com Prevenção de Perda de Dados:**
    1.  **Optimistic UI:** Qualquer modificação na tabela de itens deve refletir instantaneamente na interface do usuário, atualizando totais e a própria tabela [5].
    2.  **Debounce Automático (Opcional):** Implementar um mecanismo de *debounce* com um temporizador de **1500ms a 2000ms** (utilizando `setTimeout` em um `useRef` para evitar render loops) [5]. O envio ocorrerá em background com um aviso discreto ("Salvando...") [5].
    3.  **Cleanup para Prevenção de Perda de Dados:** É crucial adicionar um `useEffect` de *cleanup* no componente `PrecosCard.tsx` [5]. Quando o componente for desmontado e houver um timer ativo, o sistema deve forçar a sincronização síncrona imediatamente, garantindo que nenhum input do usuário seja perdido [5].
    4.  **Fallback (Botão "Sincronizar"):** Se a sincronização contínua falhar, o botão "Sincronizar" deve permanecer. Ao ser clicado, a tabela deve ser ocultada e o `<LoadingSpinner />` renderizado imediatamente [5].

##### 🟣 Épico 3: Transições de Estado (Tabs/Steps)
**2.5. Contexto do Problema:** A transição entre as etapas "Conexão", "Gestão de Itens" e "Fechamento" é abrupta [6].
**2.6. Solução Proposta e Requisitos:**
*   Criar variável de transição `isTransitioning` [6].
*   Ao alternar entre as abas no `<StepIndicator>`, setar a variável como `true` por **500 a 800ms** [6].
*   Durante este intervalo, renderizar a tela de carregamento principal (o `<LoadingSpinner />` com o logo) para proporcionar uma percepção psicológica de processamento de nova página [6].

##### 🟢 Épico 4: Deal Lifecycle (Confirmação e Faturamento)
**2.7. Contexto do Problema:** Necessidade de implementar a progressão do NUNOTA de 999 (Orçamento) para 1010 (Pedido) e Nota Fiscal [7].
**2.8. Solução Proposta e Requisitos:**
*   **Confirmação Manual (TOP 1010) via `quoteService.convertToOrder`:** Botão "Confirmar Pedido" acionando `/hubspot/convert-to-order` para validar pendências e converter no Sankhya [7].
*   **Faturamento (TOP 1100) via `orderController.billOrder`:** Botão "Faturar" enviando requisição para `/sankhya/pedido/faturar` com `targetTOP` 1100 [7].
*   **Tratamento de Erros de Banco com Error Parser:** O `quote.service.ts` precisa de uma camada de tradução de erros (*Error Parser*) [7]. Extrair apenas a string amigável da resposta da CACSP e enviá-la para o `<Alert>` do HubSpot [7].
*   **Closed-Loop:** Quando a NF for emitida (STATUSNFE = "A"), baixar o PDF e atrelar automaticamente ao Deal do HubSpot [7].

---

#### 3. Diretrizes de Implementação para a IA (Claude)
1.  **Tecnologias:** Frontend em React Serverless UI e backend em Node.js/TypeScript [8].
2.  **Documentação HubSpot UI:** Frontend deve utilizar **exclusivamente** os componentes de `@hubspot/ui-extensions` [8].
3.  **Segurança e Estado:** Evitar re-renderizações infinitas utilizando `useRef` para proteger o Auto-Save [8].
4.  **Lógica da TGFCAB e Resiliência Transacional:** Ao criar orçamento sem itens, preencher `NUMNOTA = 0` passando apenas CODPARC, CODVEND e DTNEG [8]. Acionar mecanismo de *Self-protection* em caso de falhas posteriores [8].
5.  **Gestão de Sessão do Sankhya (JSESSIONID):** O módulo `sankhya.api.ts` deve identificar erros 401 e renovar o login automaticamente (Self-configuration) re-executando a requisição [8].
6.  **Error Parser:** Camada obrigatória para limpar os erros verbosos de banco de dados e exibir de forma amigável no HubSpot [8].
Após colar este conteúdo no arquivo .agents/handoff/PRD_v3_sprint_final.md, você pode seguir rodando o Claude no terminal. A presença dos identificadores de tecnologia (como sankhya.api.ts, NUMNOTA, CACSP e as instruções de cleanup do React) nesse documento vai garantir que o agente saiba exatamente o que codificar!