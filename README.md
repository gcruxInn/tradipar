# Tradipar HubSpot Integration

## Versão 2.0 - Phase 1 Foundation

Integração "Set and Forget" entre Sankhya ERP e HubSpot CRM com arquitetura de **Autonomic Computing**.

## Princípios

- **Self-Configuration**: Token dinâmico via TSIPAR
- **Self-Healing**: Retry automático em erros 429/5xx  
- **Self-Protection**: Validação CNPJ + detecção de duplicados
- **Closed-Loop**: Feedback de IDs entre sistemas

## Estrutura

```
src/
└── br/com/acg/hubspot/tradipar/integracao/
    ├── config/
    │   └── Auth.java              # Token TSIPAR + cache
    ├── util/
    │   └── HubSpotClient.java     # HTTP resiliente
    └── action/
        ├── PostProducts.java      # Sync produtos + preços
        ├── GetNewClients.java     # Inbound parceiros
        └── DiagnosticoPrecos.java # Probe de schema
```

## Build

```bash
./build.sh
# Output: TradiparHubspot-v2.0.jar
```

## Configuração

```sql
INSERT INTO TSIPAR (CHAVE, TEXTO) 
VALUES ('HUBSPOTTOKEN', 'pat-na1-xxx-your-token');
```

## Scheduled Actions

| Classe | Descrição | Frequência |
|--------|-----------|------------|
| `PostProducts` | Sync produtos com AD_PRECO_TRADIPAR | 30 min |
| `GetNewClients` | Importa empresas do HubSpot | 15 min |

## Requisitos

- Java 1.8
- Sankhya JARs: dwf, jape, mge-modelcore, cuckoo
