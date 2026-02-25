---
description: Deploy ou Validação da UI Extension HubSpot com base no protocolo Peace
---

# Deploy da HubSpot Extension (Peace Workflow)

Siga com extrema cautela estes passos ao planejar mover edições do `PrecosCard.tsx` para o ambiente online:

1. Na raiz do modulo, rode uma validação estrita dos arquivos utilizando comandos explícitos por plataforma:
```bash
# Lint no WSL
cd /home/rochagabriel/dev/tradipar/sankhya-integration-innleaders && npx eslint . --ext .js,.jsx,.ts,.tsx
```

```powershell
# Validação nativa do HubSpot CLI (rodando no Windows via proxy bridge)
powershell -Command "cd \\wsl.localhost\Ubuntu-22.04\home\rochagabriel\dev\tradipar\sankhya-integration-innleaders ; hs project validate"
```

2. Se houver falhas (`react-hooks/rules-of-hooks`), lembre-se das restrições de Hook Stability do CLAUDE.md e limpe os erros.
3. Se o build for limpo, requisite autorização via `notify_user` detalhando o impacto antes de atualizar Produção.
4. Execute o upload estrito (Aviso: Apenas com consentimento do Humano/CEO):
```powershell
powershell -Command "cd \\wsl.localhost\Ubuntu-22.04\home\rochagabriel\dev\tradipar\sankhya-integration-innleaders ; hs project upload"
```
