import type { RecurringFrequency, SplitMode, TransactionType } from '@dailybudget/core';

export const SCHEMA_V2_SQL = `
-- =========================================================
-- DAILYBUDGET - SQLITE SCHEMA v2 (.dbbudget file format)
-- =========================================================

-- 1. IMPOSTAZIONI & VALUTE
CREATE TABLE IF NOT EXISTS workspace_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    name TEXT NOT NULL,
    base_currency TEXT NOT NULL DEFAULT 'EUR',
    monthly_budget_target INTEGER NOT NULL,
    month_start_day INTEGER NOT NULL DEFAULT 1,
    include_tricount_owes_immediately INTEGER NOT NULL DEFAULT 1,
    updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS exchange_rates (
    currency_pair TEXT PRIMARY KEY,
    rate REAL NOT NULL,
    updated_at INTEGER NOT NULL
);

-- 2. CONTI E CONDIVISIONE
CREATE TABLE IF NOT EXISTS accounts (
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

CREATE TABLE IF NOT EXISTS account_members (
    account_id TEXT NOT NULL REFERENCES accounts(id),
    user_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('owner', 'editor', 'viewer')),
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (account_id, user_id)
);

-- 3. CATEGORIE E TAG
CREATE TABLE IF NOT EXISTS categories (
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

CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

-- 4. PRESTITI E DEBITI (Loans & Debts)
CREATE TABLE IF NOT EXISTS loans (
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
CREATE TABLE IF NOT EXISTS tricount_groups (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    default_currency TEXT NOT NULL DEFAULT 'EUR',
    description TEXT,
    is_archived INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL,
    is_deleted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS tricount_members (
    id TEXT PRIMARY KEY,
    group_id TEXT NOT NULL REFERENCES tricount_groups(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    is_me INTEGER NOT NULL DEFAULT 0,
    linked_user_id TEXT,
    weight REAL NOT NULL DEFAULT 1.0
);

CREATE TABLE IF NOT EXISTS tricount_expenses (
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

CREATE TABLE IF NOT EXISTS tricount_splits (
    id TEXT PRIMARY KEY,
    expense_id TEXT NOT NULL REFERENCES tricount_expenses(id) ON DELETE CASCADE,
    member_id TEXT NOT NULL REFERENCES tricount_members(id),
    split_mode TEXT NOT NULL CHECK(split_mode IN ('equal', 'exact', 'percentage', 'shares')),
    share_value REAL,
    owed_group_amount INTEGER NOT NULL
);

-- 6. TRANSAZIONI, RICORRENZE, SPLIT E ALLEGATI
CREATE TABLE IF NOT EXISTS recurring_rules (
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

CREATE TABLE IF NOT EXISTS transactions (
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

CREATE TABLE IF NOT EXISTS transaction_splits (
    id TEXT PRIMARY KEY,
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    category_id TEXT NOT NULL REFERENCES categories(id),
    amount_base INTEGER NOT NULL,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS transaction_tags (
    transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
    tag_id TEXT NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (transaction_id, tag_id)
);

CREATE TABLE IF NOT EXISTS attachments (
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
CREATE TABLE IF NOT EXISTS crypto_assets (
    id TEXT PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    current_price_base INTEGER NOT NULL,
    price_change_24h_pct REAL,
    alert_threshold_pct REAL,
    last_price_update INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS crypto_transactions (
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
CREATE TABLE IF NOT EXISTS widget_snapshot (
    id TEXT PRIMARY KEY DEFAULT 'current',
    daily_budget_remaining INTEGER NOT NULL,
    daily_budget_allowance INTEGER NOT NULL,
    month_remaining_budget INTEGER NOT NULL,
    crypto_total_value INTEGER NOT NULL,
    crypto_pnl_pct REAL NOT NULL,
    updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_tx_account ON transactions(account_id) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_tx_loan ON transactions(loan_id) WHERE is_deleted = 0;
CREATE INDEX IF NOT EXISTS idx_tx_tricount ON transactions(tricount_expense_id) WHERE is_deleted = 0;
`;

export interface WorkspaceSettingsRow {
  id: string;
  name: string;
  base_currency: string;
  monthly_budget_target: number;
  month_start_day: number;
  include_tricount_owes_immediately: number;
  updated_at: number;
}

export interface ExchangeRateRow {
  currency_pair: string;
  rate: number;
  updated_at: number;
}

export type AccountType = 'checking' | 'savings' | 'credit_card' | 'cash';

export interface AccountRow {
  id: string;
  name: string;
  type: AccountType;
  currency: string;
  initial_balance: number;
  cached_balance: number;
  credit_limit: number | null;
  include_in_budget: number; // 0 | 1
  color: string | null;
  icon: string | null;
  updated_at: number;
  is_deleted: number;
}

export interface CategoryRow {
  id: string;
  name: string;
  type: 'income' | 'expense';
  monthly_limit: number | null;
  is_fixed_expense: number; // 0 | 1
  color: string;
  icon: string;
  updated_at: number;
  is_deleted: number;
}

export interface TagRow {
  id: string;
  name: string;
  color: string;
  updated_at: number;
  is_deleted: number;
}

export interface LoanRow {
  id: string;
  name: string;
  counterparty_name: string;
  type: 'lent' | 'borrowed';
  currency: string;
  principal_amount: number;
  remaining_amount: number;
  interest_rate_pct: number;
  start_date: string;
  due_date: string | null;
  count_installments_in_budget: number; // 0 | 1
  status: 'active' | 'settled' | 'forgiven';
  notes: string | null;
  updated_at: number;
  is_deleted: number;
}

export interface TricountGroupRow {
  id: string;
  name: string;
  default_currency: string;
  description: string | null;
  is_archived: number;
  updated_at: number;
  is_deleted: number;
}

export interface TricountMemberRow {
  id: string;
  group_id: string;
  name: string;
  is_me: number; // 0 | 1
  linked_user_id: string | null;
  weight: number;
}

export interface TricountExpenseRow {
  id: string;
  group_id: string;
  paid_by_member_id: string;
  title: string;
  amount: number;
  currency: string;
  exchange_rate_to_group: number;
  group_amount: number;
  expense_type: 'expense' | 'transfer_settlement';
  date: string;
  updated_at: number;
  is_deleted: number;
}

export interface TricountSplitRow {
  id: string;
  expense_id: string;
  member_id: string;
  split_mode: SplitMode;
  share_value: number | null;
  owed_group_amount: number;
}

export interface RecurringRuleRow {
  id: string;
  account_id: string;
  category_id: string;
  amount: number;
  currency: string;
  description: string | null;
  frequency: RecurringFrequency;
  interval_count: number;
  next_occurrence_date: string;
  auto_commit: number; // 0 | 1
  is_active: number;   // 0 | 1
  updated_at: number;
  is_deleted: number;
}

export interface TransactionRow {
  id: string;
  account_id: string;
  to_account_id: string | null;
  recurring_rule_id: string | null;
  loan_id: string | null;
  tricount_expense_id: string | null;
  type: TransactionType;
  amount: number;
  currency: string;
  exchange_rate_to_base: number;
  base_amount: number;
  include_in_budget: 0 | 1 | null;
  budget_base_amount: number;
  is_fixed: number; // 0 | 1
  date: string;
  created_at: number;
  description: string | null;
  updated_at: number;
  is_deleted: number;
}

export interface TransactionSplitRow {
  id: string;
  transaction_id: string;
  category_id: string;
  amount_base: number;
  notes: string | null;
}

export interface CryptoAssetRow {
  id: string;
  symbol: string;
  name: string;
  current_price_base: number;
  price_change_24h_pct: number | null;
  alert_threshold_pct: number | null;
  last_price_update: number;
}

export interface CryptoTransactionRow {
  id: string;
  asset_id: string;
  linked_account_id: string | null;
  type: 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'staking_reward';
  quantity: string;
  price_per_unit_base: number;
  fee_base: number;
  date: string;
  notes: string | null;
  updated_at: number;
  is_deleted: number;
}

export interface WidgetSnapshotRow {
  id: string;
  daily_budget_remaining: number;
  daily_budget_allowance: number;
  month_remaining_budget: number;
  crypto_total_value: number;
  crypto_pnl_pct: number;
  updated_at: number;
}
