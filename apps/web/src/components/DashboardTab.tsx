import React from 'react';
import { formatCents } from '@dailybudget/core';
import type {
  AccountRow,
  DailyBudgetRepository,
  DashboardSummary,
  EnrichedTransaction,
} from '@dailybudget/db';
import {
  ArrowRightLeft,
  Layers,
  PiggyBank,
  ShieldCheck,
  Smartphone,
  Split,
  Watch,
} from 'lucide-react';
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

  return (
    <>
      <div className="desktop-multi-pane">
        {/* Hero DailyBudget Card */}
        <section className="card daily-hero">
          <div className="daily-hero-top">
            <div>
              <div className="card-subtitle">
                DISPONIBILITÀ OGGI ({referenceDate} • Ciclo{' '}
                {dashboard.cycleWindow.cycleStartDate} →{' '}
                {dashboard.cycleWindow.cycleEndDate} • Giorno{' '}
                {dashboard.cycleWindow.currentDayOfCycle}/
                {dashboard.cycleWindow.totalDaysInCycle})
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
                  fontSize: '0.83rem',
                  color: 'var(--text-secondary)',
                  marginTop: '0.25rem',
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
                gap: '0.5rem',
              }}
            >
              <span className={`status-badge ${dailyBudgetResult.status}`}>
                <ShieldCheck size={14} />
                {dailyBudgetResult.status === 'safe'
                  ? 'In Target'
                  : dailyBudgetResult.status === 'warning'
                    ? 'Soglia < 20%'
                    : 'Over Budget'}
              </span>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  flexWrap: 'wrap',
                  justifyContent: 'flex-end',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <label
                    htmlFor="input-month-start-day"
                    style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}
                  >
                    Giorno Inizio Ciclo:
                  </label>
                  <input
                    id="input-month-start-day"
                    type="number"
                    min={1}
                    max={28}
                    className="input mono-num"
                    style={{ width: '62px', padding: '0.25rem 0.4rem', fontSize: '0.8rem' }}
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

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <label
                    htmlFor="input-monthly-target"
                    style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}
                  >
                    Target Mensile:
                  </label>
                  <input
                    id="input-monthly-target"
                    type="number"
                    step="50"
                    className="input mono-num"
                    style={{ width: '100px', padding: '0.25rem 0.45rem', fontSize: '0.8rem' }}
                    value={(dashboard.settings.monthly_budget_target / 100).toFixed(0)}
                    onChange={async (e) => {
                      const val = Number.parseFloat(e.target.value);
                      if (Number.isNaN(val) || val <= 0) return;
                      repo.updateWorkspaceSettings({
                        monthlyBudgetTargetCents: Math.round(val * 100),
                      });
                      await onRefresh();
                    }}
                  />
                  <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>€</span>
                </div>
              </div>

              <button
                id="btn-sweep-savings"
                type="button"
                className="btn btn-sm"
                onClick={async () => {
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
                    `Giroconto Risparmio completato: ${formatCents(sweepAmountCents)} trasferiti da "${checkingAcc.name}" a "${savingsAcc.name}" (neutro sul DailyBudget).`
                  );
                }}
              >
                <PiggyBank size={14} /> Giroconta Risparmio a Conto Savings
              </button>
            </div>
          </div>

          {/* Progress Bar Today */}
          <div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
                marginBottom: '0.35rem',
              }}
            >
              <span>Consumo quota giornaliera</span>
              <span className="mono-num">{todaySpentPct}%</span>
            </div>
            <div className="progress-track">
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

          {/* Mathematical Breakdown (Pool Fisso vs Variabile + Burn Rate) */}
          <div className="formula-strip">
            <div className="metric-item">
              <span className="metric-label">
                Pool Fisso Effettivo max(Plan, Act)
              </span>
              <span className="metric-value mono-num">
                {formatCents(effectiveFixedCents)}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Plan {formatCents(dailyBudgetInput.fixedExpensesPlannedCents)} • Reale{' '}
                {formatCents(dailyBudgetInput.fixedExpensesActualCents)}
              </span>
            </div>

            <div className="metric-item">
              <span className="metric-label">Pool Variabile Mensile</span>
              <span className="metric-value mono-num">
                {formatCents(variablePoolCents)}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Residuo Mese:{' '}
                {formatCents(dailyBudgetResult.remainingMonthVariableCents)}
              </span>
            </div>

            <div className="metric-item">
              <span className="metric-label">Proiezione Fine Mese (Burn Rate)</span>
              <span className="metric-value mono-num">
                {formatCents(dailyBudgetResult.projectedMonthEndTotalCents)}
              </span>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                su target {formatCents(dailyBudgetInput.monthlyBudgetCents)}
              </span>
            </div>

            <div className="metric-item">
              <span className="metric-label">Risparmio / Sforamento Stimato</span>
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
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                Fine mese stimato
              </span>
            </div>
          </div>
        </section>

        {/* Pannello Native Widget Snapshot & Patrimonio */}
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div className="card-header" style={{ marginBottom: 0 }}>
            <div>
              <h2 className="card-title">
                <Watch size={17} />
                Tabella SQLite <code>widget_snapshot</code> (O(1) Native Read)
              </h2>
              <p className="card-subtitle">
                Riga pre-calcolata nel file <code>.dbbudget</code> per WidgetKit, WatchOS e Wear OS
              </p>
            </div>
            <Smartphone size={18} style={{ color: 'var(--accent-primary)' }} />
          </div>

          <div className="widget-preview-box">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '0.55rem',
              }}
            >
              <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                SELECT * FROM widget_snapshot WHERE id = &apos;current&apos;;
              </span>
              <span className="chip override-include">SYNCED</span>
            </div>

            <div className="panel-pair" style={{ gap: '0.65rem' }}>
              <div>
                <div className="metric-label">daily_budget_remaining</div>
                <div className="metric-value mono-num">
                  {formatCents(widgetSnapshot.daily_budget_remaining)}
                </div>
              </div>
              <div>
                <div className="metric-label">daily_budget_allowance</div>
                <div className="metric-value mono-num">
                  {formatCents(widgetSnapshot.daily_budget_allowance)}
                </div>
              </div>
              <div>
                <div className="metric-label">month_remaining_budget</div>
                <div className="metric-value mono-num">
                  {formatCents(widgetSnapshot.month_remaining_budget)}
                </div>
              </div>
              <div>
                <div className="metric-label">crypto_total_value / pnl</div>
                <div className="metric-value mono-num">
                  {formatCents(widgetSnapshot.crypto_total_value)}{' '}
                  <span
                    style={{
                      fontSize: '0.76rem',
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

          <div className="panel-pair" style={{ gap: '0.75rem', marginTop: 'auto' }}>
            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="metric-label">Liquidità Conti Bancari</div>
              <div className="metric-value mono-num">
                {formatCents(dashboard.totalBankBalanceCents)}
              </div>
            </div>

            <div
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <div className="metric-label">Patrimonio Netto (Fiat + Crypto)</div>
              <div className="metric-value mono-num">
                {formatCents(dashboard.totalNetWorthCents)}
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Category Breakdown & Latest Transactions */}
      <div className="panel-pair desktop-split-view">
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Layers size={17} />
                Budget Categorie (Fisse vs Variabili)
              </h2>
              <p className="card-subtitle">
                Calcolato sugli split di competenza (<code>transaction_splits</code>)
              </p>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
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
                      fontSize: '0.82rem',
                      marginBottom: '0.28rem',
                    }}
                  >
                    <span
                      style={{
                        fontWeight: 600,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                      }}
                    >
                      <span
                        style={{
                          width: 10,
                          height: 10,
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
                  <div className="progress-track" style={{ height: 7 }}>
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
                <ArrowRightLeft size={17} />
                Ultime Transazioni &amp; Regole di Competenza
              </h2>
              <p className="card-subtitle">
                Mostra la distinzione tra Cashflow (<code>base_amount</code>) e Budget (
                <code>budget_base_amount</code>)
              </p>
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
                    <span>{tx.description || tx.type}</span>
                    {tx.include_in_budget === 1 && (
                      <span className="chip override-include">
                        Override: Forza Budget [1]
                      </span>
                    )}
                    {tx.include_in_budget === 0 && (
                      <span className="chip override-exclude">
                        Override: Escluso [0]
                      </span>
                    )}
                    {tx.splits.length > 1 && (
                      <span className="chip">
                        <Split size={11} /> Split ({tx.splits.length})
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
                    {tx.tags.map((tg) => (
                      <span key={tg.id} className="chip">
                        #{tg.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div
                    className="mono-num"
                    style={{
                      fontWeight: 700,
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
                        fontSize: '0.73rem',
                        color: 'var(--accent-primary)',
                        fontWeight: 600,
                      }}
                    >
                      Budget: {formatCents(tx.budget_base_amount)}
                    </div>
                  )}
                  {!tx.effective_affects_budget && (
                    <div
                      style={{
                        fontSize: '0.7rem',
                        color: 'var(--text-muted)',
                      }}
                    >
                      No impatto DailyBudget
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
