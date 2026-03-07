# Tradipar HubSpot Integration Ecosystem (AI-Driven)

Ecossistema de integração entre Sankhya ERP e HubSpot CRM, focado em automação de tabelas de preços, estoque e sincronização de dados mestres. 
**Este repositório é ativamente gerido por Agentes Especializados de IA (Antigravity).**

## Componentes

### 🤖 0. [Inteligência Artificial (Agentes)](file:///./.agents/)
Framework de multi-agentes autônomos que orquestram validações, builds e refatorações no ecossistema (UI, Proxy Node.js e Java Core). Responsável pela "Self-Healing Memory" e "Safe-Publish Protocols".

### 1. [Tradipar Core API v2.0 (Framework Base)](file:///./tradipar-core-api/)
Novo motor construído em **Node.js + TypeScript**, focado em orquestração de alto desempenho.
-   **Local:** Oracle Cloud (Docker + Volumes).
-   **Recursos:**
    -   **Sankhya Gateway OAuth2**: Gerenciamento automático de tokens M2M.
    -   **PDF Attachment Engine**: Geração dinâmica de orçamentos e upload automático para o Sankhya e HubSpot Deal.
    -   **Orquestração Multi-Item**: Cálculos de rentabilidade e estoque para múltiplos itens em tempo real.
    -   **File Storage Fix**: Protocolo corrigido para upload de anexos via multipart/form-data.

### 2. [Java Cloud Integration (Sync Pesado)](file:///./src/)
Núcleo da integração "Set and Forget". Responsável pelo sync pesado de dados.
-   **Local:** Rodando dentro do Sankhya (Actions/Scheduled).
-   **Recursos:** Sync de Produtos, Importação de Clientes, Diagnóstico de Schema.

### 3. [HubSpot UI Extension](file:///./sankhya-integration-innleaders/)
Interface do usuário rica integrada diretamente ao Deal Record (CRM Card).
-   **Recursos:**
    -   **Seleção Dinâmica de Lote**: Dropdown alimentado por estoque real e controle.
    -   **Ações de Item**: Duplicação e exclusão rápida diretamente na tabela de itens.
    -   **Preço Personalizado**: Modal para ajuste manual de preços unitários ou totais.
    -   **Checkout Inteligente**: Confirmação de orçamento com geração de PDF instantânea.

## Princípios de Arquitetura

-   **Resiliência (Self-Healing)**: O framework detecta sessões expiradas e renova o acesso automaticamente.
-   **Sincronização de Estado**: Atualização instantânea da UI (Optimistic UI) combinada com o `refreshObjectProperties` do HubSpot.
-   **Estabilidade**: Componentes refatorados para seguir as `best practices` das Extensões de UI da HubSpot (modais de raiz, hooks otimizados).

## Build & Deploy

### Sankhya (Java)
```bash
./build.sh # Gera os JARs na pasta build/
```

### Core API (Node.js/Docker)
```bash
cd tradipar-core-api
npm run build
# Deploy via rsync para o servidor Oracle
rsync -avz --exclude 'node_modules' --exclude '.git' ./ user@host:~/htdocs/api.gcrux.com/tradipar-core-api/
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
├── tradipar-core-api/             # Framework Core API v2.0 (Node.js/TypeScript)
├── sankhya-integration-innleaders/ # Projeto HubSpot UI Extension (React/TypeScript)
├── aws-server-alef/               # [LEGADO] Antigo Servidor Proxy Node.js
├── src/                           # Código Fonte Java (Core Sankhya)
├── build.sh                       # Script de Build Java
└── README.md
```

## Status Atual (Phase 15 Concluída) ✅
- [x] Novo Framework Node.js + TypeScript (Tradipar Core API).
- [x] Fix Upload de Anexos no Sankhya (Multipart/Form-Data Error Resolve).
- [x] Geração e Auto-Anexo de PDF no HubSpot Deal.
- [x] Multi-Item CRUD (Adição/Duplicação/Exclusão).
- [x] Seleção de Lote Dinâmica via Sankhya.

## Próximos Passos (Phase 16)
- Evolução automática de Orçamento (TOP 1) para Pedido (TOP 1010) via CACSP.
- Sincronização de novos Nro. Únicos de Pedido no HubSpot (`sankhya_nu_unico_pedido`).
- Sincronização de propriedades de frete baseada em tabelas de frete Sankhya.

---
Co-Authored-By: Claude Sonnet 3.7 <noreply@anthropic.com>
