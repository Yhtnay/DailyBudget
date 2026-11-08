import initSqlJs, { type Database, type SqlJsStatic } from 'sql.js';
import {
  calculateCryptoAssetMetrics,
  calculateDailyBudget,
  calculateTricountSettlements,
  computeMultiCurrencyTricountImpact,
  computeTricountExpenseSplits,
  doesTransactionAffectBudget,
  evaluateDueRecurringRules,
  type CryptoHoldingMetrics,
  type DailyBudgetInput,
  type DailyBudgetResult,
  type MemberBalance,
  type RecurringFrequency,
  type SettlementTransfer,
  type SplitMode,
  type SplitParticipantInput,
  type TransactionType,
} from '@dailybudget/core';
import {
  SCHEMA_V2_SQL,
  type AccountRow,
  type AccountType,
  type CategoryRow,
  type CryptoAssetRow,
  type CryptoTransactionRow,
  type ExchangeRateRow,
  type LoanRow,
  type RecurringRuleRow,
  type TagRow,
  type TransactionRow,
  type TricountExpenseRow,
  type TricountGroupRow,
  type TricountMemberRow,
  type TricountSplitRow,
  type WidgetSnapshotRow,
  type WorkspaceSettingsRow,
} from './schema.ts';

let sqlJsPromise: Promise<SqlJsStatic> | null = null;

export async function getSqlJsEngine(wasmUrl?: string): Promise<SqlJsStatic> {
  if (!sqlJsPromise) {
    sqlJsPromise = initSqlJs(
      wasmUrl
        ? {
            locateFile: () => wasmUrl,
          }
        : undefined
    );
  }
  return sqlJsPromise;
}

export interface EnrichedRecurringRule extends RecurringRuleRow {
  account_name: string;
  category_name: string;
  category_color: string;
}

export interface EnrichedTransaction extends TransactionRow {
  account_name: string;
  account_include_in_budget: boolean;
  to_account_name: string | null;
  effective_affects_budget: boolean;
  splits: Array<{
    id: string;
    category_id: string;
    category_name: string;
    category_color: string;
    category_icon: string;
    amount_base: number;
    notes: string | null;
  }>;
  tags: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

export interface CreateTransactionInput {
  id?: string;
  accountId: string;
  toAccountId?: string | null;
  recurringRuleId?: string | null;
  loanId?: string | null;
  tricountExpenseId?: string | null;
  type: TransactionType;
  amountCents: number;
  currency: string;
  exchangeRateToBase?: number;
  baseAmountCents?: number;
  includeInBudget?: 0 | 1 | null;
  budgetBaseAmountCents?: number;
  isFixed?: boolean;
  date: string; // YYYY-MM-DD
  description?: string;
  splits?: Array<{
    categoryId: string;
    amountBaseCents: number;
    notes?: string;
  }>;
  tagIds?: string[];
}

export interface TricountGroupDetail {
  group: TricountGroupRow;
  members: TricountMemberRow[];
  expenses: Array<
    TricountExpenseRow & {
      paid_by_name: string;
      splits: Array<TricountSplitRow & { member_name: string }>;
    }
  >;
  balances: MemberBalance[];
  settlements: SettlementTransfer[];
}

export interface CryptoAssetWithMetrics {
  asset: CryptoAssetRow;
  transactions: CryptoTransactionRow[];
  metrics: CryptoHoldingMetrics;
}

export interface CryptoPortfolioSummary {
  assets: CryptoAssetWithMetrics[];
  totalValueCents: number;
  totalCostBasisCents: number;
  totalUnrealizedPnlCents: number;
  totalUnrealizedPnlPct: number;
  totalRealizedPnlCents: number;
}

export interface DashboardSummary {
  settings: WorkspaceSettingsRow;
  dailyBudgetInput: DailyBudgetInput;
  dailyBudgetResult: DailyBudgetResult;
  widgetSnapshot: WidgetSnapshotRow;
  totalNetWorthCents: number;
  totalBankBalanceCents: number;
  cryptoSummary: CryptoPortfolioSummary;
  categoryBreakdown: Array<{
    categoryId: string;
    name: string;
    color: string;
    icon: string;
    isFixed: boolean;
    monthlyLimitCents: number | null;
    spentCents: number;
  }>;
}

function makeId(prefix: string): string {
  const rand = Math.random().toString(36).substring(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

export class DailyBudgetRepository {
  private db: Database;
  private referenceDate: string;

  constructor(db: Database, referenceDate?: string) {
    this.db = db;
    this.referenceDate = referenceDate ?? new Date().toISOString().slice(0, 10);
    this.db.run('PRAGMA foreign_keys = ON;');
    this.db.run(SCHEMA_V2_SQL);
  }

  static async createEmpty(options?: {
    wasmUrl?: string;
    referenceDate?: string;
  }): Promise<DailyBudgetRepository> {
    const SQL = await getSqlJsEngine(options?.wasmUrl);
    const db = new SQL.Database();
    return new DailyBudgetRepository(db, options?.referenceDate);
  }

  static async fromBinary(
    bytes: Uint8Array,
    options?: {
      wasmUrl?: string;
      referenceDate?: string;
    }
  ): Promise<DailyBudgetRepository> {
    const SQL = await getSqlJsEngine(options?.wasmUrl);
    const db = new SQL.Database(bytes);
    return new DailyBudgetRepository(db, options?.referenceDate);
  }

  setReferenceDate(dateStr: string): void {
    this.referenceDate = dateStr;
    this.recomputeWidgetSnapshot();
  }

  getReferenceDate(): string {
    return this.referenceDate;
  }

  exportBinary(): Uint8Array {
    return this.db.export();
  }

  private queryAll<T>(sql: string, params: Array<string | number | null> = []): T[] {
    const stmt = this.db.prepare(sql);
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject() as unknown as T);
    }
    stmt.free();
    return rows;
  }

  private queryOne<T>(sql: string, params: Array<string | number | null> = []): T | null {
    const rows = this.queryAll<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  // ---------------------------------------------------------
  // 1. WORKSPACE SETTINGS & EXCHANGE RATES
  // ---------------------------------------------------------
  getWorkspaceSettings(): WorkspaceSettingsRow {
    const existing = this.queryOne<WorkspaceSettingsRow>(
      `SELECT * FROM workspace_settings WHERE id = 'default' LIMIT 1`
    );
    if (existing) return existing;

    const now = Date.now();
    this.db.run(
      `INSERT INTO workspace_settings (id, name, base_currency, monthly_budget_target, month_start_day, include_tricount_owes_immediately, updated_at)
       VALUES ('default', 'Il Mio Workspace', 'EUR', 220000, 1, 1, ?)`,
      [now]
    );
    return this.getWorkspaceSettings();
  }

  updateWorkspaceSettings(patch: {
    name?: string;
    baseCurrency?: string;
    monthlyBudgetTargetCents?: number;
    monthStartDay?: number;
    includeTricountOwesImmediately?: boolean;
  }): WorkspaceSettingsRow {
    const current = this.getWorkspaceSettings();
    const now = Date.now();
    this.db.run(
      `UPDATE workspace_settings
       SET name = ?,
           base_currency = ?,
           monthly_budget_target = ?,
           month_start_day = ?,
           include_tricount_owes_immediately = ?,
           updated_at = ?
       WHERE id = 'default'`,
      [
        patch.name ?? current.name,
        patch.baseCurrency ?? current.base_currency,
        patch.monthlyBudgetTargetCents ?? current.monthly_budget_target,
        patch.monthStartDay ?? current.month_start_day,
        patch.includeTricountOwesImmediately !== undefined
          ? patch.includeTricountOwesImmediately
            ? 1
            : 0
          : current.include_tricount_owes_immediately,
        now,
      ]
    );
    this.recomputeWidgetSnapshot();
    return this.getWorkspaceSettings();
  }

  getExchangeRates(): ExchangeRateRow[] {
    return this.queryAll<ExchangeRateRow>(
      `SELECT * FROM exchange_rates ORDER BY currency_pair ASC`
    );
  }

  upsertExchangeRate(currencyPair: string, rate: number): void {
    this.db.run(
      `INSERT INTO exchange_rates (currency_pair, rate, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(currency_pair) DO UPDATE SET rate = excluded.rate, updated_at = excluded.updated_at`,
      [currencyPair.toUpperCase(), rate, Date.now()]
    );
  }

  getRateToBase(currency: string): number {
    const settings = this.getWorkspaceSettings();
    if (currency.toUpperCase() === settings.base_currency.toUpperCase()) {
      return 1.0;
    }
    const pair = `${currency.toUpperCase()}_${settings.base_currency.toUpperCase()}`;
    const row = this.queryOne<ExchangeRateRow>(
      `SELECT * FROM exchange_rates WHERE currency_pair = ?`,
      [pair]
    );
    return row ? row.rate : 1.0;
  }

  // ---------------------------------------------------------
  // 2. ACCOUNTS, CATEGORIES & TAGS
  // ---------------------------------------------------------
  getAccounts(): AccountRow[] {
    return this.queryAll<AccountRow>(
      `SELECT * FROM accounts WHERE is_deleted = 0 ORDER BY updated_at ASC`
    );
  }

  createAccount(input: {
    id?: string;
    name: string;
    type: AccountType;
    currency?: string;
    initialBalanceCents: number;
    creditLimitCents?: number | null;
    includeInBudget?: boolean;
    color?: string;
    icon?: string;
  }): AccountRow {
    const id = input.id ?? makeId('acc');
    const now = Date.now();
    const currency = input.currency ?? this.getWorkspaceSettings().base_currency;
    this.db.run(
      `INSERT INTO accounts (id, name, type, currency, initial_balance, cached_balance, credit_limit, include_in_budget, color, icon, updated_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        input.name,
        input.type,
        currency,
        Math.round(input.initialBalanceCents),
        Math.round(input.initialBalanceCents),
        input.creditLimitCents ?? null,
        input.includeInBudget === false ? 0 : 1,
        input.color ?? '#0f766e',
        input.icon ?? 'wallet',
        now,
      ]
    );
    this.recomputeAccountBalance(id);
    this.recomputeWidgetSnapshot();
    return this.queryOne<AccountRow>(`SELECT * FROM accounts WHERE id = ?`, [id])!;
  }

  toggleAccountIncludeInBudget(accountId: string, includeInBudget: boolean): void {
    this.db.run(
      `UPDATE accounts SET include_in_budget = ?, updated_at = ? WHERE id = ?`,
      [includeInBudget ? 1 : 0, Date.now(), accountId]
    );
    this.recomputeWidgetSnapshot();
  }

  recomputeAccountBalance(accountId: string): void {
    const acc = this.queryOne<AccountRow>(`SELECT * FROM accounts WHERE id = ?`, [
      accountId,
    ]);
    if (!acc) return;

    const outgoing = this.queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(base_amount), 0) as total
       FROM transactions
       WHERE account_id = ? AND is_deleted = 0 AND type IN ('expense', 'transfer')`,
      [accountId]
    )?.total ?? 0;

    const incoming = this.queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(base_amount), 0) as total
       FROM transactions
       WHERE account_id = ? AND is_deleted = 0 AND type = 'income'`,
      [accountId]
    )?.total ?? 0;

    const transferIn = this.queryOne<{ total: number }>(
      `SELECT COALESCE(SUM(base_amount), 0) as total
       FROM transactions
       WHERE to_account_id = ? AND is_deleted = 0 AND type = 'transfer'`,
      [accountId]
    )?.total ?? 0;

    // Loan & Tricount movements: positive base_amount reduces balance if expense-like,
    // we treat signed or directional movements consistently:
    const otherMovements = this.queryAll<TransactionRow>(
      `SELECT * FROM transactions
       WHERE account_id = ? AND is_deleted = 0 AND type IN ('loan_movement', 'tricount_settlement')`,
      [accountId]
    );
    let netOther = 0;
    for (const m of otherMovements) {
      // Negative base_amount = inflow (repayment received), Positive = outflow (paid)
      netOther -= m.base_amount;
    }

    const newCached = acc.initial_balance + incoming + transferIn - outgoing + netOther;
    this.db.run(`UPDATE accounts SET cached_balance = ?, updated_at = ? WHERE id = ?`, [
      newCached,
      Date.now(),
      accountId,
    ]);
  }

  getCategories(): CategoryRow[] {
    return this.queryAll<CategoryRow>(
      `SELECT * FROM categories WHERE is_deleted = 0 ORDER BY is_fixed_expense DESC, name ASC`
    );
  }

  createCategory(input: {
    id?: string;
    name: string;
    type: 'income' | 'expense';
    monthlyLimitCents?: number | null;
    isFixedExpense?: boolean;
    color?: string;
    icon?: string;
  }): CategoryRow {
    const id = input.id ?? makeId('cat');
    this.db.run(
      `INSERT INTO categories (id, name, type, monthly_limit, is_fixed_expense, color, icon, updated_at, is_deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        input.name,
        input.type,
        input.monthlyLimitCents ?? null,
        input.isFixedExpense ? 1 : 0,
        input.color ?? '#0284c7',
        input.icon ?? 'tag',
        Date.now(),
      ]
    );
    this.recomputeWidgetSnapshot();
    return this.queryOne<CategoryRow>(`SELECT * FROM categories WHERE id = ?`, [id])!;
  }

  getTags(): TagRow[] {
    return this.queryAll<TagRow>(
      `SELECT * FROM tags WHERE is_deleted = 0 ORDER BY name ASC`
    );
  }

  createTag(input: { id?: string; name: string; color?: string }): TagRow {
    const normalized = input.name.trim().replace(/^#/, '');
    const existing = this.queryOne<TagRow>(
      `SELECT * FROM tags WHERE LOWER(name) = LOWER(?) AND is_deleted = 0`,
      [normalized]
    );
    if (existing) return existing;

    const id = input.id ?? makeId('tag');
    this.db.run(
      `INSERT INTO tags (id, name, color, updated_at, is_deleted)
       VALUES (?, ?, ?, ?, 0)`,
      [id, normalized, input.color ?? '#0d9488', Date.now()]
    );
    return this.queryOne<TagRow>(`SELECT * FROM tags WHERE id = ?`, [id])!;
  }

  // ---------------------------------------------------------
  // 3. TRANSACTIONS, SPLITS & TAGS
  // ---------------------------------------------------------
  createTransaction(input: CreateTransactionInput): EnrichedTransaction {
    const id = input.id ?? makeId('tx');
    const now = Date.now();
    const rate = input.exchangeRateToBase ?? this.getRateToBase(input.currency);
    const amountCents = Math.round(input.amountCents);
    const baseAmountCents =
      input.baseAmountCents !== undefined
        ? Math.round(input.baseAmountCents)
        : Math.round(amountCents * rate);
    const budgetBaseAmountCents =
      input.budgetBaseAmountCents !== undefined
        ? Math.round(input.budgetBaseAmountCents)
        : Math.abs(baseAmountCents);

    const includeInBudget =
      input.includeInBudget === undefined ? null : input.includeInBudget;

    this.db.run(
      `INSERT INTO transactions (
        id, account_id, to_account_id, recurring_rule_id, loan_id, tricount_expense_id,
        type, amount, currency, exchange_rate_to_base, base_amount,
        include_in_budget, budget_base_amount, is_fixed,
        date, created_at, description, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        input.accountId,
        input.toAccountId ?? null,
        input.recurringRuleId ?? null,
        input.loanId ?? null,
        input.tricountExpenseId ?? null,
        input.type,
        amountCents,
        input.currency,
        rate,
        baseAmountCents,
        includeInBudget,
        budgetBaseAmountCents,
        input.isFixed ? 1 : 0,
        input.date,
        now,
        input.description ?? null,
        now,
      ]
    );

    if (input.splits && input.splits.length > 0) {
      for (const split of input.splits) {
        this.db.run(
          `INSERT INTO transaction_splits (id, transaction_id, category_id, amount_base, notes)
           VALUES (?, ?, ?, ?, ?)`,
          [
            makeId('split'),
            id,
            split.categoryId,
            Math.round(split.amountBaseCents),
            split.notes ?? null,
          ]
        );
      }
    }

    if (input.tagIds && input.tagIds.length > 0) {
      for (const tagId of input.tagIds) {
        this.db.run(
          `INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)`,
          [id, tagId]
        );
      }
    }

    this.recomputeAccountBalance(input.accountId);
    if (input.toAccountId) {
      this.recomputeAccountBalance(input.toAccountId);
    }
    this.recomputeWidgetSnapshot();

    return this.getTransactionById(id)!;
  }

  deleteTransaction(transactionId: string): void {
    const tx = this.queryOne<TransactionRow>(
      `SELECT * FROM transactions WHERE id = ?`,
      [transactionId]
    );
    if (!tx) return;

    this.db.run(
      `UPDATE transactions SET is_deleted = 1, updated_at = ? WHERE id = ?`,
      [Date.now(), transactionId]
    );
    this.recomputeAccountBalance(tx.account_id);
    if (tx.to_account_id) {
      this.recomputeAccountBalance(tx.to_account_id);
    }
    this.recomputeWidgetSnapshot();
  }

  getTransactionById(id: string): EnrichedTransaction | null {
    const all = this.getTransactionsWithDetails({ transactionId: id });
    return all.length > 0 ? all[0] : null;
  }

  getTransactionsWithDetails(filter?: {
    transactionId?: string;
    accountId?: string;
    tagId?: string;
    monthPrefix?: string; // YYYY-MM
  }): EnrichedTransaction[] {
    let whereSql = `t.is_deleted = 0`;
    const params: Array<string | number | null> = [];

    if (filter?.transactionId) {
      whereSql += ` AND t.id = ?`;
      params.push(filter.transactionId);
    }
    if (filter?.accountId) {
      whereSql += ` AND (t.account_id = ? OR t.to_account_id = ?)`;
      params.push(filter.accountId, filter.accountId);
    }
    if (filter?.monthPrefix) {
      whereSql += ` AND t.date LIKE ?`;
      params.push(`${filter.monthPrefix}%`);
    }

    const rows = this.queryAll<
      TransactionRow & {
        account_name: string;
        account_include_in_budget: number;
        to_account_name: string | null;
      }
    >(
      `SELECT t.*,
              a.name as account_name,
              a.include_in_budget as account_include_in_budget,
              ta.name as to_account_name
       FROM transactions t
       JOIN accounts a ON a.id = t.account_id
       LEFT JOIN accounts ta ON ta.id = t.to_account_id
       WHERE ${whereSql}
       ORDER BY t.date DESC, t.created_at DESC`,
      params
    );

    const enriched: EnrichedTransaction[] = [];

    for (const r of rows) {
      const splits = this.queryAll<{
        id: string;
        category_id: string;
        category_name: string;
        category_color: string;
        category_icon: string;
        amount_base: number;
        notes: string | null;
      }>(
        `SELECT ts.id, ts.category_id, c.name as category_name, c.color as category_color, c.icon as category_icon, ts.amount_base, ts.notes
         FROM transaction_splits ts
         JOIN categories c ON c.id = ts.category_id
         WHERE ts.transaction_id = ?`,
        [r.id]
      );

      const tags = this.queryAll<{ id: string; name: string; color: string }>(
        `SELECT tg.id, tg.name, tg.color
         FROM transaction_tags tt
         JOIN tags tg ON tg.id = tt.tag_id
         WHERE tt.transaction_id = ? AND tg.is_deleted = 0`,
        [r.id]
      );

      if (filter?.tagId && !tags.some((t) => t.id === filter.tagId)) {
        continue;
      }

      const effectiveAffectsBudget = doesTransactionAffectBudget({
        txIncludeInBudget: r.include_in_budget,
        accountIncludeInBudget: r.account_include_in_budget === 1,
        txType: r.type,
      });

      enriched.push({
        ...r,
        account_include_in_budget: r.account_include_in_budget === 1,
        effective_affects_budget: effectiveAffectsBudget,
        splits,
        tags,
      });
    }

    return enriched;
  }

  // ---------------------------------------------------------
  // 3B. RECURRING RULES & AUTO-COMMIT SCHEDULER
  // ---------------------------------------------------------
  getRecurringRules(): EnrichedRecurringRule[] {
    return this.queryAll<EnrichedRecurringRule>(
      `SELECT r.*,
              a.name as account_name,
              c.name as category_name,
              c.color as category_color
       FROM recurring_rules r
       JOIN accounts a ON a.id = r.account_id
       JOIN categories c ON c.id = r.category_id
       WHERE r.is_deleted = 0
       ORDER BY r.next_occurrence_date ASC`
    );
  }

  createRecurringRule(input: {
    id?: string;
    accountId: string;
    categoryId: string;
    amountCents: number;
    currency?: string;
    description?: string;
    frequency: RecurringFrequency;
    intervalCount?: number;
    nextOccurrenceDate: string;
    autoCommit?: boolean;
    isActive?: boolean;
  }): EnrichedRecurringRule {
    const id = input.id ?? makeId('rec');
    const currency = input.currency ?? this.getWorkspaceSettings().base_currency;
    const now = Date.now();

    this.db.run(
      `INSERT INTO recurring_rules (
        id, account_id, category_id, amount, currency, description,
        frequency, interval_count, next_occurrence_date, auto_commit, is_active, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        input.accountId,
        input.categoryId,
        Math.round(input.amountCents),
        currency,
        input.description ?? null,
        input.frequency,
        Math.max(1, Math.trunc(input.intervalCount ?? 1)),
        input.nextOccurrenceDate,
        input.autoCommit === false ? 0 : 1,
        input.isActive === false ? 0 : 1,
        now,
      ]
    );

    this.recomputeWidgetSnapshot();
    return this.getRecurringRules().find((r) => r.id === id)!;
  }

  toggleRecurringRule(
    ruleId: string,
    patch: { autoCommit?: boolean; isActive?: boolean }
  ): void {
    const current = this.queryOne<RecurringRuleRow>(
      `SELECT * FROM recurring_rules WHERE id = ?`,
      [ruleId]
    );
    if (!current) return;

    this.db.run(
      `UPDATE recurring_rules
       SET auto_commit = ?, is_active = ?, updated_at = ?
       WHERE id = ?`,
      [
        patch.autoCommit !== undefined ? (patch.autoCommit ? 1 : 0) : current.auto_commit,
        patch.isActive !== undefined ? (patch.isActive ? 1 : 0) : current.is_active,
        Date.now(),
        ruleId,
      ]
    );
    this.recomputeWidgetSnapshot();
  }

  processDueRecurringRules(refDateStr?: string): {
    committedCount: number;
    transactions: EnrichedTransaction[];
  } {
    const targetDate = refDateStr ?? this.referenceDate;
    const rules = this.getRecurringRules();

    const evalResult = evaluateDueRecurringRules(
      rules.map((r) => ({
        id: r.id,
        accountId: r.account_id,
        categoryId: r.category_id,
        amountCents: r.amount,
        currency: r.currency,
        description: r.description,
        frequency: r.frequency,
        intervalCount: r.interval_count,
        nextOccurrenceDate: r.next_occurrence_date,
        autoCommit: r.auto_commit === 1,
        isActive: r.is_active === 1,
      })),
      targetDate
    );

    const createdTransactions: EnrichedTransaction[] = [];

    for (const occ of evalResult.dueOccurrences) {
      const rateToBase = this.getRateToBase(occ.currency);
      const baseAmountCents = Math.round(occ.amountCents * rateToBase);

      const tx = this.createTransaction({
        accountId: occ.accountId,
        recurringRuleId: occ.ruleId,
        type: 'expense',
        amountCents: occ.amountCents,
        currency: occ.currency,
        exchangeRateToBase: rateToBase,
        baseAmountCents,
        budgetBaseAmountCents: baseAmountCents,
        isFixed: true,
        date: occ.occurrenceDate,
        description: occ.description ?? 'Ricorrenza automatica',
        splits: [
          {
            categoryId: occ.categoryId,
            amountBaseCents: baseAmountCents,
          },
        ],
      });
      createdTransactions.push(tx);
    }

    const now = Date.now();
    for (const upd of evalResult.updatedNextDates) {
      this.db.run(
        `UPDATE recurring_rules SET next_occurrence_date = ?, updated_at = ? WHERE id = ?`,
        [upd.nextOccurrenceDate, now, upd.ruleId]
      );
    }

    this.recomputeWidgetSnapshot(targetDate);

    return {
      committedCount: createdTransactions.length,
      transactions: createdTransactions,
    };
  }

  // ---------------------------------------------------------
  // 4. LOANS & DEBTS (loans)
  // ---------------------------------------------------------
  getLoans(): LoanRow[] {
    return this.queryAll<LoanRow>(
      `SELECT * FROM loans WHERE is_deleted = 0 ORDER BY status ASC, start_date DESC`
    );
  }

  createLoan(input: {
    id?: string;
    name: string;
    counterpartyName: string;
    type: 'lent' | 'borrowed';
    currency?: string;
    principalAmountCents: number;
    remainingAmountCents?: number;
    interestRatePct?: number;
    startDate: string;
    dueDate?: string | null;
    countInstallmentsInBudget?: boolean;
    notes?: string;
  }): LoanRow {
    const id = input.id ?? makeId('loan');
    const currency = input.currency ?? this.getWorkspaceSettings().base_currency;
    const principal = Math.round(input.principalAmountCents);
    const remaining =
      input.remainingAmountCents !== undefined
        ? Math.round(input.remainingAmountCents)
        : principal;

    this.db.run(
      `INSERT INTO loans (
        id, name, counterparty_name, type, currency, principal_amount, remaining_amount,
        interest_rate_pct, start_date, due_date, count_installments_in_budget, status, notes, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        input.name,
        input.counterpartyName,
        input.type,
        currency,
        principal,
        remaining,
        input.interestRatePct ?? 0,
        input.startDate,
        input.dueDate ?? null,
        input.countInstallmentsInBudget ? 1 : 0,
        remaining <= 0 ? 'settled' : 'active',
        input.notes ?? null,
        Date.now(),
      ]
    );
    return this.queryOne<LoanRow>(`SELECT * FROM loans WHERE id = ?`, [id])!;
  }

  recordLoanInstallment(input: {
    loanId: string;
    accountId: string;
    amountCents: number;
    date: string;
    description?: string;
    forceBudgetOverride?: 0 | 1 | null;
  }): { loan: LoanRow; transaction: EnrichedTransaction } {
    const loan = this.queryOne<LoanRow>(`SELECT * FROM loans WHERE id = ?`, [
      input.loanId,
    ]);
    if (!loan) {
      throw new Error('Prestito non trovato.');
    }

    const installmentCents = Math.round(Math.abs(input.amountCents));
    const newRemaining = Math.max(0, loan.remaining_amount - installmentCents);
    const newStatus = newRemaining === 0 ? 'settled' : loan.status;

    this.db.run(
      `UPDATE loans SET remaining_amount = ?, status = ?, updated_at = ? WHERE id = ?`,
      [newRemaining, newStatus, Date.now(), loan.id]
    );

    // Se è 'borrowed' (debito), pagare una rata fa uscire soldi dal conto (+base_amount outflow).
    // Se è 'lent' (credito), ricevere un rimborso fa entrare soldi sul conto (-base_amount inflow in loan_movement).
    const signedCashflow =
      loan.type === 'borrowed' ? installmentCents : -installmentCents;

    const includeInBudget: 0 | 1 | null =
      input.forceBudgetOverride !== undefined
        ? input.forceBudgetOverride
        : loan.count_installments_in_budget === 1
          ? 1
          : null;

    const tx = this.createTransaction({
      accountId: input.accountId,
      loanId: loan.id,
      type: 'loan_movement',
      amountCents: installmentCents,
      currency: loan.currency,
      baseAmountCents: signedCashflow,
      budgetBaseAmountCents: installmentCents,
      includeInBudget,
      isFixed: loan.count_installments_in_budget === 1,
      date: input.date,
      description:
        input.description ??
        `${loan.type === 'borrowed' ? 'Rata finanziamento' : 'Rimborso credito'}: ${loan.name}`,
    });

    return {
      loan: this.queryOne<LoanRow>(`SELECT * FROM loans WHERE id = ?`, [loan.id])!,
      transaction: tx,
    };
  }

  // ---------------------------------------------------------
  // 5. TRICOUNT MODULE (Groups, Multi-Currency Expenses, Settlements)
  // ---------------------------------------------------------
  createTricountGroup(input: {
    id?: string;
    name: string;
    defaultCurrency?: string;
    description?: string;
    members: Array<{
      id?: string;
      name: string;
      isMe?: boolean;
      weight?: number;
    }>;
  }): TricountGroupDetail {
    const groupId = input.id ?? makeId('tgrp');
    const now = Date.now();
    this.db.run(
      `INSERT INTO tricount_groups (id, name, default_currency, description, is_archived, updated_at, is_deleted)
       VALUES (?, ?, ?, ?, 0, ?, 0)`,
      [
        groupId,
        input.name,
        input.defaultCurrency ?? 'EUR',
        input.description ?? null,
        now,
      ]
    );

    for (const m of input.members) {
      this.db.run(
        `INSERT INTO tricount_members (id, group_id, name, is_me, linked_user_id, weight)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [m.id ?? makeId('tmbr'), groupId, m.name, m.isMe ? 1 : 0, m.weight ?? 1.0]
      );
    }

    return this.getTricountGroupDetail(groupId)!;
  }

  createTricountExpense(input: {
    id?: string;
    groupId: string;
    paidByMemberId: string;
    title: string;
    amountCents: number;
    currency: string;
    exchangeRateToGroup?: number;
    expenseType?: 'expense' | 'transfer_settlement';
    date: string;
    splitMode: SplitMode;
    participants: SplitParticipantInput[];
    // Collegamento al conto e al DailyBudget personale
    personalAccountId?: string | null;
    personalCategoryId?: string | null;
    personalTagIds?: string[];
  }): TricountGroupDetail {
    const group = this.queryOne<TricountGroupRow>(
      `SELECT * FROM tricount_groups WHERE id = ?`,
      [input.groupId]
    );
    const groupCurrency = group?.default_currency ?? 'EUR';
    const exchangeRateGroupToBase = this.getRateToBase(groupCurrency);

    const expenseId = input.id ?? makeId('texp');
    const now = Date.now();
    const rateToGroup = input.exchangeRateToGroup ?? 1.0;
    const amountCents = Math.round(input.amountCents);
    const groupAmountCents = Math.round(amountCents * rateToGroup);
    const expenseType = input.expenseType ?? 'expense';

    this.db.run(
      `INSERT INTO tricount_expenses (
        id, group_id, paid_by_member_id, title, amount, currency,
        exchange_rate_to_group, group_amount, expense_type, date, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        expenseId,
        input.groupId,
        input.paidByMemberId,
        input.title,
        amountCents,
        input.currency,
        rateToGroup,
        groupAmountCents,
        expenseType,
        input.date,
        now,
      ]
    );

    const computedSplits = computeTricountExpenseSplits(
      groupAmountCents,
      input.splitMode,
      input.participants
    );

    for (const sp of computedSplits) {
      this.db.run(
        `INSERT INTO tricount_splits (id, expense_id, member_id, split_mode, share_value, owed_group_amount)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          makeId('tspl'),
          expenseId,
          sp.memberId,
          sp.splitMode,
          sp.shareValue,
          sp.owedGroupAmountCents,
        ]
      );
    }

    // Se è collegato un conto personale, creiamo la transazione bancaria + competenza budget!
    // Supporta conversione a 3 livelli di valuta: Valuta Spesa -> Valuta Gruppo -> Valuta Base Workspace
    if (input.personalAccountId && expenseType === 'expense') {
      const members = this.queryAll<TricountMemberRow>(
        `SELECT * FROM tricount_members WHERE group_id = ?`,
        [input.groupId]
      );
      const meMember = members.find((m) => m.is_me === 1);
      if (meMember) {
        const mySplit = computedSplits.find((s) => s.memberId === meMember.id);
        const myQuotaCents = mySplit ? mySplit.owedGroupAmountCents : 0;
        const iPaid = input.paidByMemberId === meMember.id;
        const settings = this.getWorkspaceSettings();

        const impact = computeMultiCurrencyTricountImpact({
          amountCents,
          exchangeRateToGroup: rateToGroup,
          exchangeRateGroupToBase,
          myOwedGroupAmountCents: myQuotaCents,
          iPaidExpense: iPaid,
          includeTricountOwesImmediately: settings.include_tricount_owes_immediately === 1,
        });

        if (impact.shouldCreatePersonalTx) {
          const splits =
            input.personalCategoryId && impact.personalBudgetBaseCents > 0
              ? [
                  {
                    categoryId: input.personalCategoryId,
                    amountBaseCents: impact.personalBudgetBaseCents,
                  },
                ]
              : undefined;

          this.createTransaction({
            accountId: input.personalAccountId,
            tricountExpenseId: expenseId,
            type: 'expense',
            amountCents: iPaid ? amountCents : myQuotaCents,
            currency: iPaid ? input.currency : groupCurrency,
            exchangeRateToBase: iPaid
              ? rateToGroup * exchangeRateGroupToBase
              : exchangeRateGroupToBase,
            baseAmountCents: impact.personalCashflowBaseCents,
            budgetBaseAmountCents: impact.personalBudgetBaseCents,
            includeInBudget: impact.txIncludeInBudget,
            isFixed: false,
            date: input.date,
            description: `[Tricount] ${input.title}${iPaid ? ' (Pagato da me)' : ' (Quota mia)'}`,
            splits,
            tagIds: input.personalTagIds,
          });
        }
      }
    }

    this.recomputeWidgetSnapshot();
    return this.getTricountGroupDetail(input.groupId)!;
  }

  recordTricountSettlement(input: {
    groupId: string;
    fromMemberId: string;
    toMemberId: string;
    amountCents: number;
    date: string;
    personalAccountId?: string | null;
  }): TricountGroupDetail {
    const group = this.queryOne<TricountGroupRow>(
      `SELECT * FROM tricount_groups WHERE id = ?`,
      [input.groupId]
    );
    if (!group) throw new Error('Gruppo Tricount non trovato.');

    const members = this.queryAll<TricountMemberRow>(
      `SELECT * FROM tricount_members WHERE group_id = ?`,
      [input.groupId]
    );
    const fromMember = members.find((m) => m.id === input.fromMemberId);
    const toMember = members.find((m) => m.id === input.toMemberId);

    const settlementTitle = `Rimborso: ${fromMember?.name ?? 'Membro'} → ${toMember?.name ?? 'Membro'}`;

    const detail = this.createTricountExpense({
      groupId: input.groupId,
      paidByMemberId: input.fromMemberId,
      title: settlementTitle,
      amountCents: input.amountCents,
      currency: group.default_currency,
      exchangeRateToGroup: 1.0,
      expenseType: 'transfer_settlement',
      date: input.date,
      splitMode: 'exact',
      participants: [
        {
          memberId: input.toMemberId,
          shareValue: input.amountCents,
        },
      ],
    });

    if (input.personalAccountId && (fromMember?.is_me === 1 || toMember?.is_me === 1)) {
      const isOutgoing = fromMember?.is_me === 1;
      const signedBase = isOutgoing ? input.amountCents : -input.amountCents;

      this.createTransaction({
        accountId: input.personalAccountId,
        type: 'tricount_settlement',
        amountCents: input.amountCents,
        currency: group.default_currency,
        baseAmountCents: signedBase,
        budgetBaseAmountCents: 0,
        includeInBudget: null, // Escluso di default dal budget per Regola C
        date: input.date,
        description: `[Tricount Settlement] ${settlementTitle}`,
      });
    }

    return detail;
  }

  getTricountGroupsWithDetails(): TricountGroupDetail[] {
    const groups = this.queryAll<TricountGroupRow>(
      `SELECT * FROM tricount_groups WHERE is_deleted = 0 ORDER BY updated_at DESC`
    );
    return groups.map((g) => this.getTricountGroupDetail(g.id)!);
  }

  getTricountGroupDetail(groupId: string): TricountGroupDetail | null {
    const group = this.queryOne<TricountGroupRow>(
      `SELECT * FROM tricount_groups WHERE id = ? AND is_deleted = 0`,
      [groupId]
    );
    if (!group) return null;

    const members = this.queryAll<TricountMemberRow>(
      `SELECT * FROM tricount_members WHERE group_id = ? ORDER BY is_me DESC, name ASC`,
      [groupId]
    );

    const expensesRaw = this.queryAll<TricountExpenseRow & { paid_by_name: string }>(
      `SELECT e.*, m.name as paid_by_name
       FROM tricount_expenses e
       JOIN tricount_members m ON m.id = e.paid_by_member_id
       WHERE e.group_id = ? AND e.is_deleted = 0
       ORDER BY e.date DESC, e.updated_at DESC`,
      [groupId]
    );

    const balanceMap = new Map<string, number>();
    for (const m of members) {
      balanceMap.set(m.id, 0);
    }

    const expenses = expensesRaw.map((exp) => {
      const splits = this.queryAll<TricountSplitRow & { member_name: string }>(
        `SELECT s.*, m.name as member_name
         FROM tricount_splits s
         JOIN tricount_members m ON m.id = s.member_id
         WHERE s.expense_id = ?`,
        [exp.id]
      );

      // Chi ha pagato riceve credito (+group_amount)
      balanceMap.set(
        exp.paid_by_member_id,
        (balanceMap.get(exp.paid_by_member_id) ?? 0) + exp.group_amount
      );

      // Ogni partecipante nello split matura debito (-owed_group_amount)
      for (const s of splits) {
        balanceMap.set(
          s.member_id,
          (balanceMap.get(s.member_id) ?? 0) - s.owed_group_amount
        );
      }

      return {
        ...exp,
        splits,
      };
    });

    const balances: MemberBalance[] = members.map((m) => ({
      memberId: m.id,
      memberName: m.name,
      netBalanceCents: balanceMap.get(m.id) ?? 0,
    }));

    const settlements = calculateTricountSettlements(balances);

    return {
      group,
      members,
      expenses,
      balances,
      settlements,
    };
  }

  // ---------------------------------------------------------
  // 6. CRYPTO PORTFOLIO (WAC & P&L)
  // ---------------------------------------------------------
  createCryptoAsset(input: {
    id?: string;
    symbol: string;
    name: string;
    currentPriceBaseCents: number;
    priceChange24hPct?: number;
    alertThresholdPct?: number;
  }): CryptoAssetRow {
    const id = input.id ?? makeId('cry');
    this.db.run(
      `INSERT INTO crypto_assets (id, symbol, name, current_price_base, price_change_24h_pct, alert_threshold_pct, last_price_update)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        input.symbol.toUpperCase(),
        input.name,
        Math.round(input.currentPriceBaseCents),
        input.priceChange24hPct ?? 0,
        input.alertThresholdPct ?? null,
        Date.now(),
      ]
    );
    this.recomputeWidgetSnapshot();
    return this.queryOne<CryptoAssetRow>(`SELECT * FROM crypto_assets WHERE id = ?`, [
      id,
    ])!;
  }

  updateCryptoAssetPrice(
    assetId: string,
    newPriceBaseCents: number,
    priceChange24hPct?: number
  ): void {
    this.db.run(
      `UPDATE crypto_assets
       SET current_price_base = ?,
           price_change_24h_pct = COALESCE(?, price_change_24h_pct),
           last_price_update = ?
       WHERE id = ?`,
      [
        Math.round(newPriceBaseCents),
        priceChange24hPct ?? null,
        Date.now(),
        assetId,
      ]
    );
    this.recomputeWidgetSnapshot();
  }

  createCryptoTransaction(input: {
    id?: string;
    assetId: string;
    linkedAccountId?: string | null;
    type: 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'staking_reward';
    quantity: string;
    pricePerUnitBaseCents: number;
    feeBaseCents?: number;
    date: string;
    notes?: string;
  }): CryptoTransactionRow {
    const id = input.id ?? makeId('ctx');
    this.db.run(
      `INSERT INTO crypto_transactions (
        id, asset_id, linked_account_id, type, quantity, price_per_unit_base, fee_base, date, notes, updated_at, is_deleted
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        id,
        input.assetId,
        input.linkedAccountId ?? null,
        input.type,
        input.quantity,
        Math.round(input.pricePerUnitBaseCents),
        Math.round(input.feeBaseCents ?? 0),
        input.date,
        input.notes ?? null,
        Date.now(),
      ]
    );
    this.recomputeWidgetSnapshot();
    return this.queryOne<CryptoTransactionRow>(
      `SELECT * FROM crypto_transactions WHERE id = ?`,
      [id]
    )!;
  }

  getCryptoPortfolioSummary(): CryptoPortfolioSummary {
    const assets = this.queryAll<CryptoAssetRow>(
      `SELECT * FROM crypto_assets ORDER BY symbol ASC`
    );

    let totalValueCents = 0;
    let totalCostBasisCents = 0;
    let totalRealizedPnlCents = 0;

    const assetsWithMetrics: CryptoAssetWithMetrics[] = assets.map((asset) => {
      const txs = this.queryAll<CryptoTransactionRow>(
        `SELECT * FROM crypto_transactions
         WHERE asset_id = ? AND is_deleted = 0
         ORDER BY date ASC, updated_at ASC`,
        [asset.id]
      );

      const metrics = calculateCryptoAssetMetrics(
        txs.map((t) => ({
          type: t.type,
          quantity: t.quantity,
          pricePerUnitBaseCents: t.price_per_unit_base,
          feeBaseCents: t.fee_base,
        })),
        asset.current_price_base
      );

      totalValueCents += metrics.currentValueCents;
      totalCostBasisCents += metrics.totalCostBasisCents;
      totalRealizedPnlCents += metrics.realizedPnlCents;

      return {
        asset,
        transactions: txs,
        metrics,
      };
    });

    const totalUnrealizedPnlCents = totalValueCents - totalCostBasisCents;
    const totalUnrealizedPnlPct =
      totalCostBasisCents > 0
        ? (totalUnrealizedPnlCents / totalCostBasisCents) * 100
        : 0;

    return {
      assets: assetsWithMetrics,
      totalValueCents,
      totalCostBasisCents,
      totalUnrealizedPnlCents,
      totalUnrealizedPnlPct,
      totalRealizedPnlCents,
    };
  }

  // ---------------------------------------------------------
  // 7. DAILY BUDGET ENGINE & WIDGET SNAPSHOT (O(1) Native Cache)
  // ---------------------------------------------------------
  computeDailyBudgetForDate(refDateStr?: string): {
    input: DailyBudgetInput;
    result: DailyBudgetResult;
  } {
    const targetDate = refDateStr ?? this.referenceDate;
    const settings = this.getWorkspaceSettings();

    const [yearStr, monthStr, dayStr] = targetDate.split('-');
    const year = Number.parseInt(yearStr, 10);
    const month = Number.parseInt(monthStr, 10);
    const currentDayOfMonth = Number.parseInt(dayStr, 10);
    const totalDaysInMonth = new Date(year, month, 0).getDate();
    const monthPrefix = `${yearStr}-${monthStr}`;

    // Spese fisse pianificate: somma dei monthly_limit delle categorie con is_fixed_expense = 1
    const fixedCategories = this.queryAll<CategoryRow>(
      `SELECT * FROM categories WHERE is_deleted = 0 AND type = 'expense' AND is_fixed_expense = 1`
    );
    const fixedExpensesPlannedCents = fixedCategories.reduce(
      (acc, c) => acc + (c.monthly_limit ?? 0),
      0
    );

    const monthTxs = this.getTransactionsWithDetails({ monthPrefix });

    let fixedExpensesActualCents = 0;
    let variableSpentBeforeTodayCents = 0;
    let variableSpentTodayCents = 0;

    for (const tx of monthTxs) {
      if (!tx.effective_affects_budget) continue;
      if (tx.type === 'income') continue; // Il pool di spesa misura le uscite rispetto al MonthlyBudgetTarget

      const impactCents = Math.abs(tx.budget_base_amount);
      if (tx.is_fixed === 1) {
        fixedExpensesActualCents += impactCents;
      } else {
        if (tx.date < targetDate) {
          variableSpentBeforeTodayCents += impactCents;
        } else if (tx.date === targetDate) {
          variableSpentTodayCents += impactCents;
        }
      }
    }

    const input: DailyBudgetInput = {
      monthlyBudgetCents: settings.monthly_budget_target,
      fixedExpensesPlannedCents,
      fixedExpensesActualCents,
      variableSpentBeforeTodayCents,
      variableSpentTodayCents,
      totalDaysInMonth,
      currentDayOfMonth,
    };

    const result = calculateDailyBudget(input);
    return { input, result };
  }

  recomputeWidgetSnapshot(refDateStr?: string): WidgetSnapshotRow {
    const { result } = this.computeDailyBudgetForDate(refDateStr);
    const crypto = this.getCryptoPortfolioSummary();
    const now = Date.now();

    this.db.run(
      `INSERT INTO widget_snapshot (
        id, daily_budget_remaining, daily_budget_allowance,
        month_remaining_budget, crypto_total_value, crypto_pnl_pct, updated_at
      ) VALUES ('current', ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        daily_budget_remaining = excluded.daily_budget_remaining,
        daily_budget_allowance = excluded.daily_budget_allowance,
        month_remaining_budget = excluded.month_remaining_budget,
        crypto_total_value = excluded.crypto_total_value,
        crypto_pnl_pct = excluded.crypto_pnl_pct,
        updated_at = excluded.updated_at`,
      [
        result.remainingTodayCents,
        result.dailyAllowanceCents,
        result.remainingMonthVariableCents,
        crypto.totalValueCents,
        Number(crypto.totalUnrealizedPnlPct.toFixed(2)),
        now,
      ]
    );

    return this.getWidgetSnapshot();
  }

  getWidgetSnapshot(): WidgetSnapshotRow {
    const row = this.queryOne<WidgetSnapshotRow>(
      `SELECT * FROM widget_snapshot WHERE id = 'current'`
    );
    if (row) return row;
    return this.recomputeWidgetSnapshot();
  }

  getDashboardSummary(refDateStr?: string): DashboardSummary {
    const targetDate = refDateStr ?? this.referenceDate;
    const monthPrefix = targetDate.slice(0, 7);
    const settings = this.getWorkspaceSettings();
    const { input, result } = this.computeDailyBudgetForDate(targetDate);
    const widgetSnapshot = this.recomputeWidgetSnapshot(targetDate);
    const accounts = this.getAccounts();
    const cryptoSummary = this.getCryptoPortfolioSummary();

    const totalBankBalanceCents = accounts.reduce(
      (acc, a) => acc + a.cached_balance,
      0
    );
    const totalNetWorthCents = totalBankBalanceCents + cryptoSummary.totalValueCents;

    const categories = this.getCategories().filter((c) => c.type === 'expense');
    const monthTxs = this.getTransactionsWithDetails({ monthPrefix });

    const spentByCategory = new Map<string, number>();
    for (const tx of monthTxs) {
      if (!tx.effective_affects_budget || tx.type === 'income') continue;
      if (tx.splits.length > 0) {
        for (const s of tx.splits) {
          spentByCategory.set(
            s.category_id,
            (spentByCategory.get(s.category_id) ?? 0) + s.amount_base
          );
        }
      }
    }

    const categoryBreakdown = categories.map((c) => ({
      categoryId: c.id,
      name: c.name,
      color: c.color,
      icon: c.icon,
      isFixed: c.is_fixed_expense === 1,
      monthlyLimitCents: c.monthly_limit,
      spentCents: spentByCategory.get(c.id) ?? 0,
    }));

    return {
      settings,
      dailyBudgetInput: input,
      dailyBudgetResult: result,
      widgetSnapshot,
      totalNetWorthCents,
      totalBankBalanceCents,
      cryptoSummary,
      categoryBreakdown,
    };
  }
}
