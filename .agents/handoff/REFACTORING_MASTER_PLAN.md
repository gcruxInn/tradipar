# 🎯 PLANO MESTRE DE REFATORAÇÃO - TRADIPAR ECOSYSTEM

**Data:** 2026-03-13
**Status Atual:** 95/100 (2 Gaps Críticos Bloqueadores)
**Auditoria Completa:** ✅ Concluída

---

## 📊 RESUMO EXECUTIVO

### ✅ Módulos Implementados (Status)

| Módulo | Descrição | Status | Score |
|--------|-----------|--------|-------|
| **Módulo 1** | Quote Refactoring (TypeScript MVC) | ✅ 100% | 10/10 |
| **Módulo 2** | Order Evolution (TOP 1010) | ⚠️ 95% | 9.5/10 |
| **Módulo 3** | Discovery & Lifecycle Sync | ✅ 100% | 10/10 |

**Score Geral:** 95/100

---

## 🔴 GAPS CRÍTICOS (BLOQUEADORES)

### Gap 1: Confirmação Automática do Pedido (TOP 1010)
**Arquivo:** `tradipar-core-api/src/services/quote.service.ts` (linhas 520-569)

**Problema:**
- ✅ `confirmQuote()` cria o pedido (TOP 1010) corretamente
- ❌ Mas o pedido criado **NÃO é confirmado automaticamente**
- 🔴 **Resultado:** Pedidos ficam em estado `PENDENTE` indefinidamente

**Impacto Negócio:**
- Vendedor vê "Aguardando Evolução" mesmo após confirmar orçamento
- Ordens não entram no fluxo de faturamento

**Solução:**
```typescript
// Adicionar após linha 537 em quote.service.ts
if (pedidoResp?.responseBody?.rows?.length > 0) {
  const pedidoNunota = pedidoResp.responseBody.rows[0][0];
  console.log(`[PEDIDO] Auto-confirmando pedido gerado NUNOTA=${pedidoNunota}`);

  const confirmPedidoPayload = {
    serviceName: "CACSP.confirmarNota",
    requestBody: { NUNOTA: { $: pedidoNunota } }
  };

  await sankhyaApi.post("/service.sbr", confirmPedidoPayload);
  console.log(`[PEDIDO] Confirmado com sucesso NUNOTA=${pedidoNunota}`);
}
```

**Estimativa:** 1h
**Prioridade:** 🔴 CRÍTICA

---

### Gap 2: HubSpot Token Refresh (OAuth2)
**Arquivo:** `tradipar-core-api/src/adapters/hubspot.api.ts`

**Problema:**
- ❌ Token hardcoded no constructor sem validação de expiração
- ✅ Sankhya já tem implementação correta de auto-refresh
- 🔴 **Resultado:** Após ~6h de uso, API calls falham com `401 Unauthorized`

**Evidência:**
```typescript
// hubspot.api.ts (linhas 7-14) - INCORRETO
constructor() {
  this.api = axios.create({
    headers: {
      'Authorization': `Bearer ${ENV.HUBSPOT.ACCESS_TOKEN}`, // ❌ hardcoded!
    }
  });
}
```

**Solução:**
```typescript
// Adicionar em hubspot.api.ts
private token: string | null = null;
private tokenExpiry: number | null = null;

private async fetchNewToken(): Promise<string> {
  const response = await axios.post('https://api.hubapi.com/oauth/v1/token', {
    grant_type: 'refresh_token',
    client_id: ENV.HUBSPOT.CLIENT_ID,
    client_secret: ENV.HUBSPOT.CLIENT_SECRET,
    refresh_token: ENV.HUBSPOT.REFRESH_TOKEN
  });

  this.token = response.data.access_token;
  this.tokenExpiry = Date.now() + (response.data.expires_in - 300) * 1000; // 5min margin
  return this.token;
}

private async getValidToken(): Promise<string> {
  if (this.token && this.tokenExpiry && Date.now() < this.tokenExpiry) {
    return this.token;
  }
  return await this.fetchNewToken();
}

// Usar em interceptor
this.api.interceptors.request.use(async (config) => {
  const token = await this.getValidToken();
  config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

**Estimativa:** 2h
**Prioridade:** 🔴 CRÍTICA

---

## 🟡 OPORTUNIDADES DE REFATORAÇÃO (DEBT TÉCNICO)

### 1. UTF-8 Encoding Helper (Duplicação)
**Arquivos:** `order.service.ts`, `sync.service.ts`, `catalog.service.ts`

**Problema:** 3 cópias do mesmo helper `fixEncoding`

**Solução:**
```bash
# Criar helper centralizado
mkdir -p tradipar-core-api/src/utils
```

```typescript
// tradipar-core-api/src/utils/encoding.ts
export function fixEncoding(str: string | null | undefined): string | null | undefined {
  if (!str) return str;
  try {
    if (str.match(/[ÃÂ][\x80-\xBF]/)) {
      return Buffer.from(str, 'binary').toString('utf8');
    }
  } catch (e) { return str; }
  return str;
}

export function applyFixEncodingDeep(obj: any): any {
  if (typeof obj === 'string') return fixEncoding(obj);
  if (Array.isArray(obj)) return obj.map(applyFixEncodingDeep);
  if (obj && typeof obj === 'object') {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, applyFixEncodingDeep(v)])
    );
  }
  return obj;
}
```

**Migrar para Adapter:**
```typescript
// sankhya.api.ts - Adicionar interceptor
this.api.interceptors.response.use((response) => {
  response.data = applyFixEncodingDeep(response.data);
  return response;
});
```

**Estimativa:** 30min
**Prioridade:** 🟡 ALTA

---

### 2. Error Handling Unificado
**Arquivos:** Todos os services (25 ocorrências de try/catch)

**Problema:** Padrões inconsistentes de captura e logging de erros

**Solução:**
```typescript
// tradipar-core-api/src/utils/error-handler.ts
export class SankhyaError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'SankhyaError';
  }
}

export class HubSpotError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public details?: any
  ) {
    super(message);
    this.name = 'HubSpotError';
  }
}

export function handleSankhyaError(e: any): never {
  const msg = e.response?.data?.statusMessage || e.message;
  const code = e.response?.status || 500;
  console.error(`[SANKHYA ERROR] ${msg}`, e.response?.data);
  throw new SankhyaError(msg, code, e.response?.data);
}

export function handleHubSpotError(e: any): never {
  const msg = e.response?.data?.message || e.message;
  const code = e.response?.status || 500;
  console.error(`[HUBSPOT ERROR] ${msg}`, e.response?.data);
  throw new HubSpotError(msg, code, e.response?.data);
}
```

**Uso:**
```typescript
// Em services
try {
  const result = await sankhyaApi.post(...);
} catch (e: any) {
  handleSankhyaError(e); // Automaticamente loga e lança erro tipado
}
```

**Estimativa:** 2h
**Prioridade:** 🟡 ALTA

---

### 3. DTO Validation (Controllers)
**Arquivos:** `quote.controller.ts`, `order.controller.ts`, `orcamento.controller.ts`

**Problema:** `req.body` sem validação de tipos

**Solução com Zod:**
```typescript
// tradipar-core-api/src/types/dto/quote.dto.ts
import { z } from 'zod';

export const CreateQuoteDTO = z.object({
  dealId: z.string(),
  vendorCode: z.number().optional(),
  observations: z.string().optional()
});

export type CreateQuoteInput = z.infer<typeof CreateQuoteDTO>;
```

```typescript
// quote.controller.ts
import { CreateQuoteDTO } from '../types/dto/quote.dto';

public async createQuote(req: Request, res: Response): Promise<void> {
  try {
    const input = CreateQuoteDTO.parse(req.body); // ✅ Validação automática
    const result = await quoteService.createQuote(input);
    res.status(200).json(result);
  } catch (e: any) {
    if (e instanceof z.ZodError) {
      res.status(400).json({ error: 'Invalid input', details: e.errors });
      return;
    }
    res.status(500).json({ error: e.message });
  }
}
```

**Estimativa:** 3h
**Prioridade:** 🟡 ALTA

---

### 4. God Methods Refactor
**Arquivos:** `quote.service.ts`

**Problema:**
- `getQuoteStatus()`: 243 linhas, 19 branches (complexidade ciclomática: CRÍTICA)
- `billOrder()`: 186 linhas, 3 fallback chains

**Solução:**
```typescript
// Quebrar getQuoteStatus em métodos menores
private async fetchDocumentChain(orcNunota: string) { ... }
private async analyzeOrderEvolution(documents: any[]) { ... }
private async syncHubSpotProperties(dealId: string, updates: any) { ... }
private async cleanupAnomalies(documents: any[]) { ... }

public async getQuoteStatus(dealId: string) {
  const docs = await this.fetchDocumentChain(orcNunota);
  const analysis = await this.analyzeOrderEvolution(docs);
  if (analysis.hasEvolution) {
    await this.syncHubSpotProperties(dealId, analysis.updates);
  }
  await this.cleanupAnomalies(docs);
  return analysis;
}
```

**Estimativa:** 4h
**Prioridade:** 🟢 MÉDIA

---

### 5. Discovery Logic Unificada
**Arquivos:** `quote.service.ts`, `order.service.ts`

**Problema:** Lógica de discovery duplicada em 2 services

**Solução:**
```typescript
// discovery.service.ts - Adicionar método
public async findEvolvedDocuments(nunotaOrigem: string): Promise<DocumentChain> {
  const sql = `
    WITH RECURSIVE chain AS (
      SELECT NUNOTA, CODTIPOPER, STATUSNOTA, NUMNOTA, NUMPEDIDO, VLRNOTA
      FROM TGFCAB WHERE NUNOTA = ${nunotaOrigem}
      UNION ALL
      SELECT c.NUNOTA, c.CODTIPOPER, c.STATUSNOTA, c.NUMNOTA, c.NUMPEDIDO, c.VLRNOTA
      FROM TGFCAB c
      JOIN chain ON c.NUNOTAORIG = chain.NUNOTA
    )
    SELECT * FROM chain ORDER BY NUNOTA DESC;
  `;

  const response = await sankhyaApi.post('/service.sbr', {
    serviceName: "DbExplorerSP.executeQuery",
    requestBody: { sql: { $: sql } }
  });

  return this.parseDocumentChain(response.data);
}
```

**Estimativa:** 1h
**Prioridade:** 🟢 MÉDIA

---

## 📦 PLANO DE EXECUÇÃO (ROADMAP)

### Sprint 1: Gaps Críticos (3h) 🔴
```
[x] Auditoria completa do codebase
[ ] Gap 1: Confirmação automática TOP 1010 (1h)
[ ] Gap 2: HubSpot Token Refresh (2h)
[ ] Teste manual no Deal 55475038735
[ ] Deploy em produção
```

### Sprint 2: Refatorações de Alta Prioridade (5.5h) 🟡
```
[ ] UTF-8 Encoding Helper (30min)
[ ] Error Handling Unificado (2h)
[ ] DTO Validation com Zod (3h)
```

### Sprint 3: Debt Técnico (5h) 🟢
```
[ ] God Methods Refactor (4h)
[ ] Discovery Logic Unificada (1h)
```

**Total Estimado:** 13.5h

---

## 🚀 COMANDOS DE DEPLOY (PRODUÇÃO)

### 1. Backend (tradipar-core-api)

#### Local → Build & Sync
```bash
# Navegar para o diretório
cd /home/rochagabriel/dev/tradipar/tradipar-core-api

# Compilar TypeScript
npm run build

# Validar sintaxe (opcional mas recomendado)
node --check dist/server.js

# Sincronizar para servidor Oracle Cloud
rsync -avz --delete \
  --exclude 'node_modules' \
  --exclude '.git' \
  --exclude '.env' \
  ./ gcrux-api@137.131.243.179:~/htdocs/api.gcrux.com/tradipar-core-api/

# Senha SSH: (usar variável $GCRUX_API_SSH ou prompt interativo)
```

#### Servidor → Rebuild & Restart
```bash
# SSH no servidor
ssh gcrux-api@137.131.243.179

# Navegar para o diretório
cd ~/htdocs/api.gcrux.com/tradipar-core-api

# Rebuild Docker com force recreate
docker compose up -d --build --force-recreate

# Aguardar 5s e verificar logs
sleep 5 && docker logs -f core-api-sankhya
```

**Healthcheck:**
```bash
# Testar endpoint de health
curl -s https://api.gcrux.com/tradipar/health | jq
```

**Output Esperado:**
```json
{
  "status": "ok",
  "timestamp": "2026-03-13T...",
  "services": {
    "sankhya": "connected",
    "hubspot": "connected"
  }
}
```

---

### 2. Frontend (sankhya-integration-innleaders)

#### Validar Localmente
```bash
cd /home/rochagabriel/dev/tradipar/sankhya-integration-innleaders

# Validar projeto HubSpot
hs project validate

# Output esperado:
# [SUCCESS] Project sankhya-integration-innleaders is valid and ready to upload
```

#### Deploy para HubSpot
```bash
# Upload para conta Tradipar
hs project upload --account="tradipar"

# Aguardar build (~30s)
# Output esperado:
# ✓ Project deployed successfully
# ✓ Build #XXX is live
```

**Healthcheck:**
- Abrir Deal no HubSpot CRM
- Verificar card "Sankhya - Preços" carregando
- Confirmar que StepIndicator renderiza corretamente

---

### 3. Rollback de Emergência

#### Backend
```bash
# SSH no servidor
ssh gcrux-api@137.131.243.179

cd ~/htdocs/api.gcrux.com/tradipar-core-api

# Checkout da versão anterior (ex: commit 5b8837b)
git checkout 5b8837b

# Rebuild
docker compose up -d --build --force-recreate
```

#### Frontend
```bash
# Local
cd /home/rochagabriel/dev/tradipar/sankhya-integration-innleaders

# Checkout da versão anterior
git checkout HEAD~1

# Redeploy
hs project upload --account="tradipar"
```

---

## ✅ CHECKLIST DE VALIDAÇÃO PRÉ-DEPLOY

### Backend
- [ ] `npm run build` compila sem erros
- [ ] `node --check dist/server.js` retorna exit code 0
- [ ] Variáveis de ambiente `.env` estão atualizadas
- [ ] Docker compose up local funciona (teste smoke)
- [ ] Endpoints críticos respondem em dev:
  - [ ] `POST /hubspot/create-quote`
  - [ ] `POST /hubspot/confirm-quote`
  - [ ] `GET /hubspot/quote-status/:dealId`
  - [ ] `POST /hubspot/convert-to-order`

### Frontend
- [ ] `hs project validate` retorna SUCCESS
- [ ] Hooks React não estão dentro de condicionais
- [ ] `onRefreshProperties()` é chamado após updates
- [ ] StepIndicator flui corretamente (1→2→3)
- [ ] Tabs preservam estado ao alternar

### Integração E2E (Deal de Teste: 55475038735)
- [ ] Card carrega sem erros de console
- [ ] Busca de produtos retorna resultados
- [ ] Adicionar item ao carrinho funciona
- [ ] Confirmação de orçamento cria TOP 1 no Sankhya
- [ ] Pedido (TOP 1010) é criado e confirmado automaticamente
- [ ] PDF é gerado e anexado ao Deal
- [ ] Propriedades do HubSpot são atualizadas

---

## 🛠️ UTILIZAÇÃO DAS SKILLS

### Skill: `tradipar-core-api-dev`
**Quando usar:**
- Refatorações em controllers/services
- Implementação de novos endpoints
- Debug de integrações Sankhya/HubSpot
- Deploy do backend

**Comando:**
```bash
# O agente invocará automaticamente esta skill ao trabalhar em:
# - tradipar-core-api/src/**/*.ts
# - OAuth2 flows
# - Docker deploys
```

---

### Skill: `hubspot-ui-dev`
**Quando usar:**
- Alterações em `PrecosCard.tsx`
- Validação de build HubSpot
- Debug de hooks React
- Deploy do frontend

**Comando:**
```bash
# Validar antes de deploy
bash ./.agents/skills/hubspot-ui-dev/scripts/build_probe.sh
```

---

### Skill: `node-proxy-dev` (⚠️ LEGACY)
**Status:** Deprecated (migrado para `tradipar-core-api-dev`)

**Quando usar:**
- Apenas para manutenção do `aws-server-alef` legado
- NÃO usar para novas features

---

### Skill: `sankhya-java-dev`
**Quando usar:**
- Desenvolvimento de extensões JAPE nativas
- Services customizados (@Service annotation)
- Webhooks nativos Sankhya

**Comando:**
```bash
# Validar ambiente de build Java
bash ./.agents/skills/sankhya-java-dev/scripts/build_probe.sh
```

---

## 📈 MÉTRICAS DE SUCESSO

| Métrica | Antes | Meta Pós-Refatoração |
|---------|-------|---------------------|
| Complexidade Ciclomática Média | 19 | < 10 |
| Linhas por Método | 243 (max) | < 100 |
| Cobertura de Validação | 0% | 80% |
| Uptime Token HubSpot | 6h | 24h+ |
| Taxa de Confirmação TOP 1010 | 0% | 100% |
| Debt Técnico (Issues) | 7 | 0 |

---

## 🎯 PRÓXIMOS PASSOS IMEDIATOS

1. **Executar Sprint 1 (Gaps Críticos):**
   ```bash
   # 1. Fix confirmação automática TOP 1010
   # Editar: tradipar-core-api/src/services/quote.service.ts

   # 2. Implementar HubSpot Token Refresh
   # Editar: tradipar-core-api/src/adapters/hubspot.api.ts

   # 3. Build & Deploy
   cd /home/rochagabriel/dev/tradipar/tradipar-core-api
   npm run build
   rsync -avz --delete --exclude 'node_modules' --exclude '.git' ./ gcrux-api@137.131.243.179:~/htdocs/api.gcrux.com/tradipar-core-api/

   # 4. Restart servidor
   ssh gcrux-api@137.131.243.179 "cd ~/htdocs/api.gcrux.com/tradipar-core-api && docker compose up -d --build --force-recreate"
   ```

2. **Validar no Deal de Teste:**
   - Abrir Deal 55475038735 no HubSpot
   - Confirmar orçamento
   - Verificar evolução automática para TOP 1010
   - Validar que pedido está CONFIRMADO (não PENDENTE)

3. **Executar Sprint 2 (Refatorações):**
   - UTF-8 Encoding Helper
   - Error Handling Unificado
   - DTO Validation

---

## 📚 REFERÊNCIAS

- **Handoff Módulo 1:** `/home/rochagabriel/dev/tradipar/.agents/handoff/modulo_1_quote_refactoring.md`
- **Handoff Módulo 2:** `/home/rochagabriel/dev/tradipar/.agents/handoff/modulo_2_order_evolution.md`
- **Handoff Módulo 3:** `/home/rochagabriel/dev/tradipar/.agents/handoff/modulo_3_lifecycle_sync.md`
- **CLAUDE.md:** `/home/rochagabriel/dev/tradipar/CLAUDE.md`
- **Skills:**
  - `/home/rochagabriel/dev/tradipar/.agents/skills/tradipar-core-api-dev/SKILL.md`
  - `/home/rochagabriel/dev/tradipar/.agents/skills/hubspot-ui-dev/SKILL.md`

---

**Assinado:** Claude Sonnet 4.5
**Co-Authored-By:** Claude Sonnet 3.7 <noreply@anthropic.com>
