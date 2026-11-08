# Manuale Utente — DailyBudget v0.2.0

Benvenuto in **DailyBudget**, l'applicazione per la gestione delle finanze personali progettata secondo i principi **Local-First**, **Privacy-First** e **Zero-Cloud**.

Tutti i tuoi dati finanziari risiedono in un singolo file SQLite portatile con estensione `.dbbudget`, archiviato e gestito direttamente dal tuo browser sul tuo dispositivo (PC, tablet o smartphone). Nessun dato bancario, importo o password viene mai inviato a server esterni o memorizzato in cloud di terzi.

---

## Indice dei Contenuti
1. [Filosofia e Architettura Local-First](#1-filosofia-e-architettura-local-first)
2. [Il Modello Matematico del DailyBudget](#2-il-modello-matematico-del-dailybudget)
3. [Guida ai Moduli Applicativi](#3-guida-ai-moduli-applicativi)
   - [3.1 Dashboard & DailyBudget](#31-dashboard--dailybudget)
   - [3.2 Conti Bancari, Categorie e Tag](#32-conti-bancari-categorie-e-tag)
   - [3.3 Registrazione Transazioni e Split](#33-registrazione-transazioni-e-split)
   - [3.4 Allegati e Scontrini Intelligenti](#34-allegati-e-scontrini-intelligenti)
   - [3.5 Ricorrenze Automatiche (Scheduler)](#35-ricorrenze-automatiche-scheduler)
   - [3.6 Spese di Gruppo (Tricount) & Minimo Cashflow](#36-spese-di-gruppo-tricount--minimo-cashflow)
   - [3.7 Prestiti e Debiti](#37-prestiti-e-debiti)
   - [3.8 Portfolio Crypto WAC & PAC Fiat](#38-portfolio-crypto-wac--pac-fiat)
4. [Persistenza, File `.dbbudget` e Backup](#4-persistenza-file-dbbudget-e-backup)
5. [Utilizzo su Smartphone & Installazione PWA (Offline)](#5-utilizzo-su-smartphone--installazione-pwa-offline)
6. [Sicurezza e Protezione con PIN Locale](#6-sicurezza-e-protezione-con-pin-locale)
7. [Import / Export CSV e Sincronizzazione Multi-Dispositivo](#7-import--export-csv-e-sincronizzazione-multi-dispositivo)
8. [Domande Frequenti (FAQ) & Risoluzione Problemi](#8-domande-frequenti-faq--risoluzione-problemi)

---

## 1. Filosofia e Architettura Local-First

A differenza delle tradizionali applicazioni finanziarie in abbonamento:
- **Nessuna Registrazione o Account**: Non devi creare un profilo utente né condividere la tua email.
- **Sovranità sui Dati**: Il database SQLite `.dbbudget` è memorizzato sul tuo dispositivo. Se elimini la cache o cambi browser, ti basta caricare il tuo file `.dbbudget` per riprendere da dove avevi lasciato.
- **Funziona al 100% Offline**: Una volta caricata la pagina nel browser (o installata l'icona PWA sulla schermata Home dello smartphone), l'app calcola e salva tutto anche senza connessione internet o in modalità aereo.
- **Zero Dipendenze da Server**: Nessuna API remota deve elaborare i tuoi calcoli. Il motore contabile in WebAssembly (`sql.js`) gira all'interno della memoria del tuo browser.

---

## 2. Il Modello Matematico del DailyBudget

Il cuore di DailyBudget è la distinzione rigorosa tra **Spese Fisse** e **Spese Variabili**:

### Formula di Ripartizione
All'inizio del ciclo di budget mensile (personalizzabile, ad esempio dal giorno 1 al 31, oppure dal 27 al 26 per chi riceve lo stipendio a fine mese):

$$\text{Plafond Variabile} = \text{Budget Mensile} - \max(\text{Spese Fisse Pianificate}, \text{Spese Fisse Effettive})$$

$$\text{Quota Giornaliera Dinamica} = \frac{\text{Plafond Variabile} - \text{Variabile Speso Finora}}{\text{Giorni Rimasti nel Ciclo}}$$

$$\text{Disponibilità Oggi} = \text{Quota Giornaliera Dinamica} - \text{Variabile Speso Oggi}$$

### Proprietà del Calcolo:
1. **Floor Anti-Sforamento a 0,00 €**: Se hai speso tutto il plafond variabile disponibile prima della fine del mese, la quota giornaliera non va in negativo, ma si attesta a `0,00 €`, avvisandoti visivamente dello sforamento senza causare anomalie matematiche.
2. **Auto-Compensazione**: Se oggi spendi meno della quota giornaliera, l'importo non speso viene distribuito uniformemente su tutti i giorni rimanenti del mese, aumentando automaticamente la disponibilità dei giorni futuri.
3. **1-Click Savings Sweep**: A fine mese, se avanza del budget variabile, con un solo clic puoi trasferire l'avanzo in un conto di risparmio o investimento dedicato.

---

## 3. Guida ai Moduli Applicativi

### 3.1 Dashboard & Hub Operativo Mobile
La schermata principale è progettata come il tuo **Hub Quotidiano Mobile**, riunendo in un solo posto le informazioni essenziali e le azioni più frequenti a portata di pollice:

- **Disponibilità Oggi**: Il numero cardine per le tue decisioni quotidiane. Indica quanto puoi spendere oggi senza compromettere gli obiettivi mensili.
- **Indicatori Visivi di Stato**:
  - 🟢 **Sicuro**: La spesa odierna è al di sotto della quota del giorno.
  - 🟡 **Attenzione**: Ti stai avvicinando al limite della quota giornaliera.
  - 🔴 **Sforamento**: Hai superato la quota odierna o il plafond mensile.
- **Hub Azioni Rapide (`Quick Actions`)**:
  - **Spesa Rapida**: Apre un pannello touch immediato per registrare un'uscita in pochi secondi (con tastierino decimale, conto e categoria) senza dover aprire il modulo Transazioni.
  - **Nuova Entrata**: Registra al volo stipendi, incassi o rimborsi sul conto selezionato.
  - **Giroconto**: Esegue all'istante uno spostamento tra due tuoi conti (ad es. da Conto Corrente a Conto Deposito) a impatto zero sul budget.
  - **Spesa Gruppo**: Scorciatoia diretta per passare al modulo Spese Condivise (Tricount).
  - **Sweep Risparmi**: Pulsante che a fine mese consente di trasferire con un solo clic il budget variabile risparmiato verso il tuo conto di accumulo.
- **Feed Immediato**:
  - **Spese di Oggi**: Elenco trasparente delle sole uscite effettuate nella giornata corrente, con categoria, conto e importo evidenziato per verificare subito cosa ha ridotto la disponibilità odierna.
  - **I Miei Conti**: Panoramica sintetica dei saldi aggiornati di tutti i tuoi conti.
  - **Anteprima Widget & Orologio**: Mostra in tempo reale lo snapshot serializzato a tempo zero per i widget nativi di iOS/Android e gli smartwatch.
- **Icone Informative (`InfoTip`)**: Le descrizioni a schermo fisso sono state sostituite da icone interattive `(i)`: toccandole si apre un riquadro popover esplicativo leggero, chiudibile con un tocco sullo sfondo o sul tasto `X`.

---

### 3.2 Conti Bancari, Categorie e Tag
Nel modulo **Conti, Split & Transazioni**:
- **Creazione Conti**: Puoi creare molteplici conti indicando nome, tipologia (`checking`, `savings`, `credit_card`, `cash`, `investment`) e valuta (`EUR`, `USD`, `CHF`, `GBP`, ecc.).
- **Saldo Calcolato vs Reale**: Il saldo viene aggiornato atomicamente ad ogni transazione con vincolo zero-float (in centesimi interi).
- **Categorie**: Assegnazione per tipologia di spesa (Alimentari, Casa, Trasporti, Svago, Salute, ecc.) con indicazione di appartenenza a Spese Fisse o Spese Variabili.
- **Tag**: Etichette trasversali (es. `#viaggio2026`, `#fisco`, `#lavoro`).

---

### 3.3 Registrazione Transazioni e Split
DailyBudget utilizza un linguaggio chiaro e naturale per ogni movimento finanziario:
1. **Spesa**: Uscita di denaro che riduce il saldo del conto selezionato e viene conteggiata nella disponibilità del giorno (a meno che non sia forzata fuori budget).
2. **Entrata**: Accredito che incrementa il saldo del conto selezionato.
   - *Nota Rimborsi*: Se un'entrata rappresenta un rimborso spese (es. spese mediche o aziendali anticipate), puoi contrassegnarla con **"Forzato: Nel Budget"** in modo che reintegri direttamente il tuo budget variabile del mese.
3. **Giroconto**: Spostamento di denaro tra due tuoi conti personali (ad es. da Conto Corrente a Conto Deposito) a impatto zero sul budget.
4. **Split Multi-Categoria**: Puoi dividere un unico scontrino (es. 100 € al supermercato) in più voci (es. 70 € Alimentari, 20 € Casa, 10 € Svago). DailyBudget verifica al centesimo che la somma degli split coincida esattamente con l'importo totale.
5. **Cassa vs Budget**: Per ogni movimento la schermata mostra chiaramente l'impatto di **Cassa** (il denaro effettivo movimentato sul conto) e l'impatto sul **Budget** (la quota di propria competenza che incide sul DailyBudget).

---

### 3.4 Allegati e Scontrini Intelligenti
Puoi allegare foto di scontrini, fatture e ricevute direttamente a ciascuna transazione:
- **Compressione Automatica Client-Side**: Le immagini ad alta risoluzione caricate dal telefono vengono ridimensionate e compresse nel browser senza appesantire il file database.
- **Strategia Ibrida**: Gli allegati leggeri (`<= 500 KB`) vengono salvati direttamente come blob nel file `.dbbudget`, garantendo portabilità totale in un solo file.

---

### 3.5 Ricorrenze Automatiche (Scheduler)
Nel tab Transazioni puoi configurare regole periodiche:
- **Frequenze Supportate**: Giornaliera, Settimanale, Quindicinale, Mensile, Trimestrale, Semestrale, Annuale.
- **Clamping Fine Mese**: Se imposti una ricorrenza il giorno 31, nei mesi di 30 o 28 giorni verrà applicata in modo affidabile all'ultimo giorno utile (senza saltare mesi).
- **Elaborazione Automatica**: All'avvio dell'applicazione o al cambio di data, DailyBudget individua le regole scadute e genera automaticamente le transazioni collegate aggiornando le date successive.

---

### 3.6 Spese di Gruppo (Tricount) & Minimo Cashflow
Ideale per coinquilini, viaggi tra amici o coppie:
- **Gruppi Indipendenti**: Crea gruppi con valuta dedicata e membri personalizzati.
- **Ripartizioni Flessibili**: Divisione in parti uguali o con pesi personalizzati.
- **Algoritmo Greedy Minimum Cash Flow**: Calcola la compensazione ottimale riducendo al minimo assoluto il numero di bonifici necessari per saldare i debiti reciproci.
- **Competenza vs Cassa**:
  - *Competenza*: La tua quota spesa incide subito sul tuo DailyBudget.
  - *Cassa*: Solo quando saldi fisicamente il debito verso l'amico l'importo viene scalato dal budget.

---

### 3.7 Prestiti e Debiti
Traccia i crediti verso terzi e i debiti contratti:
- Visualizzazione del capitale iniziale, dell'importo già rimborsato e del residuo.
- Registrazione rimborsi parziali con data, conto di accredito/addebito e note.
- Stato automatico: `active` o `settled` quando il debito è estinto.

---

### 3.8 Portfolio Crypto WAC & PAC Fiat
- **Tracciamento Asset**: Supporta qualsiasi criptovaluta o token (BTC, ETH, SOL, AVAX, ecc.).
- **Valore di Carico & Prezzo Medio d'Acquisto**: Calcola in tempo reale il valore di carico ponderato (WAC) delle posizioni aperte.
- **P&L Realizzato e Non Realizzato**: Mostra i profitti o le perdite correnti rispetto ai prezzi di mercato.
- **Collegamento Fiat**: Acquistando crypto con un conto bancario collegato, il saldo del conto corrente viene aggiornato automaticamente e puoi scegliere se conteggiare l'acquisto come PAC (attivando l'opzione "Forzato: Nel Budget").
- **Sincronizzazione Mercati**: Tassi di cambio fiat (BCE) e prezzi crypto (CoinGecko) con fallback resiliente offline in caso di assenza di rete.

---

## 4. Persistenza, File `.dbbudget`, Menu Header & Backup

DailyBudget utilizza un'architettura di salvataggio a **3 livelli sincronizzati**:
1. **OPFS (Origin Private File System)**: Memoria interna del browser per l'auto-salvataggio istantaneo ad ogni modifica (senza finestre di dialogo fastidiose).
2. **IndexedDB Fallback**: Utilizzato in automatico qualora il browser non supporti OPFS (es. finestre in incognito o vecchie versioni).
3. **File System Access API (Desktop Chrome / Edge / Brave)**: Puoi collegare direttamente un file `.dbbudget` salvato nella cartella Documenti del tuo computer: le modifiche verranno scritte direttamente sul file su disco.

### 🔝 Menu Unificato Header (in alto a destra)
Tutte le azioni di persistenza e configurazione dell'applicazione sono raggruppate nel **Menu in alto a destra** (pulsante `Menu` con icona hamburger e freccia chevron), posizionato alla stessa altezza del logo e titolo DailyBudget:
- **Workspace Attivo**: Mostra il nome del file SQLite `.dbbudget` in uso e il tipo di salvataggio attivo (*DISK-SYNC*, *OPFS* o *Memory*).
- **Archiviazione & File .dbbudget**:
  - **Salva su Disco / Collega**: Attiva la scrittura diretta sul file `.dbbudget` locale tramite File System Access API.
  - **Apri file .dbbudget**: Carica un database SQLite binario già esistente salvato sul dispositivo.
  - **Esporta .dbbudget**: Scarica una copia binaria di backup del file corrente.
  - **Merge LWW**: Sincronizza e fonde un altro file `.dbbudget` con risoluzione Last-Write-Wins riga per riga.
  - **Nuovo Workspace**: Inizializza un database vuoto pulito per un nuovo utente o anno fiscale.
  - **Ripristina Demo**: Ricarica il dataset dimostrativo completo con transazioni, gruppi e portafoglio crypto di esempio.
- **Dati Esterni**:
  - **Sync Tassi & Crypto**: Aggiorna i tassi di cambio ufficiali BCE da Frankfurter e le quotazioni crypto da CoinGecko (con fallback locale automatico se offline).
- **Visualizzazione & Tema**:
  - **Tema Chiaro / Scuro**: Cambia la palette grafica tra modalità dark e light.
  - **Selettore View Mode (Auto / Mobile / Desktop)**: Alterna il layout tra adattivo automatico, ottimizzato per smartphone o espanso a pannelli affiancati per desktop.

### Backup Consigliato:
Apri il menu in alto a destra e clicca periodicamente su **"Esporta .dbbudget"**: verrà scaricato il file database completo contenente transazioni, conti, gruppi e allegati. Puoi conservarlo su chiavetta USB, hard disk o inviartelo via email.

---

## 5. Utilizzo su Smartphone & Installazione PWA (Offline)

Puoi utilizzare DailyBudget comodamente da qualsiasi browser per smartphone (iOS Safari, Android Chrome, Firefox):

### Installazione come WebApp (Home Screen con Icona Ufficiale):
1. **iOS (iPhone/iPad)**:
   - Apri il link nel browser **Safari**.
   - Tocca l'icona di **Condivisione** (il quadrato con la freccia verso l'alto).
   - Scorri verso il basso e tocca **"Aggiungi a schermata Home"**.
   - L'icona ufficiale dell'applicazione (forziere con finitura oro e smeraldo) comparirà nell'anteprima; tocca **"Aggiungi"** in alto a destra.
2. **Android**:
   - Apri il link in **Chrome**.
   - Tocca il menu a tre puntini in alto a destra.
   - Tocca **"Aggiungi a schermata Home"** o **"Installa app"**.
   - Conferma l'installazione: l'icona PWA ad alta definizione maskable verrà posizionata nel launcher.

L'icona ufficiale di DailyBudget apparirà sulla tua Home: aprendola, funzionerà a **schermo intero** come un'app nativa e potrà essere usata anche **senza connessione internet**.

### Esperienza Mobile-First & Navigazione:
- **Brand Cluster Compatto (in alto a sinistra)**: Icona ufficiale dell'app, titolo DailyBudget e pillola con nome del file e indicatore di salvataggio.
- **Menu Unificato Top-Right (in alto a destra)**: Il pulsante menu a comparsa è posizionato sulla stessa riga del titolo per massimizzare lo spazio verticale.
- **Bottom Navigation Bar (Fissa in Basso)**: Su smartphone, la barra di navigazione si ancora al fondo dello schermo (`58px` di altezza) con pulsanti touch a sole icone ergonomiche e indicatori badge dot per accedere con il pollice a Dashboard, Transazioni, Tricount, Prestiti, Crypto e Impostazioni.
- **Barra Data di Riferimento Dedicata**: La data di simulazione per testare scenari futuri o passati è comodamente posizionata in una barra compatta subito sotto la barra di stato.
- **Selettore View Mode (Auto / Mobile / Desktop)**: Nel menu in alto a destra trovi il selettore per scegliere la modalità di visualizzazione:
  - **Auto**: Riconosce automaticamente le dimensioni del dispositivo.
  - **Mobile**: Mantiene le proporzioni compatte dello smartphone (`480px`) con navigazione inferiore anche se apri l'app su un monitor desktop.
  - **Desktop**: Espande l'interfaccia a schermo intero widescreen (`1440px`) con navigazione a schede in alto e layout a pannelli affiancati (split-view).

---

## 6. Sicurezza e Protezione con PIN Locale

Al primo avvio, DailyBudget **non richiede alcun PIN** per consentirti di iniziare subito senza barriere.

Se desideri proteggere l'accesso all'applicazione (particolarmente utile su smartphone o su computer condivisi):
1. Clicca sul tab **"Impostazioni & Sicurezza"** nella barra di navigazione.
2. Nella sezione **"Imposta un Codice PIN di Blocco"**, scegli un codice numerico da 4 a 8 cifre e confermalo.
3. Clicca su **"Attiva Protezione PIN"**.

### Caratteristiche del Blocco:
- **Tastierino Numerico Integrato**: All'avvio dell'applicazione comparirà la schermata di blocco con tastierino touch per mobile e supporto da tastiera fisica.
- **Nessuna Traccia Remota**: Il PIN è memorizzato unicamente nel `localStorage` del browser del tuo dispositivo.
- **Modifica o Rimozione**: Dal tab Impostazioni puoi cambiare il PIN o disattivarlo in qualsiasi momento inserendo il PIN attuale come conferma.
- **Blocco Rapido Sessione**: Quando il PIN è attivo, puoi bloccare istantaneamente la sessione aprendo il Menu in alto a destra e cliccando su **"Blocca Sessione"** (`#btn-lock-session`).

---

## 7. Import / Export CSV e Sincronizzazione Multi-Dispositivo

### Importazione Estratto Conto Bancario
Dal modulo Transazioni puoi importare estratti conto bancari in formato CSV (formato standard europeo con virgola/punto e date ISO o `DD/MM/YYYY`).
- **Deduplica Automatica**: DailyBudget calcola un hash deterministico per ciascuna riga, evitando di duplicare transazioni già registrate in passato.

### Sincronizzazione Multi-Dispositivo (Merge LWW)
Se usi DailyBudget sia su PC che su smartphone:
1. Esporta il file `.dbbudget` dal primo dispositivo.
2. Sul secondo dispositivo, clicca su **"Merge LWW"** e seleziona il file esportato.
3. Il motore esegue una riconciliazione automatica **Row-Level Last-Write-Wins (LWW)** basata sui timestamp di aggiornamento delle singole righe, unendo nuovi dati senza sovrascrivere modifiche più recenti.

---

## 8. Domande Frequenti (FAQ) & Risoluzione Problemi

#### I miei dati bancari finiscono su internet o su GitHub?
**No, mai.** Il codice ospitato su GitHub Pages distribuisce solo i file dell'applicazione (HTML/JS/WebAssembly). Tutta l'elaborazione avviene all'interno del tuo browser e il database risiede unicamente sul tuo dispositivo.

#### Se cancello la cronologia del browser perdo i miei dati?
La memoria OPFS/IndexedDB potrebbe essere svuotata se esegui una pulizia completa di *Tutti i dati dei siti web*. Per questo motivo è buona norma utilizzare periodicamente il pulsante **"Esporta .dbbudget"** per conservare una copia di backup del tuo file.

#### Posso aprire lo stesso file `.dbbudget` con altri programmi?
Sì. `.dbbudget` è un normale database **SQLite 3 standard**. Puoi aprirlo con qualsiasi visualizzatore SQLite (es. *DB Browser for SQLite*, *DBeaver* o terminale `sqlite3`) ed eseguire query SQL personalizzate.

#### Cosa fare se dimentico il PIN impostato?
Poiché il PIN è memorizzato in locale nel `localStorage` del browser, è sufficiente cancellare i dati di archiviazione locale del sito nelle impostazioni del browser (o digitare `localStorage.removeItem('dailybudget_pin_code'); localStorage.removeItem('dailybudget_pin_enabled');` nella console sviluppatore) per reimpostare l'accesso.
