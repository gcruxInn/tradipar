#!/bin/bash
# Probe Integridade ERP Core
echo "Iniciando probe do ERP Core Integrator..."

if [ ! -f "build.sh" ]; then
    echo "❌ Arquivo build.sh não encontrado na raiz."
    exit 1
fi

echo "[Probe] Arquitetura base detectada."
echo "[Probe] Utilize ./build.sh explicitamente caso o usuário autorize a compilação cruzada completa."
echo "✅ build_probe (sankhya-java-dev) integridade física okay."
