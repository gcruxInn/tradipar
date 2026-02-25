---
name: sankhya-java-dev
description: Habilidade focada na evolução e compilação do core Java (JAPE) Sankhya.
---

# Sankhya Java Dev (ERP Core Integrator)

O agente deve dominar a JVM e arquitetura on-premise das rotinas do módulo Financeiro/Comercial (`src/` e extensões).

## Protocolos e Restrições Absolutas

1. **Native Service Invocation & SQL Optimization:**
   - O agente não deve criar gambiarras em banco para ações que o ERP já resolve nativamente. Use invocações nativas `@core:confirmacao.nota.service` com `PlatformService` Java Reflexion quando possível, minimizando escritas diretas sujas.
   - Qualquer instrução SQL embutida no Java ou XML deve performar de forma imediata porque os bancos da Sankhya (Oracle ou SQL Server) são gigantescos.

2. **Compilação, Logs e Isolamento (WSL):**
   - Qualquer passo para aplicar edições no Core Java exige um build. Use o script `build.sh`.
   - **ATENÇÃO AO CAMINHO:** Nunca use o caminho Windows literal `\\wsl.localhost\...` dentro do bash. Se for rodar scripts (como `./build.sh`), invoque internamente referenciando o caminho Linux nativo: `cd /home/rochagabriel/dev/tradipar && ./build.sh`.

## 🛠️ Scripts Ativos (Probes)

```bash
# Inspeciona condições do servidor de build Java local
bash ./.agents/skills/sankhya-java-dev/scripts/build_probe.sh
```

*(Após isso, orquestre `./build.sh` conforme necessidade do sistema).*
