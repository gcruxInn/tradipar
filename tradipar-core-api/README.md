# Tradipar Core API (v2.0) - Node.js Framework

Este é o novo motor da Tradipar, construído em **Node.js + TypeScript**, focado em orquestração de alto desempenho entre **Sankhya Om** e **HubSpot CRM**.

## 🚀 Arquitetura "Set-and-Forget"

Diferente do motor legado, este framework utiliza a nova **API Gateway do Sankhya** com suporte a **Multi-Item**, sincronização real-time e conformidade com o protocolo de anexos do novo portal.

### ✨ Principais Funcionalidades

-   **OAuth2 Sankhya:** Gerenciamento automático de tokens (M2M) com auto-refresh.
-   **Orquestração Multi-Item:** Cálculo e confirmação de rentabilidade para múltiplos produtos em um único Deal.
-   **PDF Attachment Engine:** 
    -   Geração dinâmica de PDF a partir do orçamento Sankhya.
    -   Upload para o Sankhya via `sessionUpload.mge` (corrigido para multipart/form-data).
    -   Sincronização automática para o HubSpot Deal como Anexo/Nota.
-   **Self-Healing Logs:** Logs estruturados para facilitar o diagnóstico de erros de negócio e infraestrutura.
-   **Multi-Stage Evolution (Budget -> Order -> NFe):** Suporte completo ao ciclo de vida da venda (TOPs 999, 1010 e 1100).

## 📜 Regras de Negócio (Core da Integração)

A integração segue um mapeamento rígido entre o tipo de operação (**dealtype**) e as propriedades de armazenamento de IDs únicos no HubSpot:

| Deal Type (TOP) | Descrição | Propriedade HubSpot (Nro. Único / NUNOTA) |
| :--- | :--- | :--- |
| **999** | Orçamento B2B | `orcamento_sankhya` |
| **1010** | Pedido de Venda | `sankhya_nu_unico_pedido` |
| **1100** | Faturamento (NFe) | `sankhya_nu_unico_nfe` |

> [!NOTE]
> Ao evoluir o status no HubSpot, a API busca o NUNOTA correspondente na propriedade associada ao seu `dealtype` atual para realizar operações como geração de PDF ou conferência de rentabilidade.


## 🛠️ Stack Tecnológica

-   **Runtime:** Node.js (v18+)
-   **Linguagem:** TypeScript
-   **Servidor Web:** Express.js
-   **Containers:** Docker + Docker Compose (com Volume Binding para `dist/` e `.env`)

## 📦 Estrutura do Projeto

```text
src/
├── adapters/      # Interfaces de comunicação (HubSpot, Sankhya)
├── config/        # Variáveis de ambiente e constantes
├── controllers/   # Lógica de rotas e entrada/saída
└── services/      # Lógica de negócio (Cálculos, Fluxos Complexos)
```

## ⚙️ Configuração e Execução

### Variáveis de Ambiente (.env)
O arquivo `.env` deve conter as credenciais do Gateway Sankhya e o Token Privado do HubSpot.

```bash
# Sankhya
SANKHYA_CLIENT_ID=...
SANKHYA_CLIENT_SECRET=...
SANKHYA_APP_TOKEN=...
SANKHYA_USERNAME=...
SANKHYA_PASSWORD=...

# HubSpot
HUBSPOT_ACCESS_TOKEN=...
```

### Desenvolvimento Local (WSL)
```bash
npm run dev
```

### Deploy (Docker)
Este projeto está configurado para rodar em container com sincronização via volumes para facilitar o deploy via `rsync`.

```bash
# Compilar localmente
npm run build

# Reiniciar no servidor
docker compose down && docker compose up -d
```

## 🛡️ Notas de Engenharia (PDF Upload Fix)

O upload de PDF para o Sankhya via Gateway foi corrigido para evitar o erro `[B cannot be cast to org.apache.commons.fileupload.FileItem`.
**Regras Críticas:**
1.  **sessionKey:** Deve seguir o padrão `ANEXO_SISTEMA_CabecalhoNota_${nunota}` para o Sankhya identificar o destino.
2.  **fitem=S:** Parâmetro obrigatório para indicar que o corpo é um item de arquivo.
3.  **Content-Length:** O cabeçalho deve ser enviado explicitamente no Multipart para evitar que o Gateway do Sankhya trate o stream como truncado.

---
Co-Authored-By: Claude Sonnet 3.7 <noreply@anthropic.com>
