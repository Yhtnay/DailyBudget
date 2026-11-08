# DailyBudget (v0.2.0)

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](./LICENSE)
[![Local-First](https://img.shields.io/badge/Architecture-Local--First-blue.svg)](./docs/ARCHITECTURE.md)
[![SQLite](https://img.shields.io/badge/Format-.dbbudget%20(SQLite3)-teal.svg)](./docs/DATABASE_SCHEMA.md)

**DailyBudget** è una WebApp finanziaria **Open Source, Local-First e Privacy-First** progettata per funzionare al 100% in locale nel browser leggendo e scrivendo direttamente su un singolo file SQLite portatile (`.dbbudget`), con **design reattivo multi-dispositivo (View Mode Auto, Mobile con Bottom Navigation Bar a sole icone e Desktop espanso con layout a pannelli affiancati)**, supporto PWA per smartphone (iOS / Android) e architettura predisposta per widget nativi (WidgetKit / Jetpack Glance).

Nessun dato viene inviato a server cloud: tutti i calcoli e i database risiedono esclusivamente nella memoria locale del dispositivo dell'utente.

---

## 📖 Documentazione e Guide

- **[Manuale Utente Completo (`docs/USER_MANUAL.md`)](./docs/USER_MANUAL.md)** — Guida pratica illustrata per utenti finali: formule del DailyBudget, conti bancari, split spese con scontrini, ricorrenze automatiche, gruppi Tricount, prestiti, portfolio Crypto WAC, backup `.dbbudget` e installazione su smartphone.
- **[Linee Guida Contributori (`docs/CONTRIBUTING.md`)](./docs/CONTRIBUTING.md)** — Come configurare l'ambiente di sviluppo, eseguire i test, convenzioni di commit e inviare Pull Request.
- **[Architettura di Sistema (`docs/ARCHITECTURE.md`)](./docs/ARCHITECTURE.md)** — Topologia del monorepo, pipeline di storage a 3 livelli (`SQLite-Wasm` + `OPFS` + `File System Access API`), sincronizzazione offline-first, merge LWW e architettura UI adattiva (View Mode, layout a pannelli semantici e split-view).
- **[Analisi del Prodotto & Regole Contabili (`docs/PRODUCT_ANALYSIS.md`)](./docs/PRODUCT_ANALYSIS.md)** — Invariante Zero-Float Fiat, ciclo di budget custom, algoritmo Tricount Greedy Minimum Cash Flow e Crypto WAC.
- **[Schema Database SQLite v2 (`docs/DATABASE_SCHEMA.md`)](./docs/DATABASE_SCHEMA.md)** — Schema relazionale completo delle 17 tabelle del formato `.dbbudget` con indici parziali e vincoli d'integrità.
- **[Architettura Multi-Agente (`docs/AGENTS_ARCHITECTURE.md`)](./docs/AGENTS_ARCHITECTURE.md)** — Topologia dell'Orchestratore e dei Sub-Agenti specializzati.

---

## 🎨 Nuova Identità Visiva, Iconografia & PWA

DailyBudget v0.2 introduce un'identità visiva rinnovata con l'icona ufficiale dell'applicazione (SVG vettoriale con monogramma a forziere e moneta dorata su gradiente smeraldo-ottanio):
- **Icona Applicativa In-App**: sostituisce il vecchio riquadro testuale "DB" con il logo vettoriale ad alta definizione (`DailyBudgetAppIcon`), coerente tra tema chiaro e scuro.
- **Icona Scheda Browser & Favicon**: `favicon.svg` e `favicon.ico` ottimizzati per la barra delle schede del browser desktop.
- **Supporto PWA & "Aggiungi a Schermata Home"**: bundle completo per smartphone con `apple-touch-icon.png` (180x180 per iOS Safari), icone Android `pwa-192x192.png` e `pwa-512x512.png` (`purpose: any maskable`), e `site.webmanifest` con colore a tema `#0f766e` e visualizzazione a schermo intero (`standalone`).

---

## 📱 Esperienza d'Uso: Header Unificato & Sistema View Mode

### 🔝 Testata Superiore Unificata (Brand Cluster & Menu Top-Right)
L'interfaccia adotta una testata pulita che riunisce tutte le azioni di gestione del database e le preferenze:
- **Brand Cluster (in alto a sinistra)**: allinea l'icona ufficiale dell'app, il titolo *DailyBudget*, il badge di versione e la pillola interattiva con lo stato del file SQLite `.dbbudget` (nome file, dimensione e backend di storage attivo: *DISK-SYNC*, *OPFS* o *Memory*).
- **Menu Unificato Dropdown (in alto a destra)**: alla stessa altezza del titolo, un unico pulsante menu a comparsa raggruppa in sezioni logiche tutte le funzionalità prima disperse nella barra:
  1. **Archiviazione & File .dbbudget**: Salva su Disco (File System Access API), Apri file, Esporta copia binaria, Merge LWW row-level, Nuovo Workspace vuoto e Ripristina dati Demo.
  2. **Dati Esterni**: Sincronizzazione tassi BCE Frankfurter e quotazioni Crypto CoinGecko con resilienza offline.
  3. **Visualizzazione & Tema**: Cambio rapido Tema Chiaro/Scuro e selettore Layout (Auto / Mobile / Desktop).
  4. **Sicurezza**: Blocco rapido della sessione (quando il PIN locale è attivo).

### 📐 Motore View Mode & Navigazione Adattiva
L'interfaccia si adatta dinamicamente alle dimensioni del dispositivo o alla preferenza scelta dall'utente:

- **Auto (📱🖥️)**: Rileva automaticamente la risoluzione dello schermo (breakpoint a `860px`), passando fluidamente dalla visualizzazione mobile compatta a quella desktop estesa.
- **Mobile (📱)**: Ottimizza l'interfaccia con proporzioni verticali smartphone (`max-width: 480px`), abilitando la **Bottom Navigation Bar** fissa in basso a sole icone touch (`48x44px`), indicatori visivi dot badge e barra orizzontale dedicata per la data di simulazione. I pannelli funzionali sono disposti in un unico flusso scorrevole.
- **Desktop (🖥️)**: Layout widescreen espanso (`max-width: 1440px`) con navigazione a schede orizzontali e **pannelli affiancati multi-schermo (split-view)** per gestire contemporaneamente inserimento dati e storici senza perdere il contesto visivo (Quick-Add vs Storico Transazioni, Setup Prestito vs Piano di Rimborso, Spese Tricount vs Saldi, Holdings vs Portafoglio WAC).

---

## 🚀 Utilizzo su Smartphone & Deploy Web

### Accesso da Smartphone (PWA Offline)
DailyBudget può essere eseguito da qualsiasi browser mobile (Safari su iOS o Chrome su Android) e salvato sulla schermata Home come una normale applicazione:
1. Apri l'indirizzo della WebApp dal browser del telefono.
2. Seleziona **"Aggiungi a schermata Home"** dal menu di condivisione del browser.
3. L'icona ufficiale dell'app verrà creata sulla Home e l'app funzionerà a schermo intero anche senza connessione internet (in modalità aereo o offline).

### Deploy Automatico su GitHub Pages
Il repository include un workflow GitHub Actions preconfigurato ([`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)):
1. Rendi il repository pubblico su GitHub (`Settings > Danger Zone > Change visibility`).
2. Vai su **Settings > Pages** e seleziona **GitHub Actions** come sorgente.
3. Ad ogni `git push` su `main`, il workflow compilerà la WebApp ed effettuerà il deploy su `https://<tuo-utente>.github.io/DailyBudget/`.

---

## 💻 Sviluppo Locale

### Prerequisiti
- **Node.js**: `>= 20` (consigliata 22 LTS)
- **pnpm**: `>= 9` (consigliata 10)

```bash
# Installa le dipendenze del monorepo
pnpm install

# Esegui i test unitari e di integrazione (Core, DB, Web)
pnpm test

# Verifica i tipi TypeScript su tutti i pacchetti
pnpm typecheck

# Compila la WebApp per la produzione
pnpm build

# Avvia la WebApp in modalità sviluppo locale
pnpm dev
```

---

## 🔒 Sicurezza & Protezione Accesso

DailyBudget non richiede alcun PIN al primo avvio. Per chi desidera proteggere l'accesso all'apertura dell'applicazione (particolarmente utile su dispositivi condivisi o smartphone):
- Accedi al tab **"Impostazioni & Sicurezza"**.
- Imposta un PIN numerico personalizzato (da 4 a 8 cifre).
- Il PIN viene memorizzato esclusivamente in locale nel browser del dispositivo. Puoi modificarlo o rimuoverlo in qualsiasi momento con un solo clic.

---

## 📄 Licenza

Distribuito sotto licenza Open Source **MIT**. Consulta il file [`LICENSE`](./LICENSE) per maggiori informazioni.
