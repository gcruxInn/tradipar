# Prompt Inicial para Novo Ciclo de Desenvolvimento (Copie isso)

---

Ative a Arquitetura de Agentes (Blueprint Tradipar) e proceda no Modo EXECUTION usando nossas skills estabelecidas (`hubspot-ui-dev`, `node-proxy-dev`, `sankhya-java-dev`). Temos problemas remanescentes na integração Sankhya-HubSpot que precisamos orquestrar:

## Nossos Objetivos Atuais

### 1. Correção de Dados de Itens Clonados (UI e Proxy)
**Problema:** Na tabela de itens do CRM Card, ao usar a ação de clonar item, os números de estoque, lote e valor do Produto de Venda (PV) não estão sendo renderizados corretamente para a cópia.
**Ordem (`hubspot-ui-dev` + `node-proxy-dev`):** Garanta que a mutação de clonagem traga/mantenha o contexto completo da linha (`sankhya_controle`, `stock`, `rentabilidade`).

### 2. Visibilidade Ampla e Imediata de Rentabilidade (UI)
**Problema:** Necessitamos de visibilidade total de rentabilidade para o negócio inteiro e para cada item isolado (Badge/Coluna), reagindo imediatamente a mudanças.
**Solução Sugerida (UI):** Ao invés de forçar refresh pelo botão de ações, implementar **OnBlur** nos inputs (quando tira o foco, atualiza os dados) ou um **OnClick** na linha inteira do item (que hoje muda de cor ao passar o mouse). O clique na linha atualizará os números subjacentes da rentabilidade naquele instante.
**Ordem (`hubspot-ui-dev`):** Avalie a melhor UX para atualização dinâmica de rentabilidade sem recarregar a página/card. Implemente os cálculos com Optimistic UI.

### 3. Alertas Preditivos de Prejuízo (UI e Proxy)
**Problema:** O vendedor não é engajado com a perda de rentabilidade.
**Ordem (`hubspot-ui-dev`):** Quando houver prejuízo na rentabilidade de qualquer item (calculado via Proxy), exiba Notificações/Alertas claros bloqueantes: "Atenção: Você deve ajustar os valores do item XYZ (rentabilidade negativa)". Se baseie no modelo de tabela de itens em prejuízo que existe nativamente no Sankhya. Se houver prejuízo, o vendedor não pode avançar o negócio.

### 4. Sincronização Final e Geração de Pedido (TOP 1010)
**Status:** O `tradipar-core-api` ( v2.0) já gera e anexa o PDF do orçamento automaticamente ao Sankhya e ao HubSpot no momento da confirmação. O erro de `FileItem` foi resolvido com o envio explícito de `Content-Length`.
**Novo Desafio:** Após confirmar o orçamento (TOP 1), o sistema deve gerar automaticamente o Pedido (TOP 1010). Atualmente, a nota é confirmada mas o pedido com a nova TOP não está sendo criado/vinculado.
**Ordem (`tradipar-core-api-dev`):** 
1. Investigue por que a confirmação da TOP 1 não está evoluindo para a TOP 1010 no Sankhya via `CACSP.confirmarNota`.
2. Garanta que o novo `NUNOTA` do pedido seja capturado e atualizado no HubSpot no campo `sankhya_nu_unico_pedido`.
3. Mantenha o fluxo de auto-anexo de PDF ativo para o novo pedido gerado.
### Protocolo de Validação
Antes de aplicar uploads/deploys das soluções para o fluxo acima, acione o `build_probe.sh` para a skill em questão provando a estabilidade da sintaxe (TypeScript e Node) via `// turbo`. Mantenha-me atualizado informando em qual item estamos focando via comandos `notify_user`!
