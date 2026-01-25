# HubSpot CRM Card - Sankhya Preços & Estoque (Multi-Item)

Extensão de interface (UI Extension) oficial para o HubSpot CRM da Tradipar.
Esta aplicação fornece uma visão detalhada de **Múltiplos Itens** associados ao negócio, consultando Preço e Estoque em tempo real no ERP Sankhya.

## 🚀 Como Deployar

Este projeto utiliza o HubSpot CLI. Certifique-se de estar logado (`hs auth`).

```bash
# Na pasta do projeto
hs project upload
```
*O HubSpot irá buildar e deployar o React automaticamente.*

---

## 💡 Recursos Implementados (Phase 5.x)

### 1. Suporte Multi-Item & Estoque
- Itera sobre todos os itens de linha do negócio.
- Exibe **Estoque Disponível** vs **Quantidade Necessária**.
- **Bloqueio de Fatura**: Se qualquer item tiver estoque insuficiente, o botão de "Gerar Pedido" é desabilitado.

### 2. Contexto de Filial
- Ao lado do estoque, mostra o nome da Empresa Sankhya (ex: "Filial MG", "Matriz SP") para evitar confusão sobre onde o produto está zerado.

### 3. Totais e Aplicação em Massa
- **Grand Totals**: Calcula a soma de `(Preço PVx * Quantidade)` de todos os itens.
- **Top Bar**: Exibe os totais de PV1, PV2 e PV3 no topo do card.
- **One-Click Apply**: Botões "Aplicar Total" atualizam o `Amount` do negócio instantaneamente.

### 4. UX Avançada (Accordion)
- A tabela detalhada de itens vem **colapsada por padrão** ("Ver Detalhes dos X Itens") para não poluir a tela.
- Botão "Atualizar" manual para recarregar dados sem interagir com o resto da página.

### 5. Status Amigável
- Mapeia IDs internos (`appointmentscheduled`) para labels humanos (`Em Negociação`).

---

## 📁 Estrutura Importante

- `src/app/cards/PrecosCard.tsx`: **Coração da App**. Componente React que gerencia toda a lógica de estado, fetch e renderização.
- `src/app/app.json`: Definição do cartão e locais de aparecimento (CRM Record Deal).
- `src/app/app-hsmeta.json`: Whitelist de domínios (`api.gcrux.com`) e Secrets.

## ⚠️ Dependências
Esta extensão depende diretamente da API Proxy (`aws-server-alef`) estar online para funcionar. Erros de conexão exibirão um alerta visual no card.
