# Architettura Multi-Agente: Orchestratore & Sub-Agenti (DailyBudget)

Questo documento definisce la topologia dell'**Orchestratore** e dei **5 Sub-Agenti specializzati** registrati per lo sviluppo parallelo e sicuro del monorepo **DailyBudget** (`Turborepo` + `pnpm`).

---

## 1. Principi di Coordinamento e Anti-Collisione

Poiché il monorepo è condiviso nello stesso workspace (`inherit`), l'architettura adotta una **partizione stretta per pacchetto (Directory Ownership)**:

```text
                       ┌──────────────────────────────────────┐
                       │           ORCHESTRATORE              │
                       │  (Lead Architect & Release Manager)  │
                       └──────────────────┬───────────────────┘
                                          │
       ┌─────────────────┬────────────────┼────────────────┬─────────────────┐
       ▼                 ▼                ▼                ▼                 ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│  core-quant  │ │  db-storage  │ │    web-ui    │ │mobile-native │ │  qa-auditor  │
│    -agent    │ │    -agent    │ │    -agent    │ │    -agent    │ │    -agent    │
├──────────────┤ ├──────────────┤ ├──────────────┤ ├──────────────┤ ├──────────────┤
│packages/core/│ │ packages/db/ │ │  apps/web/   │ │ apps/mobile/ │ │ Cross-Pkg    │
│ Pure TS Math │ │ SQLite-Wasm  │ │ packages/ui/ │ │ WidgetKit &  │ │ Invariants & │
│ Zero-Float   │ │ OPFS & Disk  │ │ React + Vite │ │ WatchOS/Wear │ │ Edge Tests   │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Regole dell'Orchestratore
1. **Contract-First**: Prima di lanciare sub-agenti in parallelo, l'Orchestratore definisce le interfacce TypeScript condivise (input/output tra `@dailybudget/core`, `@dailybudget/db` e le viste UI).
2. **Parallelismo Disgiunto**: Due sub-agenti di scrittura possono lavorare in contemporanea **solo** se operano nelle rispettive cartelle esclusive (es. `core-quant-agent` in `packages/core` + `web-ui-agent` in `apps/web`).
3. **Pipeline Sequenziale per Modifiche Strutturali**: Quando una feature richiede una modifica allo schema SQLite:
   - **Step 1**: `core-quant-agent` implementa la formula/algoritmo in `packages/core`.
   - **Step 2**: `db-storage-agent` aggiorna `packages/db` (`schema.ts`, `database.ts`, `widget_snapshot`).
   - **Step 3**: `web-ui-agent` e `mobile-native-agent` aggiornano in parallelo `apps/web` e `apps/mobile`.
   - **Step 4**: `qa-auditor-agent` esegue la batteria di test sugli invarianti contabili (`pnpm test && pnpm typecheck && pnpm build`).

---

## 2. Schede dei Sub-Agenti Registrati

### 1. `core-quant-agent` — *Financial & Crypto Core Engine Specialist*
- **Ownership**: `packages/core/**`
- **Responsabilità**:
  - Evoluzione dei 4 motori matematici (`doesTransactionAffectBudget`, `calculateDailyBudget`, `calculateTricountSettlements`, `calculateCryptoAssetMetrics`).
  - Conversione multi-valuta a 3 livelli per Tricount (`Valuta Spesa -> Valuta Gruppo -> Valuta Base Workspace`) senza perdita di precisione in centesimi.
  - Motore di espansione e schedulazione delle ricorrenze (`recurring_rules`: `daily`, `weekly`, `monthly`, `yearly`).
  - Validazione degli split multi-categoria (`validateTransactionSplits`) e distribuzione deterministica dei resti in centesimi (`computeTricountExpenseSplits`).
- **Vincolo Ferreo**: Zero dipendenze esterne o di piattaforma; importi Fiat esclusivamente in `integer cents`; quantità Crypto in stringhe decimali.

---

### 2. `db-storage-agent` — *SQLite-Wasm, OPFS & Sync Specialist*
- **Ownership**: `packages/db/**`
- **Responsabilità**:
  - Gestione DDL e migrazioni di `schema_v2.sql` mantendo compatibilità con il formato binario `.dbbudget` (`SQLite format 3\0`).
  - Persistenza ibrida `OPFS` (`navigator.storage.getDirectory()`) + `File System Access API` (`FileSystemFileHandle.createWritable()`) + fallback IndexedDB.
  - Aggiornamento atomico di `accounts.cached_balance` e della riga singola `widget_snapshot` (`id = 'current'`) ad ogni mutazione.
  - Import/Export CSV, JSON e integrazione offline-first dei cambi valuta (Frankfurter API) e prezzi Crypto (CoinGecko API) con cache in `exchange_rates` e `crypto_assets`.
  - Progettazione del Sync Adapter E2EE / CRDT opzionale per conti e gruppi Tricount condivisi.

---

### 3. `web-ui-agent` — *Frontend, Design System & Accessibility Specialist*
- **Ownership**: `apps/web/**`, `packages/ui/**`
- **Responsabilità**:
  - Sviluppo delle viste React + Vite (Dashboard DailyBudget, Conti/Split/Tag, Tricount, Prestiti, Crypto Portfolio).
  - Design System con supporto Light/Dark Theme, numeri tabulari (`font-variant-numeric: tabular-nums`), accessibilità WCAG/ARIA e navigazione da tastiera.
  - Rappresentazione visiva chiara della separazione tra **Cashflow Bancario (`base_amount`)** e **Competenza Budget (`budget_base_amount`)**, e dello stato di override `include_in_budget` (`NULL`, `1`, `0`).
- **Vincolo Ferreo**: Vietato duplicare formule matematiche o query SQL nei componenti React; deve invocare esclusivamente `@dailybudget/core` e `@dailybudget/db`.

---

### 4. `mobile-native-agent` — *Expo, WidgetKit, WatchOS, Glance & Wear OS Specialist*
- **Ownership**: `apps/mobile/**`
- **Responsabilità**:
  - Setup React Native + Expo Prebuild (Continuous Native Generation).
  - Configurazione dell'App Group (iOS) e Shared Storage (Android) per condividere il file `.dbbudget` tra l'app principale e le estensioni native.
  - Sviluppo dei target nativi in Swift (WidgetKit, Siri App Intents, WatchOS) e Kotlin (Jetpack Glance, Wear OS Tiles) che leggono direttamente `SELECT * FROM widget_snapshot WHERE id = 'current'` in $O(1)$ senza avviare il runtime JS.

---

### 5. `qa-auditor-agent` — *Accounting Invariants & Edge-Case Auditor*
- **Ownership**: Trasversale (test suite `*.test.ts` e verifica invarianti)
- **Responsabilità**:
  - Verifica sistematica degli invarianti di `HANDOFF_CONTEXT.md`:
    1. Arrotondamenti su divisioni dispari (es. `100,00 € / 3 = 33,34 € + 33,33 € + 33,33 €`).
    2. Priorità assoluta `Transazione (0|1) > Conto (default)` su tutte le tipologie (`expense`, `income`, `transfer`, `loan_movement`, `tricount_settlement`).
    3. Allineamento tra `sum(transaction_splits.amount_base)` e `transactions.budget_base_amount`.
    4. Ricalcolo PMC (WAC) post-staking reward (costo zero) e post-vendita parziale.
    5. Validità dell'header SQLite3 sui file `.dbbudget` esportati e coerenza di `widget_snapshot`.
