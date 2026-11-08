# DailyBudget: Istruzioni di Progetto & Topologia Multi-Agente

## 1. Topologia dei 6 Sub-Agenti Specializzati
All'avvio di ogni sessione o prima di apportare modifiche al progetto, l'assistente deve verificare ed eventualmente registrare i 6 subagenti dedicati descritti in `docs/AGENTS_ARCHITECTURE.md` (tramite `init-agents` o `define_subagent`):

1. **`core-quant-agent`**: Ownership esclusiva `packages/core/**` (Algoritmi contabili puri, zero floating-point, P&L Crypto WAC, algoritmo Tricount).
2. **`db-storage-agent`**: Ownership esclusiva `packages/db/**` (SQLite-Wasm, OPFS, schema DDL, migrazioni, aggiornamento atomico `accounts.cached_balance` e `widget_snapshot`).
3. **`web-ui-agent`**: Ownership esclusiva `apps/web/**` e `packages/ui/**` (React + Vite, Design System Tailwind/shadcn, viste modulari `*Tab.tsx`, tabular-nums, WCAG).
4. **`mobile-native-agent`**: Ownership esclusiva `apps/mobile/**` (Expo Prebuild CNG, target nativi Swift/Kotlin con lettura $O(1)$ di `widget_snapshot`).
5. **`qa-auditor-agent`**: Ownership trasversale `*.test.ts` (Verifica invarianti contabili, resti dispari, test end-to-end e pipeline `pnpm test && pnpm typecheck && pnpm build`).
6. **`docs-architect-agent`**: Ownership esclusiva `docs/**` e `README.md` (Documentazione e sincronizzazione diagrammi Mermaid).

## 2. Invarianti Contabili Non Negoziabili
- **Zero Floating-Point su Fiat**: Tutti gli importi monetari sono interi in centesimi (minor units, es. 12,50 € = 1250).
- **Separazione Cashflow vs Budget**: Distinzione rigorosa tra `base_amount` (impatto sul saldo del conto) e `budget_base_amount` (impatto sulla spesa del budget quotidiano).
- **Priorità Transazione > Conto**: Il campo `include_in_budget` sulla transazione sovrascrive sempre l'impostazione predefinita del conto (`1` include, `0` esclude, `NULL` eredita).
- **Crypto**: Quantità memorizzate come stringhe decimali ad alta precisione.

## 3. Modularità UI
I componenti della WebApp devono risiedere nei rispettivi tab modulari (`DashboardTab.tsx`, `TransactionsTab.tsx`, `TricountTab.tsx`, `LoansTab.tsx`, `CryptoTab.tsx`, `PersistenceHeader.tsx`) per prevenire file monolitici e massimizzare l'efficienza.
