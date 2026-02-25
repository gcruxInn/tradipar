# Peculiaridades da API Sankhya (Sankhya API Quirks)

Durante o desenvolvimento da integração entre HubSpot e Sankhya na rota de orçamentos (NUNOTA), documentou-se comportamentos exóticos (e não documentados) relacionados à Inclusão e Alteração de Itens de Nota/Pedido via gateway service `CACSP.incluirAlterarItemNota`.

## O Problema do PK (Primary Key) `SEQUENCIA`

A tabela de itens (`TGFITE`) exige a chave composta `NUNOTA` + `SEQUENCIA` perfeitamente identificada em solicitações de API. O proxy Node.js faz um processo de reconciliação de itens (Source of Truth HubSpot -> Target Sankhya).

### Comportamento 1: Omitir a tag `SEQUENCIA` no JSON 
- **Resultado API**: Erro estrutural / XML malformado. A API recusa e exige a representação obrigatória da entidade.

### Comportamento 2: Forçar um Auto-Increment Manual (`SEQUENCIA: 9`) num `CREATE`
- **Resultado API**: Rejeitado! A API interpreta que, se você passa uma sequência numérica (ex: 9), trata-se de um `UPDATE`. Se o item 9 não existe previamente no banco de dados da Nota/Pedido, ela retorna o erro fatal:
  > `"statusMessage": "Item Nota/Pedido não existe: PK[461693,9]"`

### Comportamento 3: Passar Vazio (`SEQUENCIA: {"$": ""}`) no `CREATE`
- Esse é o **bypass oficial** da Sankhya para delegar o auto-incremento de sequência de volta ao motor do banco de dados (inserir novo registro usando a próxima sequência disponível).
- **Problema Oculto (Soft-Rollback / Modo Zumbi)**: O servidor acata a requisição (Retorna Http HTTP 200, Status da payload `1`), porém silenciosamente realiza um "Rollback Mudo" no banco de dados porque encontra divergência entre os preços passados e o Cadastro de Produtos restrito. Como consequência, o item **não é gravado** e a extensão UI do Hubspot aponta falso-positivo e falhas de sinc.

### A BALA DE PRATA (A Solução Definitiva para o Soft Rollback)
Para contornar o Soft-Rollback mudo da exclusão da sequência durante o `CREATE`, você deve **EXPLICITAMENTE informar o parâmetro global `<INFORMARPRECO>True</INFORMARPRECO>`** no nível superior de _itens_. Isso obriga o ERP a aceitar a precificação oriunda do HubSpot (mesmo sem PK), gravando em banco.

**Como formatar o Payload de `CREATE` Corretamente**:
```json
{
  "serviceName": "CACSP.incluirAlterarItemNota",
  "requestBody": {
    "nota": {
      "NUNOTA": "461693", // Exemplo
      "itens": {
        "INFORMARPRECO": "True", // OBRIGATÓRIO NO CREATE
        "item": {
          "NUNOTA": { "$": 461693 },
          "CODPROD": { "$": 8569 },
          "QTDNEG": { "$": 54 },
          "VLRUNIT": { "$": 111.046 },
          "VLRTOT": { "$": 5996.484 },
          "CODVOL": { "$": "PR" },
          "CODLOCALORIG": { "$": 101000 },
          "PERCDESC": { "$": 0 },
          "VLRDESC": { "$": 0 },
          "CONTROLE": { "$": "41" },
          "SEQUENCIA": { "$": "" } // OBRIGATÓRIO VAZIO NO CREATE SE FOR INSERT
        }
      }
    }
  }
}
```

**Como formatar o Payload de `UPDATE` Corretamente**:
Se o item existe, mantenha `INFORMARPRECO` se quiser mas deve obrigatoriamente fornecer a respectiva `SEQUENCIA` real lida do BD:
```json
{
  "SEQUENCIA": { "$": 9 } // NUMÉRICO DEVE ESTAR PRESENTE SE FOR UPDATE REAL
}
```

### Script de Validação Reusável
No ambiente, há um script `.agents/skills/node-proxy-dev/scripts/test-sankhya-payload.js` para você simular inclusão no ambiente Sandbox antes de mexer na API Proxy pesada, evitando tentativa e erro cegamente.
