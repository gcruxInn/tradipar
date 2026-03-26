# 🔍 Descobrir Nomes Corretos dos Campos Sankhya

Os campos `OBS_INTERNA`, `ROTA_ENTREGA_1`, `ROTA_ENTREGA_2` podem estar com nomes diferentes no banco de dados.

## 🔧 Executar estas queries no endpoint `/debug/sql`

### Query 1: Encontrar campos com ROTA no nome
```sql
SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TGFCAB' AND UPPER(COLUMN_NAME) LIKE '%ROTA%' ORDER BY COLUMN_NAME
```

**Via curl:**
```bash
curl -X POST https://api.gcrux.com/debug/sql \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = '\''TGFCAB'\'' AND UPPER(COLUMN_NAME) LIKE '\''%ROTA%'\'' ORDER BY COLUMN_NAME"
  }'
```

### Query 2: Encontrar campos com OBS/OBSERV
```sql
SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TGFCAB' AND (UPPER(COLUMN_NAME) LIKE '%OBS%' OR UPPER(COLUMN_NAME) LIKE '%OBSERV%') ORDER BY COLUMN_NAME
```

**Via curl:**
```bash
curl -X POST https://api.gcrux.com/debug/sql \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = '\''TGFCAB'\'' AND (UPPER(COLUMN_NAME) LIKE '\''%OBS%'\'' OR UPPER(COLUMN_NAME) LIKE '\''%OBSERV%'\'') ORDER BY COLUMN_NAME"
  }'
```

### Query 3: Ver exemplo de dados TGFCAB (NUNOTA 461982)
```sql
SELECT NUNOTA, OBSERVACAO, OBS_INTERNA FROM TGFCAB WHERE NUNOTA = 461982
```

**Via curl:**
```bash
curl -X POST https://api.gcrux.com/debug/sql \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT NUNOTA, OBSERVACAO, OBS_INTERNA FROM TGFCAB WHERE NUNOTA = 461982"
  }'
```

### Query 4: Ver todas as colunas TGFCAB com nomes contendo RO, OBS, ENT
```sql
SELECT COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TGFCAB' AND (UPPER(COLUMN_NAME) LIKE '%RO%' OR UPPER(COLUMN_NAME) LIKE '%OBS%' OR UPPER(COLUMN_NAME) LIKE '%ENT%') ORDER BY COLUMN_NAME
```

---

## 📋 Esperado

Você deve ver respostas como:
- Campos com **ROTA**: `ROTA_ENTREGA`, `ROTAENTREGA`, `ROTA1`, `ROTA2`, etc.
- Campos com **OBS**: `OBSERVACAO`, `OBS_INTERNA`, `OBSINTERNAL`, etc.

Execute as queries acima e **compartilhe os resultados** para que eu possa atualizar o código com os nomes corretos!

---

Co-Authored-By: Claude Haiku 4.5 <noreply@anthropic.com>
