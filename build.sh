#!/bin/bash

# ==========================================
# BUILD: Tradipar HubSpot Integration v2.0
# ==========================================

set -e

PROJECT_DIR="/home/rochagabriel/dev/tradipar"
SRC_DIR="$PROJECT_DIR/src"
OUT_DIR="$PROJECT_DIR/build"
LIB_DIR="$PROJECT_DIR/lib"
JAR_NAME="TradiparHubspot-v2.0.jar"

echo "=========================================="
echo "  BUILD: $JAR_NAME"
echo "=========================================="

# Step 1: Clean
echo "[1/4] Limpando arquivos antigos..."
rm -rf "$OUT_DIR"
rm -f "$PROJECT_DIR/$JAR_NAME"
mkdir -p "$OUT_DIR"

# Step 2: Build classpath
echo "[2/4] Montando classpath..."
CLASSPATH=""
for jar in "$LIB_DIR"/*.jar; do
    if [[ ! "$jar" == *":Zone.Identifier"* ]]; then
        CLASSPATH="$CLASSPATH:$jar"
    fi
done
CLASSPATH=${CLASSPATH:1}  # Remove leading colon

# Step 3: Compile
echo "[3/4] Compilando para Java 1.8..."
find "$SRC_DIR" -name "*.java" | xargs javac \
    -source 1.8 \
    -target 1.8 \
    -encoding UTF-8 \
    -d "$OUT_DIR" \
    -cp "$CLASSPATH"

# Count compiled classes
CLASS_COUNT=$(find "$OUT_DIR" -name "*.class" | wc -l)
echo "     Classes compiladas: $CLASS_COUNT"

# Step 4: Package
echo "[4/4] Empacotando JAR..."
cd "$OUT_DIR"
jar cf "$PROJECT_DIR/$JAR_NAME" *

echo "=========================================="
echo "  SUCESSO: $JAR_NAME criado"
echo "  Caminho: $PROJECT_DIR/$JAR_NAME"
echo "=========================================="

# List contents
echo ""
echo "Conteúdo do JAR:"
jar tf "$PROJECT_DIR/$JAR_NAME" | grep -E "\.class$"
