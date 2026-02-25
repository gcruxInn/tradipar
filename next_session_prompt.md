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

### 4. Sincronização Final e Importação de PDF de Cotação (Proxy e Java Core)
**Problema:** Após as mutações no orçamento do HubSpot (clonar, editar quantidade/preço), o Sankhya precisa obrigatoriamente ser atualizado. Somente se os estoques existirem e a rentabilidade for positiva, o orçamento pode ser confirmado.
**Ordem (`node-proxy-dev` + `sankhya-java-dev`):** 
1. Realize o PUT de Update pro Sankhya refletindo as cartelas de produtos e lotes finais.
2. Intercepte a confirmação de nota (Confirmar Orçamento).
3. **Download Rápido:** Verifique nas pastas (`aws-server-alef` ou endpoints no Java) se já existe a fundação de código para baixar o "PDF do Orçamento". Traga esse PDF e instancie-o nos "Anexos" do Deal ativo no HubSpot.

### Protocolo de Validação
Antes de aplicar uploads/deploys das soluções para o fluxo acima, acione o `build_probe.sh` para a skill em questão provando a estabilidade da sintaxe (TypeScript e Node) via `// turbo`. Mantenha-me atualizado informando em qual item estamos focando via comandos `notify_user`!
