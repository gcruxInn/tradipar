#!/bin/bash

# ==========================================
# BUILD: HubSpot Gateway Extension JAR
# ==========================================

set -e

PROJECT_DIR="/home/rochagabriel/dev/tradipar"
EXTENSION_DIR="$PROJECT_DIR/sankhya-extension"
LIB_DIR="$PROJECT_DIR/lib"
OUT_DIR="$EXTENSION_DIR/build"
JAR_NAME="HubSpotGateway.jar"

echo "=========================================="
echo "  BUILD: $JAR_NAME"
echo "=========================================="

# Step 1: Clean
echo "[1/4] Limpando build anterior..."
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# Step 2: Build classpath (reusa as libs existentes)
echo "[2/4] Montando classpath..."
CLASSPATH=""
for jar in "$LIB_DIR"/*.jar; do
    # Ignorar Zone.Identifier files
    if [[ ! "$jar" == *"Zone.Identifier"* ]]; then
        CLASSPATH="$CLASSPATH:$jar"
    fi
done
CLASSPATH=${CLASSPATH:1}  # Remove leading colon

echo "  Bibliotecas carregadas: $(echo $CLASSPATH | tr ':' '\n' | wc -l)"

# Step 3: Compile
echo "[3/4] Compilando HubSpotController.java..."
javac \
    -source 1.8 \
    -target 1.8 \
    -encoding UTF-8 \
    -d "$OUT_DIR" \
    -cp "$CLASSPATH" \
    "$EXTENSION_DIR/br/com/innleaders/hubspot/HubSpotController.java"

# Contar classes compiladas
CLASS_COUNT=$(find "$OUT_DIR" -name "*.class" | wc -l)
echo "  Classes compiladas: $CLASS_COUNT"

# Step 4: Copiar module.xml
echo "  Copiando module.xml..."
cp "$EXTENSION_DIR/module.xml" "$OUT_DIR/"

# Step 5: Package JAR
echo "[4/4] Empacotando JAR..."
cd "$OUT_DIR"
jar cf "$JAR_NAME" *

echo "=========================================="
echo "✅ SUCESSO: $JAR_NAME criado!"
echo "  Caminho: $OUT_DIR/$JAR_NAME"
echo "  Tamanho: $(du -h $JAR_NAME | cut -f1)"
echo "=========================================="

# Show contents
echo ""
echo "Conteúdo do JAR:"
jar tf "$JAR_NAME" | grep -v "/$"
