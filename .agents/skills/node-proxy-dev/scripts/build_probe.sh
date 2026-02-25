#!/bin/bash
# Autovalidação do Servidor Node.js
echo "Iniciando probe do Proxy Orchestrator..."
cd aws-server-alef || { echo "❌ Diretório aws-server-alef ausente."; exit 1; }

echo "[Probe] Verificando sintaxe de index.js..."
node -c index.js || { echo "❌ Erro fatal de sintaxe no Node.js. O container abortará se for submetido."; exit 1; }

echo "✅ build_probe (node-proxy-dev) concluído com sucesso. Código AWS Server limpo."
