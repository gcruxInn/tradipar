# EXECUTION_ORDER: Enterprise Refactor - Módulo 1 (Orçamento & Confirmação)

> **ATENÇÃO AGENTE**: Este documento orienta o início do "Módulo 1" da grande refatoração do legado `aws-server-alef` para a nova `tradipar-core-api` (TypeScript, MVC, OAuth 2.0).

## 1. Contexto da Tarefa
O objetivo principal agora é migrar toda a lógica financeira e de status do Orçamento (Quotes) do arquivo legado `index.js` (aws-server-alef) para a nova arquitetura em `tradipar-core-api`.
A `tradipar-core-api` já foi provisionada no servidor de produção (`api.gcrux.com`) rodando via Docker, e a porta 3005 do proxy Nginx agora aponta para ela.

O Módulo 1 engloba as **Operações de Orçamento & Confirmação (Prioridade 1 - Core Financeiro)**.

## 2. Arquivos Alvo (Caminho WSL absoluto)
Arquivos que devem ser criados/modificados na nova arquitetura:
- `\\wsl.localhost\Ubuntu-22.04\home\rochagabriel\dev\tradipar\tradipar-core-api\src\controllers\quote.controller.ts` (NOVO)
- `\\wsl.localhost\Ubuntu-22.04\home\rochagabriel\dev\tradipar\tradipar-core-api\src\services\quote.service.ts` (NOVO)
- `\\wsl.localhost\Ubuntu-22.04\home\rochagabriel\dev\tradipar\tradipar-core-api\src\app.ts` (Para registrar as novas rotas)
  
Arquivo legado (Apenas Leitura/Consulta, para extrair regras de negócio):
- `\\wsl.localhost\Ubuntu-22.04\home\rochagabriel\dev\tradipar\aws-server-alef\index.js`

## 3. Regras de Sintaxe (TypeScript / OOP / MVC)
- As integrações com o Sankhya devem usar estritamente o `SankhyaAdapter` já existente (que lida com OAuth 2.0 e `postGatewayWithRetry`).
- As integrações com o HubSpot devem usar o `HubSpotAdapter` criado.
- Manter o uso de tipagem genérica `<any>` se o JSON de retorno for muito dinâmico, mas priorizar interfaces sempre que possível.
- Nenhuma regra de negócio deve ficar no Controller; ele apenas pega a Request, valida, chama o Service e devolve a Response.

## 4. Código a Gerar (Especificação Técnica)
Você deve criar o `quote.controller.ts` e o `quote.service.ts` para assumir as seguintes rotas que hoje estão no legado:
- `POST /hubspot/create-quote` (Conversão de Deal Hubspot)
- `POST /hubspot/convert-to-order`
- `GET /hubspot/quote-status/:dealId`
- `POST /hubspot/confirm-quote` (Confirmação real - MGETIT)
- `GET /sankhya/check-profitability/:nunota` (Validação de Rentabilidade via LiberacaoLimitesSP)
- `GET /sankhya/generate-pdf/:nunota` (Geração de PDF do Orçamento)
- `POST /sankhya/pdf/attach` (Upload para HubSpot)

O código no `quote.service.ts` precisará replicar toda a lógica descrita nestes endpoints antigos do `index.js`, garantindo tratamento de erro aprimorado (try/catch + status HTTP corretos).

## 5. Firewall de Deploy
- [ ] O código TypeScript compila localmente sem erros? (`npm run build`)
- [ ] A injeção de dependências do adapter (HubSpot e Sankhya) está instanciada corretamente?
- [ ] O Payload de resposta final manteve o mesmo "contrato/JSON" que o Front-End (HubSpot UI Extension React) espera?
