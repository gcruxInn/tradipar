# PROXIMOS PASSOS - 2026-03-27
**Status:** Bug critico identificado - Confirmacao de Pedido
**Deal de Teste:** 58406348417 (POSTO GT 3)
**NUNOTA Orcamento:** 461981 | **NUNOTA Pedido:** 461982

---

## BUG CRITICO: isOrderConfirmed retorna TRUE para pedido NAO confirmado

### Sintoma
Ao clicar "Finalizar e Confirmar Pedido (#461982)", o frontend mostra:
> "Info: Este pedido ja esta confirmado! Seguindo para proxima etapa..."

Mas o pedido 461982 tem **STATUSNOTA='A'** (Aberto/Aguardando), NAO esta confirmado.

### Root Cause

**Arquivo:** `tradipar-core-api/src/services/quote.service.ts`, linhas 415-416

```typescript
// INCORRETO - 'A' (Aberto) esta sendo tratado como confirmado
const isConfirmed = quoteNrNota !== "0" && (quoteRow[2] === 'L' || quoteRow[2] === 'A');
const isOrderConfirmed = childrenDetails.some(r => r[1] === 1010 && (r[2] === 'L' || r[2] === 'A'));
```

**O problema:** O codigo trata STATUSNOTA='A' como confirmado, mas 'A' significa "Aberto/Aguardando Aprovacao".

### Mapeamento correto de STATUSNOTA no Sankhya

| STATUSNOTA | Significado | Confirmado? |
|---|---|---|
| 'P' | Pendente | NAO |
| 'A' | Aberto (Aguardando) | NAO |
| 'L' | Liberado | SIM (confirmado) |

### Dados do Discovery (log da API)

```
[getQuoteStatus] Discovery Result for 461981:
  461982: CODTIPOPER=1010, STATUSNOTA='A', NUMNOTA=0    <- Pedido ABERTO (nao confirmado!)
  461981: CODTIPOPER=999,  STATUSNOTA='L', NUMNOTA=159539 <- Orcamento LIBERADO (confirmado)
```

- `isConfirmed` = TRUE (quoteRow 461981 tem STATUSNOTA='L') - CORRETO
- `isOrderConfirmed` = TRUE (childRow 461982 tem STATUSNOTA='A') - **INCORRETO!**

### Fix necessario

```typescript
// CORRIGIDO - Apenas 'L' (Liberado) indica confirmacao real
const isConfirmed = quoteNrNota !== "0" && quoteRow[2] === 'L';
const isOrderConfirmed = childrenDetails.some(r => r[1] === 1010 && r[2] === 'L');
```

**Alternativa mais robusta** (usar campo PENDENTE da query):
```typescript
// PENDENTE='N' significa CONFIRMADO='S' no Sankhya
const isConfirmed = quoteNrNota !== "0" && quoteRow[6] === 'N';
const isOrderConfirmed = childrenDetails.some(r => r[1] === 1010 && r[6] === 'N');
```

### Impacto no buttonAction

Com o fix, o fluxo para Deal 58406348417 sera:
- `isConfirmed` = TRUE (orcamento 461981 esta 'L'/Liberado)
- `isOrderConfirmed` = FALSE (pedido 461982 esta 'A'/Aberto)
- `buttonAction` = "CONFIRM_ORDER" (ou similar para confirmar o pedido)

### Checklist para amanha

- [ ] Fix isOrderConfirmed: remover 'A' da condicao (apenas 'L')
- [ ] Verificar se precisa de um buttonAction "CONFIRM_ORDER" separado
- [ ] Testar: clicar "Confirmar Pedido" deve confirmar NUNOTA 461982 no Sankhya
- [ ] Verificar se apos confirmacao, STATUSNOTA muda de 'A' para 'L'
- [ ] Validar que o fluxo continua para "Faturar Pedido" apos confirmacao

---

## CONTEXTO ADICIONAL

### Attachment Fix (CONCLUIDO)
O download de arquivos do HubSpot foi corrigido nesta sessao:
- Usar `/files/v3/files/{id}/signed-url` para obter CDN URL
- Baixar binario com `axios` puro (sem auth headers)
- Re-upload com MIME type explicito
- Ver: `SESSION_ATTACHMENT_FIX_2026-03-26.md`

### Tasks pendentes do NEXT_STEPS anterior (2026-03-26)
- [ ] Corrigir inicializacao `sankhya_nu_nota_pedido` = "0" para TOP 1010
- [ ] Adicionar logging de evolucao
- [ ] Testar ciclo completo 999 -> 1010 -> 1100
- [ ] Documentar padrao de inicializacao em CLAUDE.md

---

## PRIORIDADE PARA AMANHA

1. **P0 - Fix isOrderConfirmed** (5min) - Remover 'A' da condicao
2. **P0 - Testar confirmacao do pedido 461982** - Deve funcionar apos fix
3. **P1 - Fix sankhya_nu_nota_pedido = "0"** - Inicializacao correta
4. **P2 - Testar ciclo 999 -> 1010 completo** - End-to-end

---

Co-Authored-By: Claude Sonnet 3.7 <noreply@anthropic.com>
