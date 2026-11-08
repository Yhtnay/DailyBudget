# Schema Database SQLite v2 (`.dbbudget`) — DailyBudget

Ogni file `.dbbudget` è un database **SQLite3 standard** (`SQLite format 3\0`) definito in [`packages/db/schema/schema_v2.sql`](../packages/db/schema/schema_v2.sql) e tipizzato in [`packages/db/src/schema.ts`](../packages/db/src/schema.ts).

---

## 1. Diagramma Entità-Relazione Completo (`erDiagram`)

```mermaid
erDiagram
    workspace_settings {
        TEXT id PK "DEFAULT 'default'"
        TEXT name
        TEXT base_currency "DEFAULT 'EUR'"
        INTEGER monthly_budget_target "Centesimi interi"
        INTEGER month_start_day "1..28"
        INTEGER include_tricount_owes_immediately "0 | 1"
        INTEGER updated_at
    }

    exchange_rates {
        TEXT currency_pair PK "es. USD_EUR"
        REAL rate
        INTEGER updated_at
    }

    accounts {
        TEXT id PK
        TEXT name
        TEXT type "checking | savings | credit_card | cash"
        TEXT currency
        INTEGER initial_balance "Centesimi interi"
        INTEGER cached_balance "Centesimi interi"
        INTEGER credit_limit
        INTEGER include_in_budget "0 | 1 (Default Conto)"
        TEXT color
        TEXT icon
        INTEGER updated_at
        INTEGER is_deleted
    }

    account_members {
        TEXT account_id PK, FK
        TEXT user_id PK
        TEXT role "owner | editor | viewer"
        INTEGER updated_at
    }

    categories {
        TEXT id PK
        TEXT name
        TEXT type "income | expense"
        INTEGER monthly_limit "Centesimi interi"
        INTEGER is_fixed_expense "0 | 1"
        TEXT color
        TEXT icon
        INTEGER updated_at
        INTEGER is_deleted
    }

    tags {
        TEXT id PK
        TEXT name UK
        TEXT color
        INTEGER updated_at
        INTEGER is_deleted
    }

    recurring_rules {
        TEXT id PK
        TEXT account_id FK
        TEXT category_id FK
        INTEGER amount "Centesimi interi"
        TEXT currency
        TEXT description
        TEXT frequency "daily | weekly | monthly | yearly"
        INTEGER interval_count
        TEXT next_occurrence_date
        INTEGER auto_commit "0 | 1"
        INTEGER is_active "0 | 1"
        INTEGER updated_at
        INTEGER is_deleted
    }

    transactions {
        TEXT id PK
        TEXT account_id FK
        TEXT to_account_id FK
        TEXT recurring_rule_id FK
        TEXT loan_id FK
        TEXT tricount_expense_id FK
        TEXT type "income | expense | transfer | loan_movement | tricount_settlement"
        INTEGER amount "Centesimi valuta originale"
        TEXT currency
        REAL exchange_rate_to_base
        INTEGER base_amount "Cashflow Conto (Centesimi base)"
        INTEGER include_in_budget "NULL | 0 | 1 (Override Prioritario)"
        INTEGER budget_base_amount "Competenza Budget (Centesimi base)"
        INTEGER is_fixed "0 | 1"
        TEXT date "YYYY-MM-DD"
        INTEGER created_at
        TEXT description
        INTEGER updated_at
        INTEGER is_deleted
    }

    transaction_splits {
        TEXT id PK
        TEXT transaction_id FK
        TEXT category_id FK
        INTEGER amount_base "Somma = budget_base_amount"
        TEXT notes
    }

    transaction_tags {
        TEXT transaction_id PK, FK
        TEXT tag_id PK, FK
    }

    attachments {
        TEXT id PK
        TEXT transaction_id FK
        TEXT file_name
        TEXT mime_type
        TEXT storage_type "inline_blob | local_path | cloud_url"
        BLOB blob_data
        TEXT external_path
        INTEGER created_at
    }

    loans {
        TEXT id PK
        TEXT name
        TEXT counterparty_name
        TEXT type "lent | borrowed"
        TEXT currency
        INTEGER principal_amount "Centesimi interi"
        INTEGER remaining_amount "Centesimi interi"
        REAL interest_rate_pct
        TEXT start_date
        TEXT due_date
        INTEGER count_installments_in_budget "0 | 1"
        TEXT status "active | settled | forgiven"
        TEXT notes
        INTEGER updated_at
        INTEGER is_deleted
    }

    tricount_groups {
        TEXT id PK
        TEXT name
        TEXT default_currency
        TEXT description
        INTEGER is_archived "0 | 1"
        INTEGER updated_at
        INTEGER is_deleted
    }

    tricount_members {
        TEXT id PK
        TEXT group_id FK
        TEXT name
        INTEGER is_me "0 | 1"
        TEXT linked_user_id
        REAL weight
    }

    tricount_expenses {
        TEXT id PK
        TEXT group_id FK
        TEXT paid_by_member_id FK
        TEXT title
        INTEGER amount "Centesimi valuta spesa"
        TEXT currency
        REAL exchange_rate_to_group
        INTEGER group_amount "Centesimi valuta gruppo"
        TEXT expense_type "expense | transfer_settlement"
        TEXT date
        INTEGER updated_at
        INTEGER is_deleted
    }

    tricount_splits {
        TEXT id PK
        TEXT expense_id FK
        TEXT member_id FK
        TEXT split_mode "equal | exact | percentage | shares"
        REAL share_value
        INTEGER owed_group_amount "Centesimi valuta gruppo"
    }

    crypto_assets {
        TEXT id PK
        TEXT symbol
        TEXT name
        INTEGER current_price_base "Centesimi base"
        REAL price_change_24h_pct
        REAL alert_threshold_pct
        INTEGER last_price_update
    }

    crypto_transactions {
        TEXT id PK
        TEXT asset_id FK
        TEXT linked_account_id FK
        TEXT type "buy | sell | transfer_in | transfer_out | staking_reward"
        TEXT quantity "Stringa decimale 8-18 cifre"
        INTEGER price_per_unit_base "Centesimi base"
        INTEGER fee_base "Centesimi base"
        TEXT date
        TEXT notes
        INTEGER updated_at
        INTEGER is_deleted
    }

    widget_snapshot {
        TEXT id PK "DEFAULT 'current'"
        INTEGER daily_budget_remaining "Centesimi base"
        INTEGER daily_budget_allowance "Centesimi base"
        INTEGER month_remaining_budget "Centesimi base"
        INTEGER crypto_total_value "Centesimi base"
        REAL crypto_pnl_pct
        INTEGER updated_at
    }

    accounts ||--o{ account_members : "shared_with"
    accounts ||--o{ transactions : "source_account"
    accounts ||--o{ transactions : "destination_account"
    accounts ||--o{ recurring_rules : "schedules"
    accounts ||--o{ crypto_transactions : "settled_via"
    categories ||--o{ recurring_rules : "categorizes"
    categories ||--o{ transaction_splits : "allocates"
    transactions ||--o{ transaction_splits : "split_into"
    transactions ||--o{ transaction_tags : "tagged_with"
    tags ||--o{ transaction_tags : "applies_to"
    transactions ||--o{ attachments : "has_files"
    loans ||--o{ transactions : "installments"
    tricount_groups ||--o{ tricount_members : "has_members"
    tricount_groups ||--o{ tricount_expenses : "records"
    tricount_members ||--o{ tricount_expenses : "paid_by"
    tricount_expenses ||--o{ tricount_splits : "divided_into"
    tricount_members ||--o{ tricount_splits : "owes"
    tricount_expenses ||--o{ transactions : "links_personal_tx"
    crypto_assets ||--o{ crypto_transactions : "ledger"
```

---

## 2. Indici Parziali per Performance Query Local-First

Lo schema definisce 4 indici parziali filtrati su `WHERE is_deleted = 0` per mantenere istantanee le query di aggregazione mensile e di riconciliazione anche su file `.dbbudget` con decine di migliaia di movimenti:

| Nome Indice | Tabella e Colonna | Filtro Parziale | Scopo Principale |
| :--- | :--- | :--- | :--- |
| `idx_tx_date` | `transactions(date)` | `WHERE is_deleted = 0` | Calcolo istantaneo del mese corrente in `computeDailyBudgetForDate()` |
| `idx_tx_account` | `transactions(account_id)` | `WHERE is_deleted = 0` | Ricalcolo del saldo `cached_balance` per singolo conto |
| `idx_tx_loan` | `transactions(loan_id)` | `WHERE is_deleted = 0` | Storico rate e rimborsi associati a un prestito/debito |
| `idx_tx_tricount` | `transactions(tricount_expense_id)` | `WHERE is_deleted = 0` | Collegamento 1:1 tra spesa di gruppo Tricount e movimento sul conto personale |
