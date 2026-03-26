#!/bin/bash

echo "=== Descobrindo campos de OBSERVACAO no TGFCAB ==="
curl -s -X POST https://api.gcrux.com/debug/sql \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = '\''TGFCAB'\'' AND UPPER(COLUMN_NAME) LIKE '\''%OBSERV%'\''"
  }' | jq .

echo ""
echo "=== Descobrindo campos de ROTA no TGFCAB ==="
curl -s -X POST https://api.gcrux.com/debug/sql \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT COLUMN_NAME, DATA_TYPE FROM USER_TAB_COLUMNS WHERE TABLE_NAME = '\''TGFCAB'\'' AND UPPER(COLUMN_NAME) LIKE '\''%ROTA%'\''"
  }' | jq .

echo ""
echo "=== Exemplo de dados TGFCAB com NUNOTA 461982 ==="
curl -s -X POST https://api.gcrux.com/debug/sql \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT * FROM TGFCAB WHERE NUNOTA = 461982"
  }' | jq .

echo ""
echo "=== Todas as colunas TGFCAB (primeiras 50) ==="
curl -s -X POST https://api.gcrux.com/debug/sql \
  -H "Content-Type: application/json" \
  -d '{
    "sql": "SELECT COLUMN_NAME FROM USER_TAB_COLUMNS WHERE TABLE_NAME = '\''TGFCAB'\'' ORDER BY COLUMN_NAME"
  }' | jq .
