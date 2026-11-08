# Linee Guida per i Contributori — DailyBudget

Grazie per il tuo interesse nel contribuire a **DailyBudget**! Questo progetto è completamente Open Source, Local-First e guidato dalla comunità.

---

## 1. Principi Architetturali Fondamentali

Prima di proporre modifiche o nuove funzionalità, ti chiediamo di rispettare i principi cardine del progetto:

1. **Local-First & Zero-Cloud**: Nessuna logica contabile o dato personale deve dipendere da server esterni o backend proprietari.
2. **Formato Portatile `.dbbudget`**: L'intero stato dell'utente deve poter risiedere ed essere esportato in un singolo file SQLite3 standard con lo schema definito in [`docs/DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md).
3. **Invariante Zero-Float**: Tutti i calcoli contabili, saldi e quote monetarie devono essere calcolati rigorosamente in **centesimi interi** (`integer` in SQLite) per prevenire errori di floating point.
4. **Isolamento del Core**: La logica matematica e contabile in `packages/core` deve rimanere in TypeScript puro senza dipendenze da React, DOM o Node.js.

---

## 2. Configurazione dell'Ambiente di Sviluppo

Il repository è strutturato come monorepo gestito con **Turborepo** e **pnpm**:

### Prerequisiti
- **Node.js**: versione `>= 20` (consigliata versione 22 LTS).
- **pnpm**: versione `>= 9` (consigliata versione 10).

### Installazione
```bash
# Clona il repository
git clone https://github.com/Yhtnay/DailyBudget.git
cd DailyBudget

# Installa le dipendenze in tutti i pacchetti del workspace
pnpm install
```

### Avvio del Server di Sviluppo
```bash
pnpm dev
```
La WebApp sarà accessibile su `http://localhost:5173`.

---

## 3. Test e Verifica dei Tipi

Tutti i pacchetti includono test unitari e di integrazione eseguiti con il test runner nativo di Node.js e `tsx`. Prima di aprire una Pull Request, assicurati che tutti i controlli passino con successo:

```bash
# Esegui i test su tutti i pacchetti (core, db, web)
pnpm test

# Verifica i tipi TypeScript
pnpm typecheck

# Compila la WebApp per verificare la build di produzione
pnpm build
```

---

## 4. Struttura del Monorepo

```text
DailyBudget/
├── apps/
│   └── web/                  # SPA/PWA React 19 + TypeScript + Vite (100% Local-First)
│       ├── src/
│       │   ├── components/   # Componenti modulari per tab (Dashboard, Tx, Tricount, Loans, Crypto)
│       │   ├── PinSecurity.tsx # Gestione sicurezza e blocco PIN opzionale
│       │   └── App.tsx       # Root orchestratore dell'interfaccia
├── packages/
│   ├── core/                 # Motore contabile e algoritmi (Tricount Min Cash Flow, WAC, Cycle)
│   └── db/                   # SQLite-Wasm, schema v2, persistenza OPFS / File System Access API
├── docs/                     # Documentazione architetturale, manuale utente ed ER diagram
└── .github/workflows/        # Automazioni CI/CD e deploy su GitHub Pages
```

---

## 5. Convenzioni di Commit e Flusso di Lavoro

- Utilizziamo convenzioni **Conventional Commits**:
  - `feat(...)`: nuova funzionalità
  - `fix(...)`: risoluzione di un bug
  - `refactor(...)`: refactoring del codice senza modifiche funzionali
  - `docs(...)`: aggiornamento documentazione
  - `test(...)`: aggiunta o miglioramento di test
- Per proporre modifiche:
  1. Crea un branch descrittivo (`git checkout -b feat/nome-funzionalita`).
  2. Implementa le modifiche assicurandoti di aggiungere o aggiornare i relativi test.
  3. Verifica con `pnpm typecheck && pnpm test && pnpm build`.
  4. Invia una Pull Request verso il branch `main`.

Grazie per contribuire a rendere la gestione finanziaria libera, privata e aperta a tutti!
