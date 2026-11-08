# DailyBudget

**DailyBudget** è una WebApp finanziaria **Open Source, Local-First e Privacy-First** progettata per funzionare al 100% in locale dal browser leggendo e scrivendo direttamente su un singolo file SQLite portatile (`.dbbudget`), con architettura condivisa verso iOS/Android, Widget nativi (WidgetKit / Jetpack Glance) e Smartwatch (WatchOS / Wear OS).

---

## Documentazione Architetturale & Prodotto (con Schemi Mermaid)

- **[Architettura di Sistema (`docs/ARCHITECTURE.md`)](./docs/ARCHITECTURE.md)** — Topologia del monorepo, pipeline a 3 livelli `SQLite-Wasm` + `OPFS` + `File System Access API` e architettura Zero-JS per Widget & Smartwatch (`widget_snapshot`).
- **[Analisi del Prodotto & Regole Contabili (`docs/PRODUCT_ANALYSIS.md`)](./docs/PRODUCT_ANALYSIS.md)** — Invariante Zero-Float Fiat, separazione Cashflow (`base_amount`) vs Competenza (`budget_base_amount`), albero decisionale `Transazione > Conto`, formula dinamica DailyBudget & Burn Rate, Tricount Greedy Minimum Cash Flow e Crypto WAC.
- **[Schema Database SQLite v2 (`docs/DATABASE_SCHEMA.md`)](./docs/DATABASE_SCHEMA.md)** — Diagramma Entità-Relazione (`erDiagram`) completo delle 17 tabelle del formato `.dbbudget`, vincoli di integrità e indici parziali.
- **[Architettura Multi-Agente (`docs/AGENTS_ARCHITECTURE.md`)](./docs/AGENTS_ARCHITECTURE.md)** — Topologia dell'Orchestratore e dei 6 Sub-Agenti specializzati (`core-quant-agent`, `db-storage-agent`, `web-ui-agent`, `mobile-native-agent`, `qa-auditor-agent`, `docs-architect-agent`).
- **[Handoff Baseline (`docs/HANDOFF_CONTEXT.md`)](./docs/HANDOFF_CONTEXT.md)** — Specifica di handoff iniziale e backlog evolutivo.

---

## Struttura del Monorepo (`Turborepo` + `pnpm`)

```text
DailyBudget/
├── apps/
│   └── web/                  # SPA/PWA React 19 + TypeScript + Vite (100% Local-First)
├── packages/
│   ├── core/                 # Motore matematico/contabile in TypeScript puro (zero dipendenze)
│   └── db/                   # Schema SQLite v2, SQLite-Wasm engine, OPFS & File System Access API
├── docs/
│   ├── ARCHITECTURE.md       # Architettura sistema, persistenza .dbbudget e widget nativi
│   ├── PRODUCT_ANALYSIS.md   # Formule contabili, flussi Tricount, Prestiti e Crypto WAC
│   ├── DATABASE_SCHEMA.md    # ER Diagram completo e dizionario tabelle SQLite v2
│   ├── AGENTS_ARCHITECTURE.md# Orchestratore e 6 Sub-Agenti specializzati
│   └── HANDOFF_CONTEXT.md    # Specifica di handoff e roadmap
└── turbo.json
```

---

## Avvio Rapido (Sviluppo Locale)

```bash
# Installa le dipendenze del monorepo
pnpm install

# Esegui i test unitari e di integrazione SQLite (.dbbudget)
pnpm test

# Verifica i tipi TypeScript su tutti i pacchetti
pnpm typecheck

# Avvia la WebApp in modalità sviluppo
pnpm dev
```
