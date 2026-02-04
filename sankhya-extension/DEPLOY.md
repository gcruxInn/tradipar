# 🚀 Guia de Deploy - HubSpot Gateway Universal

## Pré-Requisitos

### 1. JDK Instalado
```bash
java -version  # Deve ser Java 8+
javac -version
```

### 2. Bibliotecas do Sankhya
Localize estas bibliotecas no servidor Sankhya (geralmente em `/opt/wildfly/modules/` ou similar):
- `mge-model-core.jar`
- `sankhya-w-core.jar`  
- `jdom.jar`
- `servlet-api.jar`

Copie-as para uma pasta local, exemplo: `~/sankhya-libs/`

---

## Passo a Passo de Compilação

### Passo 1: Navegar até o diretório da extensão
```bash
cd ~/htdocs/api.gcrux.com/sankhya-extension
```

### Passo 2: Criar diretório de build
```bash
mkdir -p build
```

### Passo 3: Compilar o código Java
```bash
javac -cp "/caminho/para/sankhya-libs/*" \
      -d build \
      -encoding UTF-8 \
      br/com/innleaders/hubspot/HubSpotController.java
```

**Substitua** `/caminho/para/sankhya-libs/` pelo caminho real onde estão os JARs!

### Passo 4: Copiar module.xml para o build
```bash
cp module.xml build/
```

### Passo 5: Criar o JAR
```bash
cd build
jar -cvf HubSpotGateway.jar *
cd ..
```

O arquivo `build/HubSpotGateway.jar` está pronto! ✅

---

## Deploy no Sankhya

### Opção A: Via Interface Web (Recomendado)

1. Acesse o Sankhya com usuário **SUP** ou **Administrador**
2. Vá em: **Menu → Administração → Extensões**
3. Clique em **"Instalar/Atualizar Extensão"**
4. Selecione o arquivo `HubSpotGateway.jar`
5. Aguarde a confirmação de instalação
6. **Reinicie o servidor de aplicações** (se solicitado)

### Opção B: Via Linha de Comando (Servidor)

Se você tem acesso SSH ao servidor Sankhya:

```bash
# Copiar JAR para pasta de extensões
scp build/HubSpotGateway.jar usuario@servidor-sankhya:/opt/sankhya/extensions/

# SSH no servidor
ssh usuario@servidor-sankhya

# Reiniciar Wildfly/JBoss
sudo systemctl restart wildfly
```

---

## Verificação

### 1. Verificar se o serviço foi registrado
No Sankhya, vá em **Administração → Extensões** e procure por `HubSpotExtension`.
O serviço `HubSpot.execute` deve aparecer listado.

### 2. Testar via Postman/cURL

```bash
# Obter token primeiro (se ainda não tiver)
curl -X POST https://snkbrt01502.ativy.com/mge/service.sbr?serviceName=MobileLoginSP.login \
  -H "Content-Type: application/json" \
  -d '{
    "serviceName": "MobileLoginSP.login",
    "requestBody": {
      "NOMUSU": {"$": "SEU_USUARIO"},
      "SENHA": {"$": "SUA_SENHA"}
    }
  }'

# Usar o token para testar confirmação (substituir NUNOTA real)
curl -X POST "https://snkbrt01502.ativy.com/mge/service.sbr?serviceName=HubSpot.execute&outputType=json" \
  -H "Authorization: Bearer SEU_TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "serviceName": "HubSpot.execute",
    "requestBody": {
      "action": "confirmQuote",
      "nuNota": 461512
    }
  }'
```

**Resposta esperada de sucesso:**
```json
{
  "status": "1",
  "message": "Orçamento confirmado com sucesso!",
  "nunota": "461512"
}
```

### 3. Atualizar Backend Node.js

```bash
cd ~/htdocs/api.gcrux.com/aws-server-alef
docker compose up -d --build
```

### 4. Testar End-to-End no HubSpot

1. Abra um Deal no HubSpot
2. Crie um orçamento
3. Clique em **"Confirmar Orçamento"**
4. Verifique nos logs do backend:
   ```bash
   docker logs api-precos-sankhya
   ```
   Deve aparecer: `[CONFIRM-QUOTE] NUNOTA XXXXX confirmed successfully via Gateway`

---

## Troubleshooting

### Erro: "Service HubSpot.execute not found"
- Verifique se o JAR foi instalado corretamente
- Reinicie o servidor de aplicações
- Confira nos logs do Wildfly: `/opt/wildfly/standalone/log/server.log`

### Erro de Compilação
- Verifique se todos os JARs do Sankhya estão no classpath
- Verifique a versão do Java (deve ser compatível com o Sankhya)

### Erro: "NUNOTA não encontrado"
- Verifique se o NUNOTA realmente existe no Sankhya
- Verifique se o NUNOTA ainda está com STATUSNOTA = 'P' (Pendente)

---

## ✅ Checklist Final

- [ ] Código compilado sem erros
- [ ] JAR criado com sucesso
- [ ] JAR instalado no Sankhya
- [ ] Servidor reiniciado
- [ ] Teste via cURL/Postman bem-sucedido
- [ ] Backend Node.js atualizado e rodando
- [ ] Teste end-to-end no HubSpot funcionando

---

**Parabéns!** 🎉 Sua integração HubSpot → Sankhya Gateway está rodando!
