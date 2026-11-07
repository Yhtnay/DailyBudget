# DailyBudget

**DailyBudget** è una WebApp finanziaria **Open Source, Local-First e Privacy-First** progettata per funzionare al 100% in locale dal browser leggendo e scrivendo direttamente su un singolo file SQLite portatile (`.dbbudget`), con architettura condivisa verso iOS/Android, Widget nativi (WidgetKit / Jetpack Glance) e Smartwatch (WatchOS / Wear OS).

---

## Caratteristiche Principali e Invarianti Contabili

1. **Formato Dati Portatile (`.dbbudget`)**:
   - L'intero workspace è un database SQLite3 standard (`.dbbudget`).
   - **Su Web**: eseguito in-browser tramite `SQLite-Wasm`, persistito automaticamente su **OPFS** (Origin Private File System) con sincronizzazione diretta sul file system locale tramite **File System Access API** (e fallback di import/export universale).
   - **Su Mobile/Watch**: contiene la tabella a riga singola `widget_snapshot` aggiornata ad ogni mutazione per letture $O(1)$ da Widget e Smartwatch senza avviare il runtime JS.

2. **Zero Floating-Point sulle Valute Fiat**:
   - Tutti gli importi monetari Fiat sono salvati come **interi in centesimi (minor units)** (`12,50 €` = `1250`).
   - Le quantità Crypto sono memorizzate come stringhe decimali ad alta precisione (es. `"0.04523100"`).

3. **Separazione tra Cashflow Bancario (`base_amount`) e Competenza di Budget (`budget_base_amount`)**:
   - `base_amount`: movimento reale sul saldo del conto.
   - `budget_base_amount`: quota effettiva che impatta il calcolo del DailyBudget (es. spesa di gruppo Tricount pagata per intero ma di cui solo la propria quota impatta il budget).

4. **Gerarchia di Priorità sul Budget (`Transazione > Conto`)**:
   - Ogni conto definisce un default `include_in_budget` (`1` o `0`).
   - Ogni transazione può sovrascriverlo con `include_in_budget` (`1` = forza inclusione, `0` = forza esclusione, `NULL` = eredita dal conto).
   - Giroconti (`transfer`), movimenti prestiti (`loan_movement`) e rimborsi Tricount (`tricount_settlement`) sono esclusi di default salvo forzatura esplicita (`1`).

5. **Motore DailyBudget Dinamico & Burn Rate Forecasting**:
   - Separa il pool delle spese fisse (`EffectiveFixed = max(FixedPlanned, FixedActual)`) dal pool variabile (`VariablePool = MonthlyBudgetTarget - EffectiveFixed`), ricalcolando la disponibilità giornaliera sui giorni residui del mese e proiettando il saldo di fine mese.

6. **Multi-Categoria (Split) & Multi-Tag**:
   - Suddivisione di una singola transazione su più categorie (`transaction_splits`) e assegnazione trasversale di tag M:N (`transaction_tags`).

7. **Moduli Tricount, Prestiti/Debiti & Crypto WAC**:
   - **Tricount**: gestione gruppi, spese multi-valuta, split (`equal`, `exact`, `percentage`, `shares`) e risoluzione debiti con algoritmo **Greedy Minimum Cash Flow**.
   - **Prestiti/Debiti (`loans`)**: tracciamento crediti (`lent`) e finanziamenti/debiti (`borrowed`) con capitale residuo e impatto opzionale delle rate sul budget.
   - **Crypto Portfolio**: calcolo del Prezzo Medio di Carico (**WAC** - Weighted Average Cost), P&L realizzato e non realizzato.

---

## Struttura del Monorepo (`Turborepo` + `pnpm`)

```text
DailyBudget/
├── apps/
│   └── web/                  # SPA/PWA React + TypeScript + Vite (100% Local-First)
├── packages/
│   ├── core/                 # Motore matematico/contabile in TypeScript puro (zero dipendenze)
│   └── db/                   # Schema SQLite v2, SQLite-Wasm engine, OPFS & File System Access API
├── docs/
│   └── HANDOFF_CONTEXT.md    # Architettura, regole di business e roadmap
└── turbo.json
```

---

## Avvio Rapido (Sviluppo Locale)

```bash
# Installa le dipendenze del monorepo
pnpm install

# Esegui i test del motore core e database
pnpm test

# Avvia la WebApp in modalità sviluppo
pnpm dev
```

---

## Documentazione Architetturale

- [HANDOFF_CONTEXT.md](./docs/HANDOFF_CONTEXT.md) — Specifica architetturale, invarianti contabili e backlog.
- [schema_v2.sql](./packages/db/schema/schema_v2.sql) — DDL SQLite v2 completo del formato `.dbbudget`.
- [packages/core/src/index.ts](./packages/core/src/index.ts) — Motore matematico in TypeScript puro.
