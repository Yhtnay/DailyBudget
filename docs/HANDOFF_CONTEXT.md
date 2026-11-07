# PROJECT HANDOFF: DailyBudget (Local-First Financial & Crypto Tracker)

## 1. Visione & Filosofia Architetturale
**DailyBudget** è un'applicazione finanziaria **Open Source, Local-First e Privacy-First** progettata per partire come WebApp (eseguibile al 100% in locale da browser senza server obbligatori) ed espandersi a iOS e Android con forte integrazione nativa (Widget e Smartwatch).

* **Formato Dati Portatile (`.dbbudget`):** L'intero workspace dell'utente è un singolo file database **SQLite**.
  * **Su Web:** Gestito tramite `SQLite-Wasm` + `OPFS` (Origin Private File System) e `File System Access API` per leggere/scrivere direttamente sul file `.dbbudget` presente sul disco locale dell'utente.
  * **Su Mobile (iOS/Android):** Il file SQLite risiede nell'App Group (iOS) o Shared Storage (Android) affinché i target nativi (WidgetKit, WatchOS, Jetpack Glance, Wear OS) possano accedere istantaneamente ai dati senza avviare il runtime JS.
* **Struttura Monorepo (`Turborepo` + `pnpm`):**
  * `packages/core`: TypeScript puro. Logica di calcolo DailyBudget, motore P&L Crypto (WAC), risolutore debiti Tricount (Minimum Cash Flow), regole di priorità budget. Zero dipendenze da UI/piattaforma.
  * `packages/db`: Schema SQLite, migrazioni (Drizzle ORM) e File Manager per import/export `.dbbudget`.
  * `packages/ui`: Design system condiviso (TailwindCSS + shadcn/ui, supporto Tema Chiaro/Scuro, RTL, Dynamic Type, VoiceOver).
  * `apps/web`: SPA/PWA in React + Vite (eseguibile via `npm run dev` o container locale).
  * `apps/mobile`: React Native + Expo Prebuild (CNG) con estensioni native Swift (WidgetKit, Siri Shortcuts, WatchOS) e Kotlin (Jetpack Glance, App Actions, Wear OS).

---

## 2. Invarianti Contabili e Regole di Business (CONSOLIDATE)

### A. Zero Floating-Point per Valute Fiat
* Tutti gli importi monetari sono memorizzati come **interi in centesimi (minor units)** (`12,50 €` = `1250`).
* Ogni transazione salva `amount`, `currency`, `exchange_rate_to_base` (tasso storico al momento della spesa) e `base_amount` (convertito nella valuta principale del workspace).
* Le quantità Crypto usano stringhe decimali ad alta precisione (es. `"0.04523100"`) per evitare overflow su 8-18 decimali.

### B. Separazione tra Cashflow (`base_amount`) e Competenza Budget (`budget_base_amount`)
* `base_amount`: L'importo reale che muove il saldo del conto bancario.
* `budget_base_amount`: L'importo che impatta effettivamente il calcolo del **DailyBudget**.
  * *Esempio Tricount:* Pago 100 € di cena per 4 persone col mio conto -> `base_amount = 10000` (escono 100 € dal conto), ma `budget_base_amount = 2500` (solo la mia quota di 25 € riduce il mio DailyBudget; i restanti 75 € sono credito verso gli amici).

### C. Regola di Priorità sul Budget (Transaction Override > Account Default)
* Il budget è **generale** (su scala workspace).
* Ogni conto ha un flag di default `include_in_budget` (`1` o `0`).
* Ogni transazione ha un campo nullable `include_in_budget` (`NULL`, `1`, `0`):
  * `1`: Forza l'inclusione nel budget (anche se il conto di origine è escluso, es. Conto Risparmio).
  * `0`: Forza l'esclusione dal budget (anche se il conto di origine è incluso).
  * `NULL`: Eredita l'impostazione del conto.
* **Regola ferrea:** Lo stato sulla transazione ha **sempre** priorità assoluta sullo stato del conto. Giroconti (`transfer`), movimenti prestiti (`loan_movement`) e rimborsi saldi Tricount (`tricount_settlement`) sono esclusi di default dal budget salvo forzatura esplicita (`1`).

### D. Categorie Multiple (Split) vs Tag Multipli
* **Multi-Categoria (`transaction_splits`):** Una transazione può essere suddivisa in $N$ sottovoci categorizzate (la somma degli split deve eguagliare `budget_base_amount`).
* **Multi-Tag (`tags` + `transaction_tags`):** Relazione M:N libera trasversale (es. `#viaggio`, `#lavoro`, `#rimborsabile`) che non altera i limiti di spesa delle categorie.

### E. Formula del Motore "DailyBudget" Dinamico
Separa il Pool Fisso (affitto, bollette, ricorrenze fisse) dal Pool Variabile:
1. `EffectiveFixed = max(FixedPlanned, FixedActual)`
2. `VariablePool = MonthlyBudgetTarget - EffectiveFixed`
3. `AvailableStartOfToday = VariablePool - VariableSpentBeforeToday`
4. `DailyAllowanceToday = floor(AvailableStartOfToday / DaysRemainingIncludingToday)`
5. `RemainingToday = DailyAllowanceToday - VariableSpentToday`
* Include calcolo **Burn Rate** e proiezione fine mese (`ProjectedMonthEndTotal`).

### F. Moduli Prestiti (`loans`) & Tricount (`tricount_*`)
* **Prestiti/Debiti:** Traccia crediti (`lent`) e debiti/finanziamenti (`borrowed`) con capitale iniziale, residuo, tasso d'interesse e flag `count_installments_in_budget`.
* **Tricount Integrato:** Gestione gruppi di spesa condivisa, partecipanti (con flag `is_me = 1` per collegare le quote personali al proprio DailyBudget), divisioni (`equal`, `exact`, `percentage`, `shares`) e algoritmo Greedy Minimum Cash Flow per ridurre al minimo il numero di transazioni di rimborso.

### G. Tabella Snapshot per Widget & Watch (`widget_snapshot`)
* Tabella a riga singola aggiornata a ogni mutazione che pre-calcola `daily_budget_remaining`, `daily_budget_allowance`, `month_remaining_budget`, `crypto_total_value` e `crypto_pnl_pct` per letture native O(1) da smartwatch e widget.

---

## 3. Stato del Progetto: Cosa è Fatto vs Cosa Resta da Definire (Backlog per Argon)

### ✅ COMPLETATO
1. Scelta dello stack tecnologico e architettura Local-First.
2. Design completo dello schema SQLite v2 (`schema_v2.sql`).
3. Algoritmi core in TypeScript (`calculateDailyBudget`, `doesTransactionAffectBudget`, `calculateTricountSettlements`).

### 🚧 DA DEFINIRE E SVILUPPARE (Prossimi Step per AI Argon)
1. **Scaffolding Monorepo & Persistenza Locale (`apps/web` + `packages/db`):**
   * Configurazione concreta di `wa-sqlite` o `@sqlite.org/sqlite-wasm` con OPFS e `File System Access API` per aprire/salvare file `.dbbudget` dal browser locale.
2. **Prototipo UI/UX WebApp (`apps/web`):**
   * Dashboard principale con anello/indicatore del DailyBudget in tempo reale, quick-add transazione (con split categorie, multi-tag e override budget), vista Conti, vista Tricount, vista Prestiti e vista Crypto Portfolio.
3. **Flussi Edge-Case da rifinire:**
   * Gestione multi-valuta dentro i gruppi Tricount (spese in valuta estera convertite nella valuta del gruppo e poi nella valuta base del proprio DailyBudget).
   * Strategia di sincronizzazione opzionale (Sync Adapter E2EE / CRDT per quando l'utente vuole condividere un conto o un gruppo Tricount live tra più dispositivi).
   * Integrazione API esterne (Frankfurter per cambi Fiat, CoinGecko per prezzi Crypto) con fallback totale offline.