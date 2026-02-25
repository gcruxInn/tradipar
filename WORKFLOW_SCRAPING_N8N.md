# Workflow Simples de Scraping Manual com n8n

## Visão Geral

Este guia fornece instruções para criar um workflow básico de scraping manual usando n8n, baseado na documentação oficial do n8n.

## Estrutura do Workflow

Um workflow simples de scraping tem 3 componentes principais:

```
Manual Trigger → HTTP Request → HTML Extract
```

---

## Passo 1: Adicionar o Nó Manual Trigger

1. Abra seu workspace n8n
2. Clique no botão **+** ou pressione `Tab` para abrir o painel de nós
3. Procure por **Manual Trigger**
4. Selecione o nó para adicioná-lo ao canvas

**Função**: Permite executar o workflow manualmente clicando em "Execute Workflow" quando tudo estiver configurado.

---

## Passo 2: Adicionar o Nó HTTP Request

1. Clique no **+** à direita do Manual Trigger
2. Procure por **HTTP Request**
3. Configure os seguintes parâmetros:

### Configuração do HTTP Request:

| Parâmetro | Valor |
|-----------|-------|
| **Request Method** | GET |
| **URL** | `https://blog.n8n.io/` |
| **Response Format** | String |
| **Authentication** | None |

**Exemplo de URL alternativa** (para testes):
- `https://hackernoon.com` - Blog de artigos sobre tecnologia
- `https://webscraper.io/test-sites/e-commerce/static/phones/touch` - Site de teste

---

## Passo 3: Adicionar o Nó HTML Extract

1. Conecte um nó **HTML** ao HTTP Request
2. Configure as seguintes opções:

### Configuração Básica:

| Parâmetro | Valor |
|-----------|-------|
| **Operation** | Extract HTML Content |
| **Source Data** | JSON |
| **JSON Property** | data |

### Valores de Extração (Extraction Values):

Adicione pelo menos um valor de extração definindo:

- **Key** (nome do campo extraído): `title`
- **CSS Selector** (seletor CSS): `.post .item-title a`
- **Return Value** (tipo de conteúdo): HTML ou Text
- **Return Array** (opcional): Toggle para True se espera múltiplos resultados

**Exemplos de CSS Selectors:**

```css
/* Títulos em tags h2 */
h2

/* Elementos com classe específica */
.post .item-title a

/* Primeiro parágrafo */
p:first-child

/* Links dentro de um div */
div.content a
```

---

## Passo 4: Adicionar Extração Adicional (Opcional)

Se desejar extrair mais dados (como URLs), adicione outro nó **HTML** conectado ao primeiro:

### Configuração para Extrair URLs:

| Parâmetro | Valor |
|-----------|-------|
| **Operation** | Extract HTML Content |
| **Source Data** | JSON |
| **JSON Property** | item |

**Valores de Extração:**

1. **Valor 1** - Título:
   - Key: `Title`
   - CSS Selector: `a`
   - Return Value: `Text`

2. **Valor 2** - URL:
   - Key: `url`
   - CSS Selector: `a`
   - Return Value: `Attribute`
   - Attribute: `href`

---

## Passo 5: Executar o Workflow

1. Clique no botão **Execute Workflow** na parte inferior da tela
2. Veja os resultados em cada nó passando o mouse sobre o ícone de saída
3. Analise os dados extraídos na seção de output

---

## Exemplo Completo: Scraping do Blog n8n

### Dados que serão extraídos:

```json
{
  "item": {
    "Title": "Getting started with n8n",
    "url": "/blog/getting-started/"
  }
}
```

---

## Padrão de Looping para Múltiplas Páginas

Para scraping com paginação, adicione:

1. **Set Node** - Define o número da página inicial
2. **IF Node** - Verifica se há mais páginas
3. **Loop** - Conecta de volta para incrementar página

### Estrutura:
```
Manual Trigger → Set (page=1) → HTTP Request → HTML Extract 
                                       ↓
                                    IF Node
                                   ↙      ↖
                              (false)    (true - fim)
                                ↓
                           Set (page+1)
                                ↓
                        [volta para HTTP Request]
```

---

## Boas Práticas de Scraping

✅ **Faça:**
- Leia a política de scraping do website
- Use delays entre requisições
- Respeite o `robots.txt`
- Identifique-se com um User-Agent apropriado

❌ **Não Faça:**
- Não sobrecarregue o servidor com muitas requisições simultâneas
- Não ignore avisos legais
- Não copie conteúdo protegido por direitos autorais

---

## Adições Úteis

### Salvar em Google Sheets
Após extrair os dados, adicione um nó **Google Sheets** para armazenar os resultados.

### Enviar Email com Resultados
Use o nó **Send Email** para notificar sobre os dados extraídos.

### Conversão para CSV
Use o nó **Spreadsheet** para converter os resultados em CSV.

---

## Referências

- [Documentação Manual Trigger](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.manualworkflowtrigger/)
- [HTTP Request Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.httprequest/)
- [HTML Node](https://docs.n8n.io/integrations/builtin/core-nodes/n8n-nodes-base.html/)
- [Blog: Web Scraping com n8n](https://blog.n8n.io/how-to-use-the-http-request-node-the-swiss-army-knife-for-workflow-automation/#workflow-1-scraping-data-from-hackernoon)

---

## Dicas Extras

### Inspecionar HTML para Encontrar Seletores
1. Abra o DevTools do navegador (F12)
2. Use "Inspecionar Elemento" para encontrar as classes e IDs
3. Use o console para testar seletores CSS

### Testar Seletores CSS
No console do navegador:
```javascript
document.querySelectorAll('.seu-seletor-aqui')
```

### Modo Debug
Use **Data Pinning** para congelar dados e iterar sem fazer novas requisições!
