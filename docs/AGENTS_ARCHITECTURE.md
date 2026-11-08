# Architettura Multi-Agente: Orchestratore & 6 Sub-Agenti (DailyBudget)

Questo documento definisce la topologia dell'**Orchestratore** e dei **6 Sub-Agenti specializzati** registrati per lo sviluppo parallelo e sicuro del monorepo **DailyBudget** (`Turborepo` + `pnpm`).

---

## 1. Topologia Multi-Agente e Ownership Disgiunta (`flowchart`)

Poiché il monorepo risiede in un workspace condiviso (`inherit`), l'architettura assegna ad ogni sub-agente una **cartella esclusiva (Zero-Collision Ownership)**:

```mermaid
flowchart TD
    ORCH["ORCHESTRATORE (Lead Architect & Release Manager)"]

    subgraph CodeAgents["Sub-Agenti di Sviluppo (Ownership per Pacchetto)"]
        CORE["core-quant-agent (packages/core/**)"]
        DB["db-storage-agent (packages/db/**)"]
        WEB["web-ui-agent (apps/web/** & packages/ui/**)"]
        MOB["mobile-native-agent (apps/mobile/**)"]
    end

    subgraph CrossAgents["Sub-Agenti di Qualità & Documentazione Continua"]
        QA["qa-auditor-agent (Test Suite *.test.ts & Audit Invarianti)"]
        DOCS["docs-architect-agent (docs/** & README.md + Schemi Mermaid)"]
    end

    ORCH --> CORE
    ORCH --> DB
    ORCH --> WEB
    ORCH --> MOB
    ORCH --> QA
    ORCH --> DOCS

    CORE -. "Espone Tipi & Algoritmi Puri" .-> DB
    DB -. "Espone Repository & Storage" .-> WEB
    DB -. "Espone .dbbudget & widget_snapshot" .-> MOB
```

---

## 2. Pipeline di Esecuzione di una Feature (`sequenceDiagram`)

```mermaid
sequenceDiagram
    autonumber
    actor User as Utente
    participant Orch as Orchestratore
    participant Core as core-quant-agent
    participant Db as db-storage-agent
    participant Web as web-ui-agent
    participant Qa as qa-auditor-agent
    participant Docs as docs-architect-agent

    User->>Orch: Richiede nuova feature o regola di business
    Orch->>Orch: Definisce contratti TypeScript e invarianti contabili
    Orch->>Core: Implementa logica pura in packages/core
    Core-->>Orch: Funzioni pure + Unit Test verdi
    Orch->>Db: Aggiorna schema/query/persistenza in packages/db
    Db-->>Orch: Repository + widget_snapshot + DB Test verdi

    par Sviluppo Parallelo Senza Collisioni di File
        Orch->>Web: Aggiorna UI/UX in apps/web
        Orch->>Docs: Aggiorna docs/*.md e diagrammi Mermaid
    end

    Web-->>Orch: Build Vite completata
    Docs-->>Orch: Documentazione allineata
    Orch->>Qa: Esegue audit invarianti e test end-to-end
    Qa-->>Orch: Report QA (pnpm test && pnpm typecheck && pnpm build)
    Orch->>User: Commit & Push su GitHub + Anteprima Live
```

---

## 3. Schede dei 6 Sub-Agenti Registrati

### 1. `core-quant-agent` — *Financial & Crypto Core Engine Specialist*
- **Ownership**: `packages/core/**`
- **Responsabilità**: Algoritmi matematici puri (`doesTransactionAffectBudget`, `calculateDailyBudget`, `calculateTricountSettlements`, `calculateCryptoAssetMetrics`, `computeTricountExpenseSplits`, conversioni multi-valuta a 3 livelli, motore `recurring_rules`).
- **Vincolo Ferreo**: Zero dipendenze esterne; importi Fiat esclusivamente in `integer cents`; quantità Crypto in stringhe decimali.

### 2. `db-storage-agent` — *SQLite-Wasm, OPFS & Sync Specialist*
- **Ownership**: `packages/db/**`
- **Responsabilità**: Gestione DDL/migrazioni `schema_v2.sql`, formato binario `.dbbudget` (`SQLite format 3\0`), persistenza ibrida `OPFS` + `File System Access API`, ricalcolo atomico di `accounts.cached_balance` e `widget_snapshot` (`id = 'current'`), adapter API Frankfurter/CoinGecko offline-first.

### 3. `web-ui-agent` — *Frontend, Design System & Accessibility Specialist*
- **Ownership**: `apps/web/**`, `packages/ui/**`
- **Responsabilità**: Viste React + Vite, Design System Light/Dark, numeri tabulari (`tabular-nums`), accessibilità WCAG/ARIA, distinzione visiva tra `base_amount` (Cashflow) e `budget_base_amount` (Competenza Budget).

### 4. `mobile-native-agent` — *Expo, WidgetKit, WatchOS, Glance & Wear OS Specialist*
- **Ownership**: `apps/mobile/**`
- **Responsabilità**: App React Native + Expo Prebuild (CNG) e target nativi Swift/Kotlin che leggono direttamente `SELECT * FROM widget_snapshot WHERE id = 'current'` dal file `.dbbudget` in App Group / Shared Storage in $O(1)$.

### 5. `qa-auditor-agent` — *Accounting Invariants & Edge-Case Auditor*
- **Ownership**: Trasversale (`*.test.ts`)
- **Responsabilità**: Audit e test end-to-end su resti dispari (`100€ / 3`), priorità `Transazione > Conto`, allineamento `sum(transaction_splits) == budget_base_amount`, PMC post-staking a costo zero e validità binaria `.dbbudget`.

### 6. `docs-architect-agent` — *Documentation, Product Analysis & Mermaid Diagrams Specialist*
- **Ownership**: `docs/**` e `README.md`
- **Responsabilità**: Mantenere sempre sincronizzata la suite documentale (`ARCHITECTURE.md`, `PRODUCT_ANALYSIS.md`, `DATABASE_SCHEMA.md`, `AGENTS_ARCHITECTURE.md`, `README.md`) corredata da diagrammi Mermaid (`flowchart`, `sequenceDiagram`, `erDiagram`, `stateDiagram-v2`) ad ogni evoluzione dello schema o delle regole di business.

---

## 4. Strategia di Ottimizzazione Token & Routing dei Modelli

Per massimizzare la velocità di esecuzione e ridurre drasticamente il consumo di token di I/O senza sacrificare il rigore contabile, l'Orchestratore applica **4 regole architetturali di ottimizzazione**:

```mermaid
flowchart LR
    ORCH["Orchestratore (Contract-First + Line Ranges)"]

    subgraph TierPro["Tier Pro / Inherit (Alta Precisione)"]
        PRO_CORE["core-quant-agent (Zero-Float, WAC, Multi-Valuta)"]
        PRO_DB["db-storage-agent (DDL, Migrazioni, LWW Merge)"]
    end

    subgraph TierFlash["Tier Flash (Esecuzione Modulare Rapida)"]
        FL_DB["db-storage-agent (Metodi CRUD Standard)"]
        FL_WEB["web-ui-agent (Componenti Modulari *Tab.tsx)"]
        FL_DOCS["docs-architect-agent (Markdown & Mermaid docs/**)"]
        FL_QA["qa-auditor-agent (Test, Typecheck & Build)"]
    end

    subgraph TierLite["Tier Flash-Lite (Check Istantanei)"]
        LITE["Ricerche Rapide & Check di Stato"]
    end

    ORCH -- "Contratti Puri & Invarianti" --> TierPro
    ORCH -- "Prompt Mirati + Riutilizzo send_message" --> TierFlash
    ORCH -- "Ispezione Veloce" --> TierLite
```

### Le 4 Regole di Risparmio Token Attive

| # | Regola di Ottimizzazione | Strategia Tecnica & Configurazione | Impatto sul Consumo Token |
| :--- | :--- | :--- | :--- |
| **1** | **Matrice di Routing dei Modelli per Ruolo (`Model` Tiering)** | • `core-quant-agent`: `inherit` / `pro` (massima precisione per calcoli contabili Zero-Float, WAC e multi-valuta).<br>• `db-storage-agent`: `inherit` / `pro` per DDL/migrazioni/LWW Merge; `flash` per metodi CRUD standard.<br>• `web-ui-agent`: `flash` (costruzione e aggiornamento componenti React modulari su contratti TypeScript già definiti).<br>• `docs-architect-agent`: `flash` (aggiornamento documentazione Markdown e diagrammi Mermaid in `docs/**`).<br>• `qa-auditor-agent`: `flash` (esecuzione pipeline `pnpm test && pnpm typecheck && pnpm build` e verifica invarianti).<br>• Ricerche rapide / Check di stato: `flash_lite`. | Riserva i modelli `pro` esclusivamente al ragionamento matematico/SQL complesso, delegando fino all'80% dei task operativi a `flash` e `flash_lite`. |
| **2** | **Riutilizzo del Contesto via `send_message`** | Per task successivi nello stesso dominio, l'Orchestratore invia istruzioni al `conversationId` del sub-agente già attivo tramite `send_message` anziché istanziarne uno nuovo da zero, evitando di rileggere i file del pacchetto. | Azzera il costo di cold-start e di rilettura ripetuta dei sorgenti del pacchetto. |
| **3** | **Partizionamento Modulare dei File UI (`apps/web/src/components/*Tab.tsx`)** | Ogni vista della WebApp risiede in un componente dedicato (`DashboardTab.tsx`, `TransactionsTab.tsx`, `TricountTab.tsx`, `LoansTab.tsx`, `CryptoTab.tsx`, `PersistenceHeader.tsx`), permettendo a `web-ui-agent` di leggere e modificare ~200–400 righe invece di un file monolitico da >3.500 righe. | **Risparmio 5x–8x** sui token di I/O ad ogni iterazione UI. |
| **4** | **Prompt Contract-First con Line Ranges (`StartLine`/`EndLine`)** | L'Orchestratore fornisce nel prompt le firme TypeScript esatte e i range di righe mirati (`StartLine`/`EndLine`), evitando scansioni esplorative dell'intero repository da parte dei sub-agenti. | Elimina letture ridondanti e garantisce modifiche chirurgiche al primo colpo. |

