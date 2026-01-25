# Tradipar HubSpot Integration Ecosystem

Ecossistema de integração entre Sankhya ERP e HubSpot CRM, focado em automação de tabelas de preços, estoque e sincronização de dados mestres.

## Componentes

### 1. [Java Cloud Integration](file:///./src/)
Núcleo da integração "Set and Forget". Responsável pelo sync pesado de dados.
- **Local:** Rodando dentro do Sankhya (Actions/Scheduled).
- **Recursos:** Sync de Produtos, Importação de Clientes, Diagnóstico de Schema.

### 2. [Node.js Proxy (Oracle Cloud)](file:///./aws-server-alef/)
Camada intermediária resiliente para consultas em tempo real e orquestração de pedidos.
- **Local:** Oracle Cloud (Container Docker).
- **Recursos:**
    - Consulta Multi-Item (Preço e Estoque por produto).
    - Contexto de Filial ("Empresa X").
    - Write-back de Amount.
    - Gatilho de conversão para Pedido.
    - **Self-Healing Session Recovery**.

### 3. [HubSpot UI Extension](file:///./sankhya-integration-innleaders/)
Interface do usuário rica integrada diretamente ao Deal Record (CRM Card).
- **Local:** HubSpot Cloud (Private App Publico).
- **Recursos:**
    - Visualização de múltiplos itens em Accordion.
    - Totais Gerais (PV1/PV2/PV3) com "One-Click Apply".
    - Validação de Estoque (Bloqueio de Faturamento).
    - Status Amigável e Auto-Refresh.

## Princípios de Arquitetura

- **Resiliência (Self-Healing)**: O Proxy detecta sessões Sankhya expiradas (Status 3/401) e renova o token automaticamente sem falhar a requisição do usuário.
- **Segurança**: Credenciais não expostas no Frontend. Variáveis de ambiente (`.env`) gerenciadas seguramente no container.
- **UX Premium**: Design responsivo com feedback imediato (Optimistic UI) e prevenção de erros (Stocks Guards).

## Build & Deploy

### Sankhya (Java)
```bash
./build.sh # Gera os JARs na pasta build/
```

### Proxy (Node.js/Docker)
Rodando no servidor Oracle Cloud em `~/htdocs/api.gcrux.com/aws-server-alef/`:
```bash
# Sincronizar arquivos para o servidor
scp aws-server-alef/index.js user@host:~/path/

# Rebuildar e subir container
sudo docker compose up -d --build
```
*(Consulte `aws-server-alef/README.md` para detalhes de `.env`)*

### Frontend (HubSpot Extension)
```bash
cd sankhya-integration-innleaders
hs project upload
```

## Estrutura do Repositório

```
tradipar/
├── aws-server-alef/               # Servidor Proxy Node.js (Docker)
├── sankhya-integration-innleaders/ # Projeto HubSpot UI Extension (React/TypeScript)
├── src/                           # Código Fonte Java (Core Sankhya)
├── build.sh                       # Script de Build Java
└── README.md
```

## Status Atual (Phase 5.2 Concluída)
- [x] Multi-Item Support (Preço/Estoque N:N).
- [x] UX Avançada (Totais, Accordion, Auto-Refresh).
- [x] Deploy Containerizado seguro.

## Próximos Passos (Phase 6)
- Workflow para chamar API na criação do Deal.
- Popular campos de preço customizados automaticamente.
- Sync reverso de Contatos/Empresas.
