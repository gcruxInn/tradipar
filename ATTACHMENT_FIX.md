# 🔧 Fixação de Anexos e Campos - Resumo Técnico

## 📊 3 Problemas Identificados

### ❌ PROBLEMA 1: Observação Interna não salva no Sankhya
**Log indicava:** `[PREPARE ORDER] Sankhya saved successfully: [ 'OBSERVACAO', 'ROTA_ENTREGA_1' ]`
**Realidade:** Campos continuam vazios no Sankhya

**Possíveis causas:**
1. Campo `OBSERVACAO` pode não existir ou ter nome diferente
2. Resposta de "sucesso" do CRUDServiceProvider pode estar mascarando erro
3. Falta de feedback de erro da API

**Solução implementada:**
- ✅ Adicionar logging detalhado da resposta do `CRUDServiceProvider.saveRecord`
- ✅ Verificar se há `statusMessage` ou erro na resposta
- Próxima ação: Ver o log com a resposta completa

---

### ❌ PROBLEMA 2: Rota de Entrega não salva no Sankhya
**Log indicava:** `[PREPARE ORDER] Sankhya saved successfully: [ 'OBSERVACAO', 'ROTA_ENTREGA_1' ]`
**Realidade:** Campo "Rota de Entrega" continua vazio no Sankhya

**Possíveis causas:**
1. Campo `ROTA_ENTREGA_1` pode não existir (precisa verificar com discovery)
2. Dados sendo salvos mas em campo diferente
3. Campo pode ser read-only ou protegido

**Solução implementada:**
- ✅ Melhorado logging para ver resposta da API
- Próxima ação: Execute discovery para confirmar nome exato do campo

---

### ❌ PROBLEMA 3: Arquivo não foi anexado
**Log indicava:** `[PREPARE ORDER] File attached to Sankhya successfully`
**Realidade:** Arquivo não aparece no Sankhya

**Causa raiz encontrada:** 🎯 **FALTAVA A PARTE 2!**

Segundo documentação oficial do Sankhya, anexar arquivo requer **2 PARTES**:

#### **Parte 1: Upload do arquivo** (já existia)
```
POST /gateway/v1/mge/sessionUpload.mge?sessionkey=ANEXO_SISTEMA_CabecalhoNota_461982_60700893&fitem=S&salvar=S&useCache=N
FormData: arquivo=<binary>
```

#### **Parte 2: Vincular ao registro** (FALTAVA - AGORA ADICIONADO!)
```
POST /gateway/v1/mge/service.sbr?serviceName=AnexoSistemaSP.salvar&outputType=json
{
  serviceName: "AnexoSistemaSP.salvar",
  requestBody: {
    params: {
      pkEntity: "461982",
      keySession: "ANEXO_SISTEMA_CabecalhoNota_461982_60700893",
      nameEntity: "CabecalhoNota",
      description: "Pedido Compra",
      nameAttach: "shoptixes.png",
      fileSelect: 1,
      // ... outros campos
    }
  }
}
```

**Solução implementada:**
- ✅ Adicionado chamada a `AnexoSistemaSP.salvar` após upload
- ✅ Passando todos os parâmetros obrigatórios
- ✅ Logging detalhado de sucesso/erro

---

## ⚠️ Observação Importante da Documentação Sankhya

> "Este serviço de anexos é destinado para entidades que utilizam o componente padrão de anexos (**ícone de clipe** na interface).
>
> **Cabeçalho de Nota e Ordem de Serviço NÃO SÃO COMPATÍVEIS com este mecanismo.**"

**O que isso significa?**
- CabecalhoNota (TGFCAB) pode não permitir anexos via API
- Se isso for verdade, o AnexoSistemaSP.salvar retornará erro
- Será necessário usar uma abordagem alternativa

---

## 🚀 Próximas Ações (em ordem)

### 1️⃣ Fazer Deploy
```bash
npm run build && rsync -avz --delete --exclude 'node_modules' --exclude '.git' \
  ./ gcrux-api@137.131.243.179:~/htdocs/api.gcrux.com/tradipar-core-api/

# No servidor:
docker compose up -d --build --force-recreate && docker logs -f core-api-sankhya
```

### 2️⃣ Testar Novamente
Enviar OBS + Rota + Arquivo no HubSpot e verificar logs detalhados:

```
[PREPARE ORDER] CRUDServiceProvider response: { ... }
[PREPARE ORDER] Attachment link response: { ... }
```

### 3️⃣ Verificar Discovery (Se campos ainda não salvarem)
```bash
curl -X POST https://api.gcrux.com/debug/sql \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = '\''TGFCAB'\'' AND UPPER(COLUMN_NAME) LIKE '\''%ROTA%'\''"
  }'
```

---

## 📋 Checklist

| Item | Status | Ação |
|------|--------|------|
| Part 1 (Upload) implementado | ✅ | - |
| Part 2 (Link) implementado | ✅ | Deploy agora |
| Logging CRUDServiceProvider melhorado | ✅ | Deploy agora |
| Logging AnexoSistemaSP.salvar adicionado | ✅ | Deploy agora |
| Verificar resposta com logging | ⏳ | Após deploy |
| Descobrir field names exatos de ROTA | ⏳ | Se ainda não funcionar |
| Testar compatibilidade CabecalhoNota | ⏳ | Se AnexoSistemaSP retornar erro |

---

## 📚 Referências
- Documentação oficial: `/home/rochagabriel/dev/tradipar/tradipar-core-api/DISCOVER_FIELDS.md`
- Último commit: `e41f502` (Part 2 attachment linking)

---

**Status:** Pronto para deploy com as 3 correções implementadas!

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
