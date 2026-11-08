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

---

## 4. Sincronizzazione Offline-First Tassi Fiat & Prezzi Crypto (`market-sync`)

Il servizio di sincronizzazione di mercato aggiorna i cambi valutari Fiat e le quotazioni Crypto preservando l'architettura **100% Offline-First e Privacy-First**:

- **Fonti Pubbliche Senza Chiave API**: la WebApp interroga on-demand o all'avvio **Frankfurter API** (tassi di cambio BCE per le valute Fiat) e **CoinGecko API** (prezzi spot per gli asset Crypto configurati con `coingecko_id`).
- **Cache Persistente nel File `.dbbudget`**: ogni tasso o prezzo scaricato viene salvato immediatamente nelle tabelle SQLite `exchange_rates` e `crypto_assets` (`last_price_Cents`, `last_price_updated_at`), diventando parte integrante del file `.dbbudget`.
- **Fallback Deterministico al 100%**: se il dispositivo è offline, sotto rete restrittiva o le API pubbliche non rispondono, il servizio intercetta silenziosamente l'errore di rete e utilizza i tassi e prezzi già presenti in cache dentro `.dbbudget` senza bloccare alcuna operazione contabile.

```mermaid
sequenceDiagram
    autonumber
    actor User as Utente
    participant UI as "@dailybudget/web (Market Sync Service)"
    participant Frank as "Frankfurter API (Tassi Fiat BCE)"
    participant Gecko as "CoinGecko API (Prezzi Spot Crypto)"
    participant Repo as "DailyBudgetRepository (.dbbudget SQLite)"

    User->>UI: Avvio Workspace / Click "Aggiorna Tassi & Prezzi"
    UI->>Repo: Legge valute attive e crypto_assets (coingecko_id)

    alt Connessione Internet Disponibile (Online)
        par Fetch Tassi di Cambio Fiat
            UI->>Frank: GET /latest?from=EUR
            Frank-->>UI: JSON Tassi Fiat (USD, CHF, GBP, ...)
            UI->>Repo: UPSERT in exchange_rates (rate, fetched_at)
        and Fetch Quotazioni Spot Crypto
            UI->>Gecko: GET /api/v3/simple/price?ids=...&vs_currencies=eur
            Gecko-->>UI: JSON Prezzi Spot Crypto
            UI->>Repo: UPDATE crypto_assets (last_price_Cents, last_price_updated_at)
        end
        Repo->>Repo: Ricalcola Net Worth e aggiorna widget_snapshot (id = 'current')
        Repo-->>UI: Stato aggiornato + persistenza OPFS / Disco
    else Dispositivo Offline o API Non Raggiungibile (Fallback Locale)
        Frank--xUI: Timeout / Network Error
        Gecko--xUI: Timeout / Network Error
        UI->>Repo: Legge ultimi tassi da exchange_rates e prezzi da crypto_assets
        Repo-->>UI: Restituisce valori cached deterministci (Zero errori bloccanti)
    end

    UI-->>User: Renderizza Dashboard, Gruppi Tricount Multi-Valuta e Portfolio Crypto
```

