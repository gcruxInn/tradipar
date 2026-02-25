---
description: Deploy ou Validação da UI Extension HubSpot com base no protocolo Peace
---

# Deploy da HubSpot Extension (Peace Workflow)

Siga com extrema cautela estes passos ao planejar mover edições do `PrecosCard.tsx` para o ambiente online:

// turbo
1. Na raiz do modulo, rode uma validação estrita dos arquivos
```bash
cd sankhya-integration-innleaders && npx eslint . --ext .js,.jsx,.ts,.tsx && hs project validate
```

2. Se você encontrar bugs nos hooks reativos (`react-hooks/rules-of-hooks` ou #310), FAÇA um refactoring até o linter passar limpo;
3. Se o build provar estar sintaticamente correto, prepare para deploy e requisite autorização via `notify_user` detalhando no que está sendo afetado.
4. Execute o upload estrito (Aviso: Apenas com consentimento do Humano/CEO).
```bash
cd sankhya-integration-innleaders && hs project upload
```
