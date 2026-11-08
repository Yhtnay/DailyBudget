# Architettura di Sistema — DailyBudget

**DailyBudget** è progettato secondo un paradigma **100% Local-First e Privacy-First**: l'intero stato finanziario dell'utente risiede in un singolo file database SQLite3 portatile con estensione `.dbbudget`. Non è richiesto alcun backend proprietario per il funzionamento core.

---

## 1. Topologia del Monorepo (`Turborepo` + `pnpm`)

Il codice è organizzato in pacchetti disaccoppiati dove la logica matematica e contabile (`@dailybudget/core`) non ha alcuna dipendenza da piattaforma, UI o storage.

```mermaid
flowchart TD
    subgraph Apps["Applicazioni Client (apps/*)"]
        WEB["@dailybudget/web (React 19 + Vite SPA/PWA)"]
        MOB["@dailybudget/mobile (React Native + Expo Prebuild)"]
        NAT_IOS["iOS Native Targets (WidgetKit + WatchOS + Siri)"]
        NAT_AND["Android Native Targets (Jetpack Glance + Wear OS)"]
    end

    subgraph Packages["Librerie Condivise (packages/*)"]
        UI["@dailybudget/ui (Design System & Componenti)"]
        DB["@dailybudget/db (SQLite-Wasm + OPFS + File System Access API)"]
        CORE["@dailybudget/core (Pure TypeScript Accounting & Crypto Engine)"]
    end

    subgraph Storage["Formato Portatile (.dbbudget)"]
        SQLITE[("File SQLite3 (.dbbudget) — schema_v2.sql")]
    end

    WEB --> UI
    WEB --> DB
    WEB --> CORE
    MOB --> UI
    MOB --> DB
    MOB --> CORE
    DB --> CORE
    DB --> SQLITE
    NAT_IOS -. "Lettura O(1) widget_snapshot" .-> SQLITE
    NAT_AND -. "Lettura O(1) widget_snapshot" .-> SQLITE
```

---

## 2. Pipeline di Persistenza Locale su Web (`SQLite-Wasm` + `OPFS` + `File System Access API`)

Nel browser, `@dailybudget/db` mantiene una pipeline a **3 livelli sincronizzati** che garantisce velocità in-memory, persistenza automatica trasparente (senza popup ad ogni click) e scrittura diretta sul file `.dbbudget` presente sul disco locale dell'utente.

```mermaid
sequenceDiagram
    autonumber
    actor User as Utente
    participant UI as "@dailybudget/web (React UI)"
    participant Repo as "DailyBudgetRepository (sql.js WASM)"
    participant OPFS as "OPFS / IndexedDB (active_workspace.dbbudget)"
    participant Disk as "File System Access API (File .dbbudget su Disco)"

    User->>UI: Registra Transazione / Spesa Tricount / Crypto Tx
    UI->>Repo: createTransaction(...) / createTricountExpense(...)
    activate Repo
    Repo->>Repo: Esegue INSERT/UPDATE SQL (PRAGMA foreign_keys = ON)
    Repo->>Repo: Ricalcola accounts.cached_balance
    Repo->>Repo: Esegue calculateDailyBudget() + calculateCryptoAssetMetrics()
    Repo->>Repo: Aggiorna riga singola widget_snapshot (id = 'current')
    Repo-->>UI: db.export() -> Uint8Array (Header: SQLite format 3\0)
    deactivate Repo

    par Salvataggio Istantaneo Silenzioso
        UI->>OPFS: saveBytesToOpfs(bytes)
    and Sincronizzazione Diretta su File Locale (se collegato)
        UI->>Disk: FileSystemFileHandle.createWritable().write(bytes)
    end
    UI-->>User: Aggiorna Dashboard, Gauge DailyBudget e Badge Persistenza
```

### Compatibilità Multi-Browser del File Manager
| Funzionalità | Browser Chromium (Chrome, Edge, Brave) | Safari / Firefox / Mobile Browser |
| :--- | :--- | :--- |
| **Motore SQL** | `SQLite-Wasm` (`sql.js` WebAssembly locale) | `SQLite-Wasm` (`sql.js` WebAssembly locale) |
| **Auto-Save ad ogni mutazione** | `OPFS` (`navigator.storage.getDirectory()`) | `OPFS` con fallback trasparente su `IndexedDB` |
| **Apertura file `.dbbudget`** | `window.showOpenFilePicker()` (mantiene handle vivo) | `<input type="file" accept=".dbbudget,.sqlite,.db">` |
| **Salvataggio su disco utente** | Scrittura diretta su `FileSystemFileHandle` collegato | `window.showSaveFilePicker()` o download `.dbbudget` |

---

## 3. Architettura Mobile, Widget e Smartwatch (`widget_snapshot`)

Su iOS e Android i widget della Home Screen e le complicazioni per Smartwatch hanno limiti severi di memoria e tempo di CPU: **non possono avviare il runtime JavaScript di React Native** solo per mostrare quanto budget resta oggi.

Per risolvere questo problema alla radice, ogni mutazione effettuata nel database aggiorna atomicamente la tabella a riga singola `widget_snapshot` (`id = 'current'`).

```mermaid
flowchart LR
    subgraph SharedContainer["App Group (iOS) / Shared Storage (Android)"]
        DBFILE[("workspace.dbbudget (SQLite3)")]
        SNAP["Tabella widget_snapshot (id = 'current')"]
        DBFILE --- SNAP
    end

    subgraph MainApp["App Principale (React Native + @dailybudget/db)"]
        MUT["Mutazione Dati (Nuova Spesa / Prezzo Crypto)"]
        CALC["Ricalcolo Core Engine (@dailybudget/core)"]
        MUT --> CALC
        CALC -- "UPSERT widget_snapshot" --> SNAP
    end

    subgraph NativeTargets["Estensioni Native Zero-JS (Lettura O(1) SQLite C/Kotlin API)"]
        WK["iOS WidgetKit (Home & Lock Screen)"]
        WOS["Apple WatchOS Complication"]
        GL["Android Jetpack Glance Widget"]
        WEAR["Wear OS Tile & Complication"]
    end

    SNAP -. "SELECT * FROM widget_snapshot WHERE id='current'" .-> WK
    SNAP -. "SELECT * FROM widget_snapshot WHERE id='current'" .-> WOS
    SNAP -. "SELECT * FROM widget_snapshot WHERE id='current'" .-> GL
    SNAP -. "SELECT * FROM widget_snapshot WHERE id='current'" .-> WEAR
```
