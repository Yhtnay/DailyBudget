---
name: init-agents
description: Inizializza e registra i 6 subagenti dedicati di DailyBudget definiti in docs/AGENTS_ARCHITECTURE.md.
---

# Inizializzazione Subagenti DailyBudget

Quando questa skill viene invocata o all'avvio di compiti complessi nel progetto DailyBudget, registra i 6 subagenti specializzati definiti in `docs/AGENTS_ARCHITECTURE.md`:

1. `core-quant-agent` (Ownership `packages/core/**`)
2. `db-storage-agent` (Ownership `packages/db/**`)
3. `web-ui-agent` (Ownership `apps/web/**`, `packages/ui/**`)
4. `mobile-native-agent` (Ownership `apps/mobile/**`)
5. `qa-auditor-agent` (Ownership `*.test.ts`)
6. `docs-architect-agent` (Ownership `docs/**`, `README.md`)

Istruzioni per l'agente:
Esegui `define_subagent` per ognuno dei 6 subagenti applicando le relative ownership, responsabilità e invarianti contabili.
