#!/bin/bash
# ============================================================
# BUILD SCRIPT - DiagnosticoPrecos Probe
# Tradipar HubSpot Integration
# ============================================================

set -e

PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"
SRC_DIR="$PROJECT_ROOT/src"
BIN_DIR="$PROJECT_ROOT/bin"
LIB_DIR="$PROJECT_ROOT/lib"
JAR_NAME="DiagnosticoPrecos.jar"

echo "=========================================="
echo "  BUILD: DiagnosticoPrecos.jar"
echo "=========================================="

# Step 1: Clean
echo "[1/3] Limpando arquivos antigos..."
rm -rf "$BIN_DIR/br"
rm -f "$PROJECT_ROOT/$JAR_NAME"

# Step 2: Create bin directory if not exists
mkdir -p "$BIN_DIR"

# Step 3: Build classpath from lib/*.jar
if [ -d "$LIB_DIR" ] && [ "$(ls -A $LIB_DIR/*.jar 2>/dev/null)" ]; then
    CLASSPATH="$LIB_DIR/*"
else
    echo "[WARN] Diretorio lib/ vazio ou inexistente. Usando classpath vazio."
    CLASSPATH=""
fi

# Step 4: Compile
echo "[2/3] Compilando para Java 1.8..."
javac -source 1.8 -target 1.8 \
    -encoding UTF-8 \
    -cp "$CLASSPATH" \
    -d "$BIN_DIR" \
    "$SRC_DIR/br/com/acg/hubspot/tradipar/integracao/action/DiagnosticoPrecos.java"

if [ $? -ne 0 ]; then
    echo "=========================================="
    echo "  FALHA NA COMPILACAO"
    echo "=========================================="
    exit 1
fi

# Step 5: Package JAR
echo "[3/3] Empacotando JAR..."
cd "$BIN_DIR"
jar cf "$PROJECT_ROOT/$JAR_NAME" br/

if [ $? -eq 0 ]; then
    echo "=========================================="
    echo "  SUCESSO: $JAR_NAME criado"
    echo "  Caminho: $PROJECT_ROOT/$JAR_NAME"
    echo "=========================================="
else
    echo "=========================================="
    echo "  FALHA AO CRIAR JAR"
    echo "=========================================="
    exit 1
fi
