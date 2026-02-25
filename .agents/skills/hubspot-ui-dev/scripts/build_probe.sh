#!/bin/bash
# Autovalidação rigorosa do HubSpot UI Extension
echo "Iniciando probe do UI Specialist..."
cd sankhya-integration-innleaders || { echo "❌ Diretório sankhya-integration-innleaders ausente."; exit 1; }

# Valida com CLI oficial do HubSpot usando npx fallback com nome do pacote
echo "[Probe] Executando validação de sintaxe HubSpot CLI..."
npx -p @hubspot/cli hs project validate || { echo "❌ Falha no hubspot cli validate. Abortando deploy."; exit 1; }

echo "✅ build_probe (hubspot-ui-dev) concluído com sucesso. UI limpo e pronto para deploy."
