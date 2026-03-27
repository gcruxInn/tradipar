# Sankhya DB Discovery

Execute queries de discovery no banco de dados Sankhya via endpoint `https://api.gcrux.com/debug/sql`.

## Instrucoes

O usuario vai informar o que quer descobrir como argumento: $ARGUMENTS

Use o script Node em `/tmp/sankhya_discovery.js` para executar queries SQL no banco Oracle do Sankhya. O script aceita queries via argumentos de linha de comando.

### Como executar queries

```bash
node /tmp/sankhya_discovery.js "SELECT COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TGFCAB' ORDER BY COLUMN_ID"
```

### Queries uteis de referencia

**Listar todas as tabelas:**
```sql
SELECT TABLE_NAME FROM USER_TABLES ORDER BY TABLE_NAME
```

**Listar colunas de uma tabela:**
```sql
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH, NULLABLE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'NOME_TABELA' ORDER BY COLUMN_ID
```

**Buscar tabelas por nome:**
```sql
SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE '%TERMO%' ORDER BY TABLE_NAME
```

**Buscar colunas por nome em todas as tabelas:**
```sql
SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS WHERE COLUMN_NAME LIKE '%TERMO%' AND TABLE_NAME LIKE 'TGF%' ORDER BY TABLE_NAME
```

**Listar Views:**
```sql
SELECT VIEW_NAME FROM USER_VIEWS ORDER BY VIEW_NAME
```

**Listar Procedures:**
```sql
SELECT OBJECT_NAME, OBJECT_TYPE FROM USER_OBJECTS WHERE OBJECT_TYPE IN ('PROCEDURE','FUNCTION','TRIGGER') ORDER BY OBJECT_TYPE, OBJECT_NAME
```

**Campos custom (AD_) de uma tabela:**
```sql
SELECT COLUMN_NAME, DATA_TYPE, DATA_LENGTH FROM USER_TAB_COLUMNS WHERE TABLE_NAME = 'TGFCAB' AND COLUMN_NAME LIKE 'AD_%' ORDER BY COLUMN_NAME
```

**Dados de exemplo:**
```sql
SELECT * FROM NOME_TABELA WHERE ROWNUM <= 5
```

**Foreign Keys de uma tabela:**
```sql
SELECT a.CONSTRAINT_NAME, a.COLUMN_NAME, c.TABLE_NAME AS REF_TABLE, c.COLUMN_NAME AS REF_COLUMN FROM USER_CONS_COLUMNS a JOIN USER_CONSTRAINTS b ON a.CONSTRAINT_NAME = b.CONSTRAINT_NAME JOIN USER_CONS_COLUMNS c ON b.R_CONSTRAINT_NAME = c.CONSTRAINT_NAME WHERE b.CONSTRAINT_TYPE = 'R' AND a.TABLE_NAME = 'NOME_TABELA' ORDER BY a.CONSTRAINT_NAME
```

### Tabelas principais conhecidas

| Tabela | Descricao |
|--------|-----------|
| TGFCAB | Cabecalho da Nota (Pedidos) |
| TGFITE | Itens da Nota |
| TGFTOP | Tipos de Operacao (TOP) |
| TGFPAR | Parceiros (Clientes/Fornecedores) |
| TGFPRO | Produtos |
| TGFROT | Rotas (apenas 2 registros ativos) |
| TGFEST | Estoque |
| TGFFIN | Financeiro |
| TGFVEN | Vendedores |

### Campos custom (AD_) do TGFCAB descobertos

| Campo | Tipo | Tamanho | Descricao provavel |
|-------|------|---------|-------------------|
| AD_CODEMP1 | NUMBER | 22 | Codigo Empresa |
| AD_CODPROJ | NUMBER | 22 | Codigo Projeto |
| AD_CODREGENTREGA | NUMBER | 22 | Codigo Regiao Entrega |
| AD_DEALHUB | NUMBER | 22 | Deal ID HubSpot |
| AD_OBSERVACAOINTERNA | VARCHAR2 | 4000 | Observacao Interna |
| AD_ROTSEP | VARCHAR2 | 10 | Rota Separacao |
| AD_VINCULO | VARCHAR2 | 100 | Vinculo |

### Processo de investigacao

1. Primeiro busque a estrutura da tabela (colunas, tipos)
2. Busque dados de exemplo com ROWNUM <= 5
3. Busque foreign keys para entender relacionamentos
4. Busque campos custom (AD_) se relevante
5. Apresente os resultados em formato tabular ao usuario
