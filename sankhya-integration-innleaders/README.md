# HubSpot CRM Card - Sankhya Preços

Extensão de interface (UI Extension) para o HubSpot CRM que consulta e aplica preços do Sankhya ERP diretamente na tela de Negócios.

## 🚀 Como Deployar

Este projeto utiliza o HubSpot CLI.

1. **Instalar Dependências** (Na primeira vez):
   ```bash
   npm install
   ```

2. **Upload para o HubSpot**:
   ```bash
   hs project upload
   ```

3. **Verificar Status do Build**:
   O CLI fornecerá um link para o portal de desenvolvedor para acompanhar o build e deploy.

## 📁 Estrutura do Projeto

- `src/app/app-hsmeta.json`: Configurações de permissões (Scopes) e domínios permitidos (`api.gcrux.com`).
- `src/app/cards/PrecosCard.tsx`: Componente React principal.
- `hsproject.json`: Metadados do projeto HubSpot.

## 🛠️ Tecnologias

- **React**: Interface do usuário.
- **HubSpot UI Extensions SDK**: Comunicação com o CRM.
- **TypeScript**: Tipagem estática.

## 💡 Recursos Implementados

- **Click-to-Apply**: Botão que preenche o Valor do Negócio e salva automaticamente.
- **Auto-Save on Blur**: Salva o valor no HubSpot quando o usuário sai do campo.
- **Fetch Guard**: Lógica para impedir loops de requisição infinitos.
- **Success Feedback**: Confirmação visual "✓ Salvo com sucesso!".

## 🔒 Segurança

As requisições para o Proxy (`api.gcrux.com`) são assinadas pelo HubSpot e whitelisted no arquivo `app-hsmeta.json`.
