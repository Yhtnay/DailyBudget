import React, { useEffect, useMemo, useState } from 'react';
import {
  formatCents,
  parseMajorToCents,
  type SplitMode,
} from '@dailybudget/core';
import type {
  AccountRow,
  CategoryRow,
  DailyBudgetRepository,
  DashboardSummary,
  TricountGroupDetail,
} from '@dailybudget/db';
import { Plus, Users } from 'lucide-react';
import { InfoTip } from './InfoTip';

interface TricountTabProps {
  repo: DailyBudgetRepository;
  dashboard: DashboardSummary;
  tricountGroups: TricountGroupDetail[];
  accounts: AccountRow[];
  categories: CategoryRow[];
  referenceDate: string;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function TricountTab({
  repo,
  dashboard,
  tricountGroups,
  accounts,
  categories,
  referenceDate,
  onRefresh,
  onNotify,
}: TricountTabProps) {
  const [selectedGroupId, setSelectedGroupId] = useState<string>(
    () => tricountGroups[0]?.group.id ?? ''
  );
  const [tricountTitle, setTricountTitle] = useState<string>('');
  const [tricountAmountMajor, setTricountAmountMajor] = useState<string>('80.00');
  const [tricountCurrency, setTricountCurrency] = useState<string>('EUR');
  const [tricountRateToGroup, setTricountRateToGroup] = useState<string>('1.0');
  const [tricountPaidById, setTricountPaidById] = useState<string>(
    () => tricountGroups[0]?.members[0]?.id ?? ''
  );
  const [tricountSplitMode, setTricountSplitMode] = useState<SplitMode>('equal');
  const [tricountMemberShares, setTricountMemberShares] = useState<
    Record<string, string>
  >({});
  const [tricountLinkAccount, setTricountLinkAccount] = useState<string>(
    () => accounts[0]?.id ?? ''
  );
  const [tricountLinkCategory, setTricountLinkCategory] = useState<string>(
    () => categories.find((c) => c.type === 'expense')?.id ?? ''
  );

  // New Tricount Group Form State
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupCurrency, setNewGroupCurrency] = useState<string>('EUR');
  const [newGroupMembersCsv, setNewGroupMembersCsv] = useState<string>(
    'Andrea (Io), Marco, Elena'
  );

  useEffect(() => {
    if (tricountGroups.length > 0 && !selectedGroupId) {
      setSelectedGroupId(tricountGroups[0].group.id);
      if (tricountGroups[0].members.length > 0) {
        setTricountPaidById(tricountGroups[0].members[0].id);
      }
    }
  }, [tricountGroups, selectedGroupId]);

  const activeTricountGroup = useMemo(
    () =>
      tricountGroups.find((g) => g.group.id === selectedGroupId) ??
      tricountGroups[0] ??
      null,
    [tricountGroups, selectedGroupId]
  );

  return (
    <>
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <h2 className="card-title">
              <Users size={18} />
              Spese Condivise &amp; Gruppi
              <InfoTip
                title="Spese di Gruppo"
                text="Gestisci spese condivise con amici, coinquilini o viaggi. Calcola i saldi e i rimborsi minimi necessari."
              />
            </h2>
            <select
              aria-label="Seleziona Gruppo Tricount"
              className="select"
              style={{ width: 'auto', fontWeight: 600 }}
              value={activeTricountGroup?.group.id ?? ''}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedGroupId(nextId);
                const grp = tricountGroups.find((g) => g.group.id === nextId);
                if (grp && grp.members.length > 0) {
                  setTricountPaidById(grp.members[0].id);
                }
              }}
            >
              {tricountGroups.map((g) => (
                <option key={g.group.id} value={g.group.id}>
                  {g.group.name} ({g.group.default_currency})
                </option>
              ))}
            </select>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <label
                htmlFor="select-tricount-competence-mode"
                style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}
              >
                Modalità Conteggio:
              </label>
              <select
                id="select-tricount-competence-mode"
                className="select"
                style={{ width: 'auto', fontSize: '0.86rem' }}
                value={String(dashboard.settings.include_tricount_owes_immediately)}
                onChange={async (e) => {
                  const val = e.target.value;
                  repo.updateWorkspaceSettings({
                    includeTricountOwesImmediately: val === '1',
                  });
                  await onRefresh();
                  onNotify(
                    val === '1'
                      ? 'Tricount impostato su Competenza Immediata.'
                      : 'Tricount impostato su Criterio di Cassa al Pareggio.'
                  );
                }}
              >
                <option value="1">
                  Competenza Immediata (impatto immediato alla data spesa)
                </option>
                <option value="0">
                  Criterio di Cassa (impatto al momento del pareggio)
                </option>
              </select>
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!newGroupName.trim()) return;
              const names = newGroupMembersCsv
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);
              if (names.length < 2) return;
              const created = repo.createTricountGroup({
                name: newGroupName.trim(),
                defaultCurrency: newGroupCurrency,
                members: names.map((n, idx) => ({
                  name: n,
                  isMe: idx === 0,
                })),
              });
              setNewGroupName('');
              setSelectedGroupId(created.group.id);
              setTricountPaidById(created.members[0]?.id ?? '');
              await onRefresh();
            }}
            style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}
          >
            <input
              className="input"
              style={{ width: '170px' }}
              placeholder="Nome nuovo gruppo..."
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
            />
            <select
              id="new-group-currency"
              aria-label="Valuta Default Gruppo"
              className="select"
              style={{ width: '85px' }}
              value={newGroupCurrency}
              onChange={(e) => setNewGroupCurrency(e.target.value)}
            >
              <option value="EUR">EUR</option>
              <option value="USD">USD</option>
              <option value="CHF">CHF</option>
              <option value="GBP">GBP</option>
            </select>
            <input
              className="input"
              style={{ width: '220px' }}
              placeholder="Membri (es. Andrea, Marco, Giulia)"
              value={newGroupMembersCsv}
              onChange={(e) => setNewGroupMembersCsv(e.target.value)}
            />
            <button type="submit" className="btn">
              <Plus size={14} /> Crea Gruppo
            </button>
          </form>
        </div>

        {activeTricountGroup && (
          <div className="panel-pair desktop-split-view">
            {/* Saldi Netti + Piano di Rimborso Ottimizzato */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.65rem' }}>
                  Saldi Netti dei Partecipanti ({activeTricountGroup.group.default_currency})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {activeTricountGroup.balances.map((b) => {
                    const memberObj = activeTricountGroup.members.find(
                      (m) => m.id === b.memberId
                    );
                    return (
                      <div
                        key={b.memberId}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.45rem 0.65rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {b.memberName}{' '}
                          {memberObj?.is_me === 1 && (
                            <span className="chip override-include">is_me = 1</span>
                          )}
                        </span>
                        <span
                          className="mono-num"
                          style={{
                            fontWeight: 700,
                            color:
                              b.netBalanceCents > 0
                                ? 'var(--status-safe)'
                                : b.netBalanceCents < 0
                                  ? 'var(--status-danger)'
                                  : 'var(--text-muted)',
                          }}
                        >
                          {b.netBalanceCents > 0 ? '+' : ''}
                          {formatCents(
                            b.netBalanceCents,
                            activeTricountGroup.group.default_currency
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Greedy Minimum Cash Flow Settlements */}
              <div
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-strong)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.65rem' }}>
                  <h3 style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                    Piano di Rimborso Ottimizzato
                  </h3>
                  <InfoTip
                    title="Pareggio Ottimizzato"
                    text="Calcola il piano di rimborsi per azzerare i debiti tra partecipanti con il minimo numero di pagamenti."
                  />
                </div>

                {activeTricountGroup.settlements.length === 0 ? (
                  <div className="chip override-include">
                    Tutti i conti del gruppo sono in pareggio!
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                    {activeTricountGroup.settlements.map((s, idx) => (
                      <div
                        key={idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.6rem 0.75rem',
                          borderRadius: 'var(--radius-sm)',
                          backgroundColor: 'var(--bg-surface)',
                          border: '1px solid var(--border-subtle)',
                        }}
                      >
                        <div>
                          <strong>{s.fromMemberName}</strong> deve a{' '}
                          <strong>{s.toMemberName}</strong>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span className="mono-num" style={{ fontWeight: 700 }}>
                            {formatCents(
                              s.amountCents,
                              activeTricountGroup.group.default_currency
                            )}
                          </span>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            onClick={async () => {
                              repo.recordTricountSettlement({
                                groupId: activeTricountGroup.group.id,
                                fromMemberId: s.fromMemberId,
                                toMemberId: s.toMemberId,
                                amountCents: s.amountCents,
                                date: referenceDate,
                                personalAccountId:
                                  tricountLinkAccount || accounts[0]?.id,
                              });
                              await onRefresh();
                              onNotify(
                                `Rimborso di ${formatCents(s.amountCents)} registrato (${s.fromMemberName} → ${s.toMemberName}).`
                              );
                            }}
                          >
                            Registra Rimborso
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Form Nuova Spesa di Gruppo */}
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!activeTricountGroup || !tricountTitle.trim()) {
                  return;
                }
                const amountCents = parseMajorToCents(tricountAmountMajor);
                const rate = Number.parseFloat(tricountRateToGroup) || 1.0;

                const participants = activeTricountGroup.members.map((m) => {
                  const rawVal = tricountMemberShares[m.id];
                  const parsed = Number.parseFloat(rawVal ?? '');
                  return {
                    memberId: m.id,
                    shareValue:
                      tricountSplitMode === 'exact'
                        ? parseMajorToCents(rawVal || '0')
                        : Number.isNaN(parsed)
                          ? 1
                          : parsed,
                  };
                });

                repo.createTricountExpense({
                  groupId: activeTricountGroup.group.id,
                  paidByMemberId:
                    tricountPaidById || activeTricountGroup.members[0].id,
                  title: tricountTitle.trim(),
                  amountCents,
                  currency: tricountCurrency,
                  exchangeRateToGroup: rate,
                  date: referenceDate,
                  splitMode: tricountSplitMode,
                  participants,
                  personalAccountId: tricountLinkAccount || null,
                  personalCategoryId: tricountLinkCategory || null,
                });

                setTricountTitle('');
                await onRefresh();
                onNotify(
                  'Spesa Tricount salvata e quota personale sincronizzata col DailyBudget.'
                );
              }}
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem',
              }}
            >
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                Aggiungi Spesa di Gruppo (Multi-Valuta &amp; Collegamento DailyBudget)
              </h3>

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="tricount-title">Titolo Spesa</label>
                  <input
                    id="tricount-title"
                    className="input"
                    placeholder="es. Cena Baita / Benzina Autostrada"
                    value={tricountTitle}
                    onChange={(e) => setTricountTitle(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="tricount-paid-by">Pagato Da</label>
                  <select
                    id="tricount-paid-by"
                    className="select"
                    value={tricountPaidById || activeTricountGroup.members[0]?.id}
                    onChange={(e) => setTricountPaidById(e.target.value)}
                  >
                    {activeTricountGroup.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name} {m.is_me === 1 ? '(Io)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="tricount-amount">Importo Totale Spesa</label>
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <input
                      id="tricount-amount"
                      className="input mono-num"
                      value={tricountAmountMajor}
                      onChange={(e) => setTricountAmountMajor(e.target.value)}
                    />
                    <select
                      aria-label="Valuta Spesa Tricount"
                      className="select"
                      style={{ width: '85px' }}
                      value={tricountCurrency}
                      onChange={(e) => {
                        const curr = e.target.value;
                        setTricountCurrency(curr);
                        if (curr === activeTricountGroup.group.default_currency) {
                          setTricountRateToGroup('1.0');
                        } else if (curr === 'CHF') {
                          setTricountRateToGroup('1.06');
                        } else if (curr === 'USD') {
                          setTricountRateToGroup('0.92');
                        }
                      }}
                    >
                      <option value="EUR">EUR</option>
                      <option value="CHF">CHF</option>
                      <option value="USD">USD</option>
                      <option value="GBP">GBP</option>
                    </select>
                  </div>
                </div>

                <div className="field">
                  <label htmlFor="tricount-split-mode">Modalità Divisione</label>
                  <select
                    id="tricount-split-mode"
                    className="select"
                    value={tricountSplitMode}
                    onChange={(e) => setTricountSplitMode(e.target.value as SplitMode)}
                  >
                    <option value="equal">Parti Uguali (equal)</option>
                    <option value="shares">Quote / Pesi (shares)</option>
                    <option value="percentage">Percentuale % (percentage)</option>
                    <option value="exact">Importo Esatto € (exact)</option>
                  </select>
                </div>
              </div>

              {tricountSplitMode !== 'equal' && (
                <div className="grid-2" style={{ gap: '0.5rem' }}>
                  {activeTricountGroup.members.map((m) => (
                    <div key={m.id} className="field">
                      <label>
                        {m.name} ({tricountSplitMode})
                      </label>
                      <input
                        className="input mono-num"
                        placeholder={
                          tricountSplitMode === 'percentage'
                            ? '25'
                            : tricountSplitMode === 'shares'
                              ? '1'
                              : '20.00'
                        }
                        value={tricountMemberShares[m.id] ?? ''}
                        onChange={(e) =>
                          setTricountMemberShares((prev) => ({
                            ...prev,
                            [m.id]: e.target.value,
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>
              )}

              <div className="form-grid">
                <div className="field">
                  <label htmlFor="tricount-link-acc">
                    Collega al mio Conto (Regola B: Cashflow vs Quota Mia)
                  </label>
                  <select
                    id="tricount-link-acc"
                    className="select"
                    value={tricountLinkAccount}
                    onChange={(e) => setTricountLinkAccount(e.target.value)}
                  >
                    <option value="">-- Non collegare conto --</option>
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="tricount-link-cat">Categoria per la mia Quota</label>
                  <select
                    id="tricount-link-cat"
                    className="select"
                    value={tricountLinkCategory}
                    onChange={(e) => setTricountLinkCategory(e.target.value)}
                  >
                    {categories
                      .filter((c) => c.type === 'expense')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <button type="submit" className="btn btn-primary">
                <Plus size={15} /> Registra Spesa Tricount
              </button>
            </form>
          </div>
        )}
      </div>

      {/* Storico Spese del Gruppo */}
      {activeTricountGroup && (
        <section className="card">
          <div className="card-header">
            <h3 className="card-title">
              Storico Spese &amp; Rimborsi — {activeTricountGroup.group.name}
            </h3>
          </div>
          <div className="tx-list">
            {activeTricountGroup.expenses.map((exp) => (
              <div key={exp.id} className="tx-row">
                <div className="tx-main">
                  <div className="tx-title">
                    <span>{exp.title}</span>
                    <span className="chip">{exp.expense_type}</span>
                  </div>
                  <div className="tx-meta">
                    <span>{exp.date}</span>
                    <span>•</span>
                    <span>
                      Pagato da <strong>{exp.paid_by_name}</strong>
                    </span>
                    {exp.splits.map((s) => (
                      <span key={s.id} className="chip">
                        {s.member_name}: {formatCents(s.owed_group_amount)}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="mono-num" style={{ fontWeight: 700 }}>
                  {formatCents(
                    exp.group_amount,
                    activeTricountGroup.group.default_currency
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
