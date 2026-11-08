import React, { useMemo, useState } from 'react';
import { formatCents, parseMajorToCents } from '@dailybudget/core';
import type {
  AccountRow,
  DailyBudgetRepository,
  DashboardSummary,
  EnrichedTransaction,
} from '@dailybudget/db';
import {
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  CheckCircle2,
  Layers,
  PiggyBank,
  PlusCircle,
  ShieldCheck,
  Split,
  Users,
  Wallet,
  Watch,
  X,
} from 'lucide-react';
import { InfoTip } from './InfoTip';
import type { ActiveTab } from './PersistenceHeader';

interface DashboardTabProps {
  repo: DailyBudgetRepository;
  dashboard: DashboardSummary;
  accounts: AccountRow[];
  transactions: EnrichedTransaction[];
  referenceDate: string;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
  onNavigateTab: (tab: ActiveTab) => void;
}

type QuickActionType = 'none' | 'expense' | 'income' | 'transfer';

export function DashboardTab({
  repo,
  dashboard,
  accounts,
  transactions,
  referenceDate,
  onRefresh,
  onNotify,
  onNavigateTab,
}: DashboardTabProps) {
  const { dailyBudgetInput, dailyBudgetResult, widgetSnapshot } = dashboard;

  // Categories from repository
  const categories = useMemo(() => {
    try {
      return repo.getCategories();
    } catch {
      return [];
    }
  }, [repo]);

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories]
  );
  const incomeCategories = useMemo(
    () => categories.filter((c) => c.type === 'income'),
    [categories]
  );

  // Quick Action Sheet / Modal State
  const [quickAction, setQuickAction] = useState<QuickActionType>('none');
  const [qaAmount, setQaAmount] = useState<string>('15.00');
  const [qaAccountId, setQaAccountId] = useState<string>(
    accounts[0]?.id ?? ''
  );
  const [qaToAccountId, setQaToAccountId] = useState<string>(
    accounts[1]?.id ?? ''
  );
  const [qaCategoryId, setQaCategoryId] = useState<string>(
    expenseCategories[0]?.id ?? ''
  );
  const [qaDescription, setQaDescription] = useState<string>('');

  const effectiveFixedCents = Math.max(
    dailyBudgetInput.fixedExpensesPlannedCents,
    dailyBudgetInput.fixedExpensesActualCents
  );
  const variablePoolCents =
    dailyBudgetInput.monthlyBudgetCents - effectiveFixedCents;

  const todaySpentPct =
    dailyBudgetResult.dailyAllowanceCents > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (dailyBudgetInput.variableSpentTodayCents /
                dailyBudgetResult.dailyAllowanceCents) *
                100
            )
          )
        )
      : 100;

  // Spese di Oggi
  const todayExpenses = useMemo(() => {
    return transactions.filter(
      (tx) => tx.date === referenceDate && tx.type === 'expense'
    );
  }, [transactions, referenceDate]);

  // Quick Action Submit Handlers
  const handleQuickExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseMajorToCents(qaAmount);
    if (amountCents <= 0 || !qaAccountId) return;

    const rate = repo.getRateToBase('EUR');
    const baseCents = Math.round(amountCents * rate);

    repo.createTransaction({
      accountId: qaAccountId,
      type: 'expense',
      amountCents,
      currency: 'EUR',
      exchangeRateToBase: rate,
      baseAmountCents: baseCents,
      budgetBaseAmountCents: baseCents,
      isFixed: false,
      date: referenceDate,
      description: qaDescription.trim() || 'Spesa Rapida',
      splits: qaCategoryId
        ? [
            {
              categoryId: qaCategoryId,
              amountBaseCents: baseCents,
            },
          ]
        : undefined,
    });

    setQaDescription('');
    setQuickAction('none');
    await onRefresh();
    onNotify(
      `Spesa di ${formatCents(baseCents)} registrata con successo per oggi.`
    );
  };

  const handleQuickIncome = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseMajorToCents(qaAmount);
    if (amountCents <= 0 || !qaAccountId) return;

    const rate = repo.getRateToBase('EUR');
    const baseCents = Math.round(amountCents * rate);

    repo.createTransaction({
      accountId: qaAccountId,
      type: 'income',
      amountCents,
      currency: 'EUR',
      exchangeRateToBase: rate,
      baseAmountCents: baseCents,
      budgetBaseAmountCents: baseCents,
      isFixed: false,
      date: referenceDate,
      description: qaDescription.trim() || 'Entrata Rapida',
      splits: qaCategoryId
        ? [
            {
              categoryId: qaCategoryId,
              amountBaseCents: baseCents,
            },
          ]
        : undefined,
    });

    setQaDescription('');
    setQuickAction('none');
    await onRefresh();
    onNotify(
      `Entrata di ${formatCents(baseCents)} registrata con successo.`
    );
  };

  const handleQuickTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountCents = parseMajorToCents(qaAmount);
    if (amountCents <= 0 || !qaAccountId || !qaToAccountId) return;
    if (qaAccountId === qaToAccountId) {
      alert('Il conto di origine e di destinazione devono essere diversi.');
      return;
    }

    const rate = repo.getRateToBase('EUR');
    const baseCents = Math.round(amountCents * rate);

    repo.createTransaction({
      accountId: qaAccountId,
      toAccountId: qaToAccountId,
      type: 'transfer',
      amountCents,
      currency: 'EUR',
      exchangeRateToBase: rate,
      baseAmountCents: baseCents,
      budgetBaseAmountCents: 0,
      includeInBudget: 0,
      isFixed: false,
      date: referenceDate,
      description: qaDescription.trim() || 'Giroconto Rapido',
    });

    setQaDescription('');
    setQuickAction('none');
    await onRefresh();
    onNotify(
      `Giroconto di ${formatCents(baseCents)} completato con successo.`
    );
  };

  const handleSweepSavings = async () => {
    const checkingAcc =
      accounts.find((a) => a.type === 'checking') ?? accounts[0];
    const savingsAcc =
      accounts.find((a) => a.type === 'savings') ?? accounts[1];
    if (!checkingAcc || !savingsAcc) return;

    const sweepAmountCents = Math.min(
      10000,
      Math.max(2500, dailyBudgetResult.remainingTodayCents)
    );
    repo.sweepSavingsToAccount({
      fromAccountId: checkingAcc.id,
      toSavingsAccountId: savingsAcc.id,
      amountCents: sweepAmountCents,
      date: referenceDate,
      description: `Accantonamento Risparmio (${referenceDate})`,
    });
    await onRefresh();
    onNotify(
      `Accantonamento completato: ${formatCents(sweepAmountCents)} trasferiti su "${savingsAcc.name}".`
    );
  };

  const getAccountTypeLabel = (type: string) => {
    switch (type) {
      case 'checking':
        return 'Conto Corrente';
      case 'savings':
        return 'Conto Risparmio';
      case 'credit':
        return 'Carta di Credito';
      case 'wallet':
        return 'Contanti';
      case 'investment':
        return 'Investimenti';
      case 'crypto':
        return 'Crypto';
      default:
        return 'Conto';
    }
  };

  return (
    <>
      <div className="desktop-multi-pane">
        {/* Hero DailyBudget Card */}
        <section className="card daily-hero">
          <div className="daily-hero-top">
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem',
                  fontSize: '0.9rem',
                  fontWeight: 700,
                  color: 'var(--text-secondary)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  marginBottom: '0.35rem',
                }}
              >
                <span>Disponibilità Oggi</span>
                <InfoTip
                  title="Disponibilità Odierna"
                  text={`Data di riferimento: ${referenceDate}. Ciclo in corso dal ${dashboard.cycleWindow.cycleStartDate} al ${dashboard.cycleWindow.cycleEndDate} (giorno ${dashboard.cycleWindow.currentDayOfCycle} di ${dashboard.cycleWindow.totalDaysInCycle}).`}
                />
              </div>

              <div
                className="allowance-display mono-num"
                style={{
                  color:
                    dailyBudgetResult.status === 'over_budget'
                      ? 'var(--status-danger)'
                      : dailyBudgetResult.status === 'warning'
                        ? 'var(--status-warning)'
                        : 'var(--text-primary)',
                }}
              >
                {formatCents(
                  dailyBudgetResult.remainingTodayCents,
                  dashboard.settings.base_currency
                )}
              </div>

              <div
                style={{
                  fontSize: '0.9rem',
                  color: 'var(--text-secondary)',
                  marginTop: '0.4rem',
                }}
              >
                su quota giornaliera dinamica di{' '}
                <strong className="mono-num">
                  {formatCents(
                    dailyBudgetResult.dailyAllowanceCents,
                    dashboard.settings.base_currency
                  )}
                </strong>{' '}
                (spesi oggi:{' '}
                <span className="mono-num">
                  {formatCents(
                    dailyBudgetInput.variableSpentTodayCents,
                    dashboard.settings.base_currency
                  )}
                </span>
                )
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'flex-end',
                gap: '0.65rem',
              }}
            >
              <span className={`status-badge ${dailyBudgetResult.status}`}>
                <ShieldCheck size={16} />
                {dailyBudgetResult.status === 'safe'
                  ? 'In Target'
                  : dailyBudgetResult.status === 'warning'
                    ? 'Soglia < 20%'
                    : 'Budget Superato'}
              </span>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.65rem',
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label
                    htmlFor="input-month-start-day"
                    style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}
                  >
                    Inizio Ciclo:
                  </label>
                  <input
                    id="input-month-start-day"
                    type="number"
                    min={1}
                    max={28}
                    className="input mono-num"
                    style={{ width: '68px', padding: '0.35rem 0.5rem', fontSize: '0.88rem' }}
                    value={dashboard.settings.month_start_day}
                    onChange={async (e) => {
                      const day = Number.parseInt(e.target.value, 10);
                      if (Number.isNaN(day) || day < 1 || day > 28) return;
                      repo.updateWorkspaceSettings({
                        monthStartDay: day,
                      });
                      await onRefresh();
                    }}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <label
                    htmlFor="input-monthly-target"
                    style={{ fontSize: '0.86rem', color: 'var(--text-muted)' }}
                  >
                    Target Mese:
                  </label>
                  <input
                    id="input-monthly-target"
                    type="text"
                    inputMode="decimal"
                    className="input mono-num"
                    style={{ width: '105px', padding: '0.35rem 0.5rem', fontSize: '0.88rem' }}
                    value={(dashboard.settings.monthly_budget_target / 100).toFixed(0)}
                    onChange={async (e) => {
                      const cents = parseMajorToCents(e.target.value);
                      if (cents <= 0) return;
                      repo.updateWorkspaceSettings({
                        monthlyBudgetTargetCents: cents,
                      });
                      await onRefresh();
                    }}
                  />
                  <span style={{ fontSize: '0.88rem', fontWeight: 600 }}>€</span>
                </div>
              </div>
            </div>
          </div>

          {/* Progress Bar Today */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.85rem',
                color: 'var(--text-muted)',
                marginBottom: '0.45rem',
              }}
            >
              <span>Consumo quota giornaliera</span>
              <span className="mono-num">{todaySpentPct}%</span>
            </div>
            <div className="progress-track" style={{ height: 12 }}>
              <div
                className="progress-fill"
                style={{
                  width: `${todaySpentPct}%`,
                  backgroundColor:
                    dailyBudgetResult.status === 'over_budget'
                      ? 'var(--status-danger)'
                      : dailyBudgetResult.status === 'warning'
                        ? 'var(--status-warning)'
                        : 'var(--accent-primary)',
                }}
              />
            </div>
          </div>

          {/* Mathematical Breakdown */}
          <div className="formula-strip">
            <div className="metric-item">
              <span className="metric-label" style={{ display: 'flex', alignItems: 'center' }}>
                Spese Fisse Mese
                <InfoTip
                  title="Pool Spese Fisse"
                  text="Valore effettivo pari al massimo tra spese fisse pianificate e spese fisse reali già sostenute."
                />
              </span>
              <span className="metric-value mono-num">
                {formatCents(effectiveFixedCents)}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Pianificate {formatCents(dailyBudgetInput.fixedExpensesPlannedCents)}
              </span>
            </div>

            <div className="metric-item">
              <span className="metric-label">Budget Variabile Mese</span>
              <span className="metric-value mono-num">
                {formatCents(variablePoolCents)}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Residuo Mese: {formatCents(dailyBudgetResult.remainingMonthVariableCents)}
              </span>
            </div>

            <div className="metric-item">
              <span className="metric-label">Proiezione a Fine Ciclo</span>
              <span className="metric-value mono-num">
                {formatCents(dailyBudgetResult.projectedMonthEndTotalCents)}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                su target {formatCents(dailyBudgetInput.monthlyBudgetCents)}
              </span>
            </div>

            <div className="metric-item">
              <span className="metric-label">Risparmio Previsto</span>
              <span
                className="metric-value mono-num"
                style={{
                  color:
                    dailyBudgetResult.projectedSavingsOrOverrunCents >= 0
                      ? 'var(--status-safe)'
                      : 'var(--status-danger)',
                }}
              >
                {dailyBudgetResult.projectedSavingsOrOverrunCents >= 0 ? '+' : ''}
                {formatCents(dailyBudgetResult.projectedSavingsOrOverrunCents)}
              </span>
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Stima a fine mese
              </span>
            </div>
          </div>
        </section>

        {/* Anteprima Widget & Orologio (Clean Hub, no raw SQL) */}
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card-header" style={{ marginBottom: 0 }}>
            <div>
              <h2 className="card-title">
                <Watch size={18} />
                Anteprima Widget &amp; Orologio
                <InfoTip
                  title="Widget Snapshot"
                  text="Riepilogo compatto e istantaneo per iOS WidgetKit, Apple Watch e Wear OS con le metriche chiave sempre a portata di polso."
                />
              </h2>
            </div>
            <span className="chip override-include">Sincronizzato</span>
          </div>

          <div className="widget-preview-box">
            <div className="panel-pair" style={{ gap: '0.85rem' }}>
              <div>
                <div className="metric-label">Disponibilità Odierna</div>
                <div className="metric-value mono-num" style={{ fontSize: '1.25rem', color: 'var(--accent-primary)' }}>
                  {formatCents(widgetSnapshot.daily_budget_remaining)}
                </div>
              </div>
              <div>
                <div className="metric-label">Quota Giornaliera</div>
                <div className="metric-value mono-num" style={{ fontSize: '1.25rem' }}>
                  {formatCents(widgetSnapshot.daily_budget_allowance)}
                </div>
              </div>
              <div>
                <div className="metric-label">Budget Mese Residuo</div>
                <div className="metric-value mono-num" style={{ fontSize: '1.25rem' }}>
                  {formatCents(widgetSnapshot.month_remaining_budget)}
                </div>
              </div>
              <div>
                <div className="metric-label">Portafoglio Crypto</div>
                <div className="metric-value mono-num" style={{ fontSize: '1.25rem' }}>
                  {formatCents(widgetSnapshot.crypto_total_value)}{' '}
                  <span
                    style={{
                      fontSize: '0.85rem',
                      color:
                        widgetSnapshot.crypto_pnl_pct >= 0
                          ? 'var(--status-safe)'
                          : 'var(--status-danger)',
                    }}
                  >
                    ({widgetSnapshot.crypto_pnl_pct >= 0 ? '+' : ''}
                    {widgetSnapshot.crypto_pnl_pct.toFixed(2)}%)
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="panel-pair" style={{ gap: '0.85rem', marginTop: 'auto' }}>
            <div
              style={{
                padding: '0.85rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="metric-label">Liquidità Conti Bancari</div>
              <div className="metric-value mono-num" style={{ fontSize: '1.2rem' }}>
                {formatCents(dashboard.totalBankBalanceCents)}
              </div>
            </div>

            <div
              style={{
                padding: '0.85rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="metric-label">Patrimonio Netto Totale</div>
              <div className="metric-value mono-num" style={{ fontSize: '1.2rem' }}>
                {formatCents(dashboard.totalNetWorthCents)}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* HUB AZIONI RAPIDE RICORRENTI (Mobile & Desktop) */}
      <section className="card" style={{ padding: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.85rem' }}>
          <h2 className="card-title" style={{ fontSize: '1.05rem' }}>
            Azioni Rapide
            <InfoTip
              title="Azioni Rapide"
              text="Accesso istantaneo con un tocco alle operazioni più frequenti: registrazione spesa rapida, nuove entrate, giroconti o risparmio guidato."
            />
          </h2>
        </div>

        <div className="quick-actions-grid">
          <button
            type="button"
            className="quick-action-btn primary"
            onClick={() => {
              setQaAmount('15.00');
              setQaDescription('');
              setQaCategoryId(expenseCategories[0]?.id ?? '');
              setQuickAction('expense');
            }}
          >
            <div className="quick-action-icon">
              <PlusCircle size={22} />
            </div>
            <span>Spesa Rapida</span>
          </button>

          <button
            type="button"
            className="quick-action-btn"
            onClick={() => {
              setQaAmount('50.00');
              setQaDescription('');
              setQaCategoryId(incomeCategories[0]?.id ?? '');
              setQuickAction('income');
            }}
          >
            <div className="quick-action-icon" style={{ color: 'var(--status-safe)' }}>
              <ArrowUpRight size={22} />
            </div>
            <span>Nuova Entrata</span>
          </button>

          <button
            type="button"
            className="quick-action-btn"
            onClick={() => {
              setQaAmount('50.00');
              setQaDescription('');
              setQuickAction('transfer');
            }}
          >
            <div className="quick-action-icon" style={{ color: 'var(--accent-primary)' }}>
              <ArrowRightLeft size={22} />
            </div>
            <span>Giroconto</span>
          </button>

          <button
            type="button"
            className="quick-action-btn"
            onClick={() => onNavigateTab('tricount')}
          >
            <div className="quick-action-icon" style={{ color: 'var(--accent-primary)' }}>
              <Users size={22} />
            </div>
            <span>Spesa Gruppo</span>
          </button>

          <button
            id="btn-sweep-savings"
            type="button"
            className="quick-action-btn"
            onClick={handleSweepSavings}
          >
            <div className="quick-action-icon" style={{ color: 'var(--status-safe)' }}>
              <PiggyBank size={22} />
            </div>
            <span>Sweep Risparmi</span>
          </button>
        </div>
      </section>

      {/* SEZIONE: SPESE DI OGGI & I MIEI CONTI */}
      <div className="panel-pair desktop-split-view">
        {/* Spese di Oggi */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <ArrowDownRight size={18} />
                Spese di Oggi ({todayExpenses.length})
                <InfoTip
                  title="Spese di Oggi"
                  text={`Movimenti di spesa registrati per la data odierna (${referenceDate}) che incidono sul budget.`}
                />
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => {
                setQaAmount('15.00');
                setQaDescription('');
                setQaCategoryId(expenseCategories[0]?.id ?? '');
                setQuickAction('expense');
              }}
            >
              + Aggiungi Spesa
            </button>
          </div>

          {todayExpenses.length === 0 ? (
            <div
              style={{
                textAlign: 'center',
                padding: '1.75rem 1rem',
                color: 'var(--text-secondary)',
                backgroundColor: 'var(--bg-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <CheckCircle2 size={32} style={{ color: 'var(--status-safe)', margin: '0 auto 0.5rem auto' }} />
              <p style={{ fontWeight: 600, fontSize: '0.95rem' }}>Nessuna spesa registrata per oggi</p>
              <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginTop: '0.2rem' }}>
                La tua quota giornaliera è completamente intatta!
              </p>
            </div>
          ) : (
            <div className="tx-list">
              {todayExpenses.map((tx) => (
                <div key={tx.id} className="tx-row">
                  <div className="tx-main">
                    <div className="tx-title">
                      <span>{tx.description || 'Spesa'}</span>
                      {tx.splits.map((s) => (
                        <span key={s.id} className="chip">
                          {s.category_name}
                        </span>
                      ))}
                    </div>
                    <div className="tx-meta">
                      <span>{tx.account_name}</span>
                      {tx.include_in_budget === 0 && (
                        <span className="chip override-exclude">Fuori Budget</span>
                      )}
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div className="mono-num" style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                      -{formatCents(Math.abs(tx.base_amount))}
                    </div>
                    {tx.base_amount !== tx.budget_base_amount && (
                      <div className="mono-num" style={{ fontSize: '0.85rem', color: 'var(--accent-primary)', fontWeight: 600 }}>
                        Budget: {formatCents(tx.budget_base_amount)}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* I Miei Conti */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Wallet size={18} />
                I Miei Conti ({accounts.length})
                <InfoTip
                  title="I Miei Conti"
                  text="Elenco di tutti i conti correnti, risparmi, carte o portafogli registrati, con il saldo disponibile."
                />
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onNavigateTab('transactions')}
            >
              Gestisci Conti
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
            {accounts.map((acc) => (
              <div
                key={acc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.85rem 1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <div>
                  <strong style={{ fontSize: '0.96rem', display: 'block' }}>{acc.name}</strong>
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '0.45rem', marginTop: '0.2rem' }}>
                    <span>{getAccountTypeLabel(acc.type)}</span>
                    <span>•</span>
                    <span className={`chip ${acc.include_in_budget === 1 ? 'override-include' : 'override-exclude'}`} style={{ fontSize: '0.82rem' }}>
                      {acc.include_in_budget === 1 ? 'Nel Budget' : 'Fuori Budget'}
                    </span>
                  </div>
                </div>

                <div className="mono-num" style={{ fontSize: '1.2rem', fontWeight: 700 }}>
                  {formatCents(acc.cached_balance, acc.currency)}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Category Breakdown & Latest Transactions */}
      <div className="panel-pair desktop-split-view">
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Layers size={18} />
                Budget Categorie
                <InfoTip
                  title="Categorie di Budget"
                  text="Avanzamento di spesa mensile per ciascuna categoria, confrontato con il limite o la pianificazione fissata."
                />
              </h2>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.95rem' }}>
            {dashboard.categoryBreakdown.map((cat) => {
              const limit = cat.monthlyLimitCents ?? 0;
              const pct =
                limit > 0
                  ? Math.min(100, Math.round((cat.spentCents / limit) * 100))
                  : 0;
              return (
                <div key={cat.categoryId}>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.88rem',
                      marginBottom: '0.35rem',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.45rem',
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          backgroundColor: cat.color,
                          display: 'inline-block',
                        }}
                      />
                      {cat.name}
                      {cat.isFixed && <span className="chip">FISSA</span>}
                    </span>
                    <span className="mono-num">
                      <strong>{formatCents(cat.spentCents)}</strong>
                      {limit > 0 ? ` / ${formatCents(limit)}` : ''}
                    </span>
                  </div>
                  <div className="progress-track" style={{ height: 8 }}>
                    <div
                      className="progress-fill"
                      style={{
                        width: `${pct}%`,
                        backgroundColor:
                          pct >= 100 ? 'var(--status-danger)' : cat.color,
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <ArrowRightLeft size={18} />
                Ultime Transazioni
                <InfoTip
                  title="Movimenti Recenti"
                  text="Elenco cronologico degli ultimi movimenti finanziari registrati."
                />
              </h2>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => onNavigateTab('transactions')}
            >
              Tutte / Nuova
            </button>
          </div>

          <div className="tx-list">
            {transactions.slice(0, 6).map((tx) => (
              <div key={tx.id} className="tx-row">
                <div className="tx-main">
                  <div className="tx-title">
                    <span>
                      {tx.description ||
                        (tx.type === 'expense'
                          ? 'Spesa'
                          : tx.type === 'income'
                            ? 'Entrata'
                            : tx.type === 'transfer'
                              ? 'Giroconto'
                              : 'Movimento')}
                    </span>
                    {tx.include_in_budget === 1 && (
                      <span className="chip override-include">
                        Nel Budget
                      </span>
                    )}
                    {tx.include_in_budget === 0 && (
                      <span className="chip override-exclude">
                        Fuori Budget
                      </span>
                    )}
                    {tx.splits.length > 1 && (
                      <span className="chip">
                        <Split size={12} /> Suddivisa ({tx.splits.length})
                      </span>
                    )}
                  </div>
                  <div className="tx-meta">
                    <span>{tx.date}</span>
                    <span>•</span>
                    <span>{tx.account_name}</span>
                    {tx.splits.map((s) => (
                      <span key={s.id} className="chip">
                        {s.category_name}: {formatCents(s.amount_base)}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div
                    className="mono-num"
                    style={{
                      fontWeight: 700,
                      fontSize: '1.05rem',
                      color:
                        tx.type === 'income'
                          ? 'var(--status-safe)'
                          : 'var(--text-primary)',
                    }}
                  >
                    {tx.type === 'income' ? '+' : '-'}
                    {formatCents(Math.abs(tx.base_amount))}
                  </div>
                  {tx.base_amount !== tx.budget_base_amount && (
                    <div
                      className="mono-num"
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--accent-primary)',
                        fontWeight: 600,
                      }}
                    >
                      Budget: {formatCents(tx.budget_base_amount)}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* QUICK ACTION MODAL / BOTTOM SHEET */}
      {quickAction !== 'none' && (
        <div
          className="quick-modal-backdrop"
          onClick={() => setQuickAction('none')}
        >
          <div
            className="quick-modal-panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="quick-modal-header">
              <h3 className="quick-modal-title">
                {quickAction === 'expense' && (
                  <>
                    <PlusCircle size={22} style={{ color: 'var(--accent-primary)' }} />
                    Spesa Rapida
                  </>
                )}
                {quickAction === 'income' && (
                  <>
                    <ArrowUpRight size={22} style={{ color: 'var(--status-safe)' }} />
                    Nuova Entrata
                  </>
                )}
                {quickAction === 'transfer' && (
                  <>
                    <ArrowRightLeft size={22} style={{ color: 'var(--accent-primary)' }} />
                    Giroconto Rapido
                  </>
                )}
              </h3>
              <button
                type="button"
                className="infotip-close-btn"
                onClick={() => setQuickAction('none')}
                aria-label="Chiudi finestra"
              >
                <X size={20} />
              </button>
            </div>

            {quickAction === 'expense' && (
              <form onSubmit={handleQuickExpense} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="field">
                  <label htmlFor="qa-expense-amount">Importo (€)</label>
                  <input
                    id="qa-expense-amount"
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    className="input mono-num"
                    style={{ fontSize: '1.4rem', fontWeight: 700, padding: '0.65rem 0.85rem' }}
                    value={qaAmount}
                    onChange={(e) => setQaAmount(e.target.value)}
                  />
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="qa-expense-account">Conto</label>
                    <select
                      id="qa-expense-account"
                      className="select"
                      value={qaAccountId}
                      onChange={(e) => setQaAccountId(e.target.value)}
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({formatCents(a.cached_balance, a.currency)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="qa-expense-category">Categoria</label>
                    <select
                      id="qa-expense-category"
                      className="select"
                      value={qaCategoryId}
                      onChange={(e) => setQaCategoryId(e.target.value)}
                    >
                      {expenseCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="qa-expense-desc">Descrizione (opzionale)</label>
                  <input
                    id="qa-expense-desc"
                    className="input"
                    placeholder="es. Pranzo, Spesa alimentare, Caffè"
                    value={qaDescription}
                    onChange={(e) => setQaDescription(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ minHeight: '48px', fontSize: '1rem', marginTop: '0.5rem' }}
                >
                  Registra Spesa
                </button>
              </form>
            )}

            {quickAction === 'income' && (
              <form onSubmit={handleQuickIncome} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="field">
                  <label htmlFor="qa-income-amount">Importo Entrata (€)</label>
                  <input
                    id="qa-income-amount"
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    className="input mono-num"
                    style={{ fontSize: '1.4rem', fontWeight: 700, padding: '0.65rem 0.85rem' }}
                    value={qaAmount}
                    onChange={(e) => setQaAmount(e.target.value)}
                  />
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="qa-income-account">Accredita su Conto</label>
                    <select
                      id="qa-income-account"
                      className="select"
                      value={qaAccountId}
                      onChange={(e) => setQaAccountId(e.target.value)}
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({formatCents(a.cached_balance, a.currency)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="qa-income-category">Categoria</label>
                    <select
                      id="qa-income-category"
                      className="select"
                      value={qaCategoryId}
                      onChange={(e) => setQaCategoryId(e.target.value)}
                    >
                      {incomeCategories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="qa-income-desc">Descrizione</label>
                  <input
                    id="qa-income-desc"
                    className="input"
                    placeholder="es. Stipendio, Rimborso, Vendita"
                    value={qaDescription}
                    onChange={(e) => setQaDescription(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ minHeight: '48px', fontSize: '1rem', marginTop: '0.5rem' }}
                >
                  Registra Entrata
                </button>
              </form>
            )}

            {quickAction === 'transfer' && (
              <form onSubmit={handleQuickTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="field">
                  <label htmlFor="qa-transfer-amount">Importo Giroconto (€)</label>
                  <input
                    id="qa-transfer-amount"
                    type="text"
                    inputMode="decimal"
                    autoFocus
                    className="input mono-num"
                    style={{ fontSize: '1.4rem', fontWeight: 700, padding: '0.65rem 0.85rem' }}
                    value={qaAmount}
                    onChange={(e) => setQaAmount(e.target.value)}
                  />
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="qa-transfer-from">Da Conto</label>
                    <select
                      id="qa-transfer-from"
                      className="select"
                      value={qaAccountId}
                      onChange={(e) => setQaAccountId(e.target.value)}
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({formatCents(a.cached_balance, a.currency)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="qa-transfer-to">A Conto</label>
                    <select
                      id="qa-transfer-to"
                      className="select"
                      value={qaToAccountId}
                      onChange={(e) => setQaToAccountId(e.target.value)}
                    >
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} ({formatCents(a.cached_balance, a.currency)})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="qa-transfer-desc">Descrizione (opzionale)</label>
                  <input
                    id="qa-transfer-desc"
                    className="input"
                    placeholder="es. Spostamento su conto risparmio"
                    value={qaDescription}
                    onChange={(e) => setQaDescription(e.target.value)}
                  />
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ minHeight: '48px', fontSize: '1rem', marginTop: '0.5rem' }}
                >
                  Esegui Giroconto
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
