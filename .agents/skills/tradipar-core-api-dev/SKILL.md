---
name: tradipar-core-api-dev
description: Habilidade para o novo framework set-and-forget Node.js/TypeScript (Tradipar Core API), focando em OAuth2 Sankhya M2M e integração Real-Time via Webhooks.
---

# Tradipar Core API Dev (Enterprise Framework)

Você atua na camada da nova **Enterprise Core API** (`tradipar-core-api/`). Este é o ecossistema sucessor do antigo `aws-server-alef`. É construído com princípios *Enterprise Grade*, tipagem forte (TypeScript), padrão MVC (Controllers/Services/Adapters) e arquitetura Event-Driven.

## Protocolos e Restrições Absolutas

1. **Autenticação Padrão M2M (Machine-to-Machine):**
   - **NUNCA** utilize o fluxo legado de `JSESSIONID` via `mge/service.sbr` com usuário e senha.
   - **SEMPRE** utilize o adaptador `sankhya.api.ts` que implementa o fluxo *OAuth 2.0 Client Credentials* usando `Client ID`, `Client Secret` e `X-Token`.
   - A geração do token Bearer deve ser injetada de forma invisível via interceptors do Axios (`sankhya.api.ts`) e cacheados em memória para reaproveitamento seguro antes do término do prazo de expiração (normalmente 300 segundos, atualizar 30s antes).
   - O endpoint de autenticação é de formato `URL Encoded form data` com `grant_type=client_credentials` em `/authenticate` (NÃO `/api/authenticate`).

2. **Arquitetura Modular (MVC / Separation of Concerns):**
   - **Adapters (`/adapters`):** Isolam o acesso ao mundo externo (Sankhya, HubSpot). Nenhuma regra de negócio deve residir nestes arquivos.
   - **Controllers (`/controllers`):** Recebem as requisições HTTP REST ou webhooks de outras aplicações. Validam o payload da entrada e delegam para a camada de Serviços. 
   - **Services (`/services`):** Onde reside a essência das regras de negócio. É a camada ideal para orquestrar dados de orçamentos, lidar com retentativas, e orquestrar múltiplos adapters.

3. **Event-Driven e Webhooks Nativos Sankhya:**
   - Para atualizações de status vindas do ERP Sankhya, **NÃO crie mecanismos de pooling (pesquisa contínua)**. 
   - Utilize webhooks passivos que aguardam disparos originados por extensões Java nativas do SDK Sankhya Om API do ERP (`@Service`). Isso muda a arquitetura de "Pull" para "Push Real-Time".

4. **Tratamento de Erros e Logs Resilientes:**
   - Faça logging claro de erros ressaltando a raiz do problema. A resposta de API falha muitas vezes com objetos profundos de erro (ex: `e.response?.data?.error?.descricao`). Não esconda esses detalhes cruciais nos logs.
   - A API não pode ter quedas drásticas (crashes irrecuperáveis). Capture erros na borda (Controllers) e garanta que chegue o status 500 elegante para o chamador, ao mesmo tempo que logue tudo no servidor.

5. **Engenharia de Tipos "Strict Mode":**
   - É inegociável manter o `tsconfig.json` em `"strict": true`. Tipagem rigorosa é fundamental.
   - Compile e passe a validação TypeScript perfeitamente usando (`npm run build`) para assegurar a construção da versão `dist/`.

## Mindset do Agente
- *Construa de Forma Blindada*: Você está migrando uma herança complexa. A funcionalidade anterior tem manhas, mas a nova implementação devera sanar de forma definitiva as intermitências. Traga a lógica pro typescript apenas da forma que obedeça aos 5 pontos acima.
