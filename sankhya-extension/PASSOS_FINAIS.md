# 🚀 Passo a Passo FINAL - Deploy HubSpot Gateway

## ✅ **PARTE 1: Compilar o JAR (WSL Local)**

```bash
# 1. Abrir terminal WSL (no Windows: Win+R → wsl)
cd /home/rochagabriel/dev/tradipar/sankhya-extension

# 2. Dar permissão de execução ao script
chmod +x build_gateway.sh

# 3. Executar o build
./build_gateway.sh
```

**Resultado esperado:**
```
✅ SUCESSO: HubSpotGateway.jar criado!
  Caminho: /home/rochagabriel/dev/tradipar/sankhya-extension/build/HubSpotGateway.jar
```

---

## ✅ **PARTE 2: Instalar JAR no Sankhya (Navegador)**

1. Abrir `https://snkbrt01502.ativy.com` no navegador
2. Login com usuário **SUP** ou **Admin**
3. Menu → **Administração** → **Extensões**
4. Clicar **"Instalar/Atualizar Extensão"**
5. Selecionar arquivo:
   ```
   \\wsl.localhost\Ubuntu-22.04\home\rochagabriel\dev\tradipar\sankhya-extension\build\HubSpotGateway.jar
   ```
6. Aguardar confirmação
7. Se solicitar, **reiniciar servidor de aplicações**

---

## ✅ **PARTE 3: Deploy Backend Node.js (SSH gcrux-api)**

```bash
# 1. SSH no servidor
ssh gcrux-api@panel.gcrux.com.br

# 2. Navegar até o projeto
cd ~/htdocs/api.gcrux.com/aws-server-alef

# 3. Rebuild Docker
docker compose down
docker compose up -d --build

# 4. Monitorar logs
docker logs -f api-precos-sankhya
# Pressione Ctrl+C para sair
```

---

## ✅ **PARTE 4: Testar End-to-End**

### No terminal SSH (monitorar logs):
```bash
docker logs -f api-precos-sankhya
```

### No HubSpot (navegador):
1. Abrir um Deal
2. Clicar em **"Confirmar Orçamento"**

### Logs esperados:
```
[CONFIRM-QUOTE] Call HubSpot.execute (action=confirmQuote) NUNOTA 461512...
[CONFIRM-QUOTE] Gateway response: {"status":"1","message":"Orçamento confirmado..."}
[CONFIRM-QUOTE] NUNOTA 461512 confirmed successfully via Gateway
```

---

## 🚨 **Troubleshooting**

### Erro na Compilação?
```bash
# Verificar se JDK está instalado
javac -version

# Se não tiver:
sudo apt update && sudo apt install -y default-jdk
```

### JAR não aparece no Sankhya?
- Verificar se o upload foi bem sucedido
- Reiniciar servidor Sankhya (via console ou web)
- Verificar logs: `/opt/wildfly/standalone/log/server.log`

### Erro no Node.js?
```bash
# Ver logs completos
docker logs api-precos-sankhya --tail 100

# Recriar container
docker compose down && docker compose up -d --build
```

---

## ✅ Checklist de Conclusão

- [ ] JAR compilado sem erros
- [ ] JAR instalado no Sankhya (visível em Extensões)
- [ ] Backend Node.js atualizado e rodando
- [ ] Teste de confirmação bem-sucedido no HubSpot
- [ ] Logs mostrando "confirmed successfully via Gateway"

**PRONTO!** 🎉
