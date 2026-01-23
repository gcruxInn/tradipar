# Tradipar HubSpot Integration Ecosystem

Ecossistema de integração entre Sankhya ERP e HubSpot CRM, focado em automação de tabelas de preços e sincronização de dados mestre.

## Componentes

### 1. [Java Cloud Integration](file:///./)
Núcleo da integração "Set and Forget". Responsável pelo sync pesado de dados.
- **Local:** Rodando dentro do Sankhya (Actions/Scheduled).
- **Recursos:** Sync de Produtos, Importação de Clientes, Diagnóstico de Schema.

### 2. [AWS Node Proxy](file:///./aws-server-alef/)
Camada intermediária resiliente para consultas em tempo real.
- **Local:** AWS Lightsail (`api.gcrux.com`).
- **Recursos:** Consulta PV1/PV2/PV3, Write-back de Amount, **Self-Healing Session Recovery**.

### 3. [HubSpot UI Extension](file:///./sankhya-integration-innleaders/)
Interface do usuário rica integrada diretamente ao Deal Record.
- **Local:** HubSpot Cloud (Private App).
- **Recursos:** Exibição de Preços, "One-Click Apply" para Amount, **Auto-Save on Blur**, Guardiões contra Loops.

## Princípios de Arquitetura

- **Resiliência (Self-Healing)**: Recuperação automática de sessões Sankhya expiradas (Status 3).
- **Estabilidade**: Lock de requisições no front-end para evitar loops de re-render.
- **Segurança**: Chamadas autenticadas via Private App e Proxy autenticado no Sankhya.

## Build & Deploy

- **Sankhya (Java)**: `./build.sh` (Gera JAR).
- **Proxy (Node)**: `pm2 restart 0` no servidor AWS.
- **Frontend (HubSpot)**: `hs project upload` dentro do diretório da app.

## Estrutura do Repositório

```
tradipar/
├── aws-server-alef/               # Servidor Proxy Node.js (AWS)
├── sankhya-integration-innleaders/ # Projeto HubSpot Extension
├── src/                           # Código Fonte Java (Core)
├── build.sh                       # Script de Build Java
└── README.md
```

## Próximos Passos (Phase 4)
- Expansão de associações (Contatos/Orçamentos/Vendedor).
- Fluxo de identificação automática de vendedor Sankhya.
