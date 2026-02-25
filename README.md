# Tradipar HubSpot Integration Ecosystem (AI-Driven)

Ecossistema de integração entre Sankhya ERP e HubSpot CRM, focado em automação de tabelas de preços, estoque e sincronização de dados mestres. 
**Este repositório é ativamente gerido por Agentes Especializados de IA (Antigravity).**

## Componentes

### 🤖 0. [Inteligência Artificial (Agentes)](file:///./.agents/)
Framework de multi-agentes autônomos que orquestram validações, builds e refatorações no ecossistema (UI, Proxy Node.js e Java Core). Responsável pela "Self-Healing Memory" e "Safe-Publish Protocols".

### 1. [Java Cloud Integration](file:///./src/)
Núcleo da integração "Set and Forget". Responsável pelo sync pesado de dados.
- **Local:** Rodando dentro do Sankhya (Actions/Scheduled).
- **Recursos:** Sync de Produtos, Importação de Clientes, Diagnóstico de Schema.

### 2. [Node.js Proxy (AWS Server Alef)](file:///./aws-server-alef/)
Camada intermediária resiliente para consultas em tempo real e orquestração de pedidos.
- **Local:** VPS/Dedicated (Docker).
- **Recursos:**
    - **Gestão de Itens de Linha**: Endpoints CRUD para Adicionar, Duplicar e Excluir itens no Deal.
    - **Pesquisa Híbrida**: Integração com HubSpot Product Library mantendo o vínculo (`codProd`) com o Sankhya.
    - **Rentabilidade & Lotes**: Consulta de controles (lotes) em tempo real e cálculo de lucratividade via Sankhya.
    - **Self-Healing Session Recovery**: Auto-login no Sankhya para evitar falhas por timeout.

### 3. [HubSpot UI Extension](file:///./sankhya-integration-innleaders/)
Interface do usuário rica integrada diretamente ao Deal Record (CRM Card).
- **Recursos:**
    - **Seleção Dinâmica de Lote**: Dropdown alimentado por estoque real e controle.
    - **Ações de Item**: Duplicação e exclusão rápida diretamente na tabela de itens.
    - **Preço Personalizado**: Modal para ajuste manual de preços unitários ou totais.
    - **Pesquisa de Produtos**: Busca integrada nos produtos sincronizados do HubSpot.

## Princípios de Arquitetura

- **Resiliência (Self-Healing)**: O Proxy detecta sessões Sankhya expiradas e renova o token automaticamente.
- **Sincronização de Estado**: Atualização instantânea da UI (Optimistic UI) combinada com o `refreshObjectProperties` do HubSpot.
- **Estabilidade**: Componentes refatorados para seguir as `best practices` das Extensões de UI da HubSpot (modais de raiz, hooks otimizados).

## Build & Deploy

### Sankhya (Java)
```bash
./build.sh # Gera os JARs na pasta build/
```

### Proxy (Node.js/Docker)
Rodando no servidor em `~/htdocs/api.gcrux.com/aws-server-alef/`:
```bash
# Sincronizar arquivos para o servidor
scp aws-server-alef/index.js user@host:~/path/

# Rebuildar e subir container
sudo docker compose up -d --build
```

### Frontend (HubSpot Extension)
```bash
cd sankhya-integration-innleaders
hs project upload
```

## Estrutura do Repositório

```
tradipar/
├── .agents/                       # 🤖 Skills e Workflows dos Agentes Antigravity
│   ├── skills/                    # SKILL.md compartimentadas (UI, Proxy, Core)
│   └── workflows/                 # Pipelines de deploy autônomos (Peace Protocol)
├── aws-server-alef/               # Servidor Proxy Node.js (Docker)
├── sankhya-integration-innleaders/ # Projeto HubSpot UI Extension (React/TypeScript)
├── src/                           # Código Fonte Java (Core Sankhya)
├── build.sh                       # Script de Build Java
└── README.md
```

## Status Atual (Phase 13 Concluída) ✅
- [x] Multi-Item CRUD (Adição/Duplicação/Exclusão).
- [x] Seleção de Lote Dinâmica via Sankhya.
- [x] Pesquisa de Produtos via HubSpot Library.
- [x] Estabilidade de UI & Refatoração (Fix React Crash #310).

## Próximos Passos (Phase 14)
- Automações de Workflow para criação de Deals via API.
- Melhoria no log de auditoria de conversões para Pedido.
- Sincronização de propriedades de frete baseada em tabelas de frete Sankhya.
