# Sankhya HubSpot Universal Gateway

Esta extensão implementa um **Gateway Universal** ("Serverless interno") para o Sankhya.
Ao invés de criar múltiplos serviços, expomos um único endpoint (`HubSpot.execute`) que roteia ações internamente via parâmetro `action`.

## Estrutura
- `br/com/innleaders/hubspot/HubSpotController.java`: Controller principal com Switch-Case de ações.
- `module.xml`: Registro do serviço `HubSpot.execute`.

## Ações Disponíveis
Atualmente implementadas:
- `confirmQuote` (Confirmação de Nota/Pedido)

Futuras (Exemplos):
- `checkStock`
- `convertOrder`
- `financialCheck`

## Como Compilar e Deployar

### 1. Requisitos
Bibliotecas do Sankhya (do servidor Wildfly/JBoss):
- `mge-model-core.jar`
- `sankhya-w-core.jar`
- `jdom.jar`
- `servlet-api.jar`

### 2. Compilação
```bash
mkdir build
javac -cp "path/to/sankhya-libs/*" -d build br/com/innleaders/hubspot/HubSpotController.java
```

### 3. Empacotar (Criar o JAR)
```bash
# Copiar o module.xml para a raiz do build
cp module.xml build/

# Criar o JAR
cd build
jar -cvf HubSpotGateway.jar *
```

### 4. Instalação
1. Logue no Sankhya (Usuário SUP/Admin).
2. Vá em **"Administração de Extensões"**.
3. Instale o arquivo `HubSpotGateway.jar`.
4. Reinicie o servidor de aplicações se necessário.

## Teste de API
**Endpoint:**
`POST /gateway/v1/mge/service.sbr?serviceName=HubSpot.execute`

**Payload:**
```json
{
    "serviceName": "HubSpot.execute",
    "requestBody": {
        "action": "confirmQuote",
        "nuNota": 12345
    }
}
```
