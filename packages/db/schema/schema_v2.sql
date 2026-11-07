-- =========================================================
-- DAILYBUDGET - SQLITE SCHEMA v2 (.dbbudget file format)
-- =========================================================

-- 1. IMPOSTAZIONI & VALUTE
CREATE TABLE workspace_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    name TEXT NOT NULL,
    base_currency TEXT NOT NULL DEFAULT 'EUR',
    monthly_budget_target INTEGER NOT NULL,
    month_start_day INTEGER NOT NULL DEFAULT 1,
    include_tricount_owes_immediately INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
);

CREATE TABLE exchange_rates (
    currency_pair TEXT PRIMARY KEY,
    rate REAL NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 2. CONTI E CONDIVISIONE
CREATE TABLE accounts (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('checking', 'savings', 'credit_card', 'cash')),
    currency TEXT NOT NULL DEFAULT 'EUR',
    initial_balance INTEGER NOT NULL DEFAULT 0,
    cached_balance INTEGER NOT NULL DEFAULT 0,
    credit_limit INTEGER,
    include_in_budget INTEGER NOT NULL DEFAULT 1,
    color TEXT,
    icon TEXT,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE account_members (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, user_id)
);

-- 3. CATEGORIE E TAG
CREATE TABLE categories (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
    monthly_limit INTEGER,
    is_fixed_expense INTEGER NOT NULL DEFAULT 0,
    color TEXT NOT NULL,
    icon TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

-- 4. PRESTITI E DEBITI (Loans & Debts)
CREATE TABLE loans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    counterparty_name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('lent', 'borrowed')),
    currency TEXT NOT NULL,
    principal_amount INTEGER NOT NULL,
    remaining_amount INTEGER NOT NULL,
    interest_rate_pct REAL DEFAULT 0.0,
    start_date TEXT NOT NULL,
    due_date TEXT,
    count_installments_in_budget INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK(status IN ('active', 'settled', 'forgiven')) DEFAULT 'active',
    notes TEXT,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

-- 5. MODULO TRICOUNT (Spese di Gruppo)
CREATE TABLE tricount_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    default_currency TEXT NOT NULL DEFAULT 'EUR',
    description TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tricount_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES tricount_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_me INTEGER NOT NULL DEFAULT 0,
    linked_user_id TEXT,
    weight REAL NOT NULL DEFAULT 1.0
);

CREATE TABLE tricount_expenses (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES tricount_groups(id) ON DELETE CASCADE,
    paid_by_member_id TEXT NOT NULL REFERENCES tricount_members(id),
    title TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    exchange_rate_to_group REAL NOT NULL DEFAULT 1.0,
    group_amount INTEGER NOT NULL,
    expense_type TEXT NOT NULL CHECK(expense_type IN ('expense', 'transfer_settlement')),
    date TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE tricount_splits (
    id TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL REFERENCES tricount_expenses(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES tricount_members(id),
    split_mode TEXT NOT NULL CHECK(split_mode IN ('equal', 'exact', 'percentage', 'shares')),
    share_value REAL,
    owed_group_amount INTEGER NOT NULL
);

-- 6. TRANSAZIONI, RICORRENZE, SPLIT E ALLEGATI
CREATE TABLE recurring_rules (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    category_id TEXT NOT NULL REFERENCES categories(id),
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    description TEXT,
    frequency TEXT NOT NULL CHECK(frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
    interval_count INTEGER NOT NULL DEFAULT 1,
    next_occurrence_date TEXT NOT NULL,
    auto_commit INTEGER NOT NULL DEFAULT 1,
    is_active INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE transactions (
    id TEXT PRIMARY KEY,
    account_id TEXT NOT NULL REFERENCES accounts(id),
    to_account_id TEXT REFERENCES accounts(id),
    recurring_rule_id TEXT REFERENCES recurring_rules(id),
    loan_id TEXT REFERENCES loans(id),
    tricount_expense_id TEXT REFERENCES tricount_expenses(id),
    
    type TEXT NOT NULL CHECK(type IN ('income', 'expense', 'transfer', 'loan_movement', 'tricount_settlement')),
    
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    exchange_rate_to_base REAL NOT NULL DEFAULT 1.0,
    base_amount INTEGER NOT NULL,
    
    -- NULL = usa default del conto | 1 = Forza INCLUSIONE | 0 = Forza ESCLUSIONE
    include_in_budget INTEGER CHECK(include_in_budget IN (0, 1)),
    budget_base_amount INTEGER NOT NULL,
    is_fixed INTEGER NOT NULL DEFAULT 0,
    
    date TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    description TEXT,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE transaction_splits (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id),
    amount_base INTEGER NOT NULL,
    notes TEXT
);

CREATE TABLE transaction_tags (
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE attachments (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    storage_type TEXT NOT NULL CHECK(storage_type IN ('inline_blob', 'local_path', 'cloud_url')),
    blob_data BLOB,
    external_path TEXT,
    created_at INTEGER NOT NULL
);

-- 7. CRYPTO PORTFOLIO
CREATE TABLE crypto_assets (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    current_price_base INTEGER NOT NULL,
    price_change_24h_pct REAL,
    alert_threshold_pct REAL,
    last_price_update INTEGER NOT NULL
);

CREATE TABLE crypto_transactions (
    id TEXT PRIMARY KEY,
    asset_id TEXT NOT NULL REFERENCES crypto_assets(id),
    linked_account_id TEXT REFERENCES accounts(id),
    type TEXT NOT NULL CHECK(type IN ('buy', 'sell', 'transfer_in', 'transfer_out', 'staking_reward')),
    quantity TEXT NOT NULL,
    price_per_unit_base INTEGER NOT NULL,
    fee_base INTEGER NOT NULL DEFAULT 0,
    date TEXT NOT NULL,
    notes TEXT,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

-- 8. CACHE PER WIDGET & SMARTWATCH
CREATE TABLE widget_snapshot (
    id TEXT PRIMARY KEY DEFAULT 'current',
    daily_budget_remaining INTEGER NOT NULL,
    daily_budget_allowance INTEGER NOT NULL,
    month_remaining_budget INTEGER NOT NULL,
    crypto_total_value INTEGER NOT NULL,
    crypto_pnl_pct REAL NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX idx_tx_date ON transactions(date) WHERE is_deleted = 0;
CREATE INDEX idx_tx_account ON transactions(account_id) WHERE is_deleted = 0;
CREATE INDEX idx_tx_loan ON transactions(loan_id) WHERE is_deleted = 0;
CREATE INDEX idx_tx_tricount ON transactions(tricount_expense_id) WHERE is_deleted = 0;