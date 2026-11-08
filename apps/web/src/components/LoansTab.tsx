import React, { useState } from 'react';
import { formatCents, parseMajorToCents } from '@dailybudget/core';
import type {
  AccountRow,
  DailyBudgetRepository,
  LoanRow,
} from '@dailybudget/db';
import { HandCoins, Plus } from 'lucide-react';
import { InfoTip } from './InfoTip';

interface LoansTabProps {
  repo: DailyBudgetRepository;
  loans: LoanRow[];
  accounts: AccountRow[];
  referenceDate: string;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function LoansTab({
  repo,
  loans,
  accounts,
  referenceDate,
  onRefresh,
  onNotify,
}: LoansTabProps) {
  const [newLoanName, setNewLoanName] = useState<string>('');
  const [newLoanCounterparty, setNewLoanCounterparty] = useState<string>('');
  const [newLoanType, setNewLoanType] = useState<'lent' | 'borrowed'>('borrowed');
  const [newLoanPrincipalMajor, setNewLoanPrincipalMajor] =
    useState<string>('1200.00');
  const [newLoanCountBudget, setNewLoanCountBudget] = useState<boolean>(false);
  const [installmentAmounts, setInstallmentAmounts] = useState<
    Record<string, string>
  >({});

  return (
    <div className="panel-pair desktop-split-view">
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <HandCoins size={17} />
              Posizioni Attive (Crediti &amp; Debiti)
              <InfoTip
                title="Crediti e Debiti"
                text="Traccia capitale iniziale, residuo e rate periodiche. I prestiti e debiti rimangono neutri rispetto al budget giornaliero, a meno che tu non scelga di includere le rate."
              />
            </h2>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {loans.map((ln) => {
            const repaid = ln.principal_amount - ln.remaining_amount;
            const pct =
              ln.principal_amount > 0
                ? Math.round((repaid / ln.principal_amount) * 100)
                : 100;
            return (
              <div
                key={ln.id}
                style={{
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.65rem',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong style={{ fontSize: '0.94rem' }}>{ln.name}</strong>
                    <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                      Controparte: <strong>{ln.counterparty_name}</strong> • Stato:{' '}
                      {ln.status}
                    </div>
                  </div>
                  <span
                    className={`chip ${
                      ln.type === 'lent' ? 'override-include' : 'override-exclude'
                    }`}
                  >
                    {ln.type === 'lent'
                      ? 'Credito Concesso'
                      : 'Debito / Finanziamento'}
                  </span>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.86rem' }}>
                  <span>
                    Residuo:{' '}
                    <strong className="mono-num">
                      {formatCents(ln.remaining_amount, ln.currency)}
                    </strong>
                  </span>
                  <span className="mono-num" style={{ color: 'var(--text-muted)' }}>
                    su {formatCents(ln.principal_amount, ln.currency)} ({pct}% saldato)
                  </span>
                </div>

                <div className="progress-track" style={{ height: 8 }}>
                  <div
                    className="progress-fill"
                    style={{
                      width: `${pct}%`,
                      backgroundColor:
                        ln.type === 'lent'
                          ? 'var(--status-safe)'
                          : 'var(--accent-primary)',
                    }}
                  />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span className="chip">
                    {ln.count_installments_in_budget === 1
                      ? 'Rate Nel Budget'
                      : 'Rate Fuori Budget'}
                  </span>

                  {ln.remaining_amount > 0 && (
                    <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                      <input
                        aria-label={`Importo rata per ${ln.name}`}
                        className="input mono-num"
                        style={{ width: '110px', padding: '0.35rem 0.5rem', fontSize: '0.88rem' }}
                        placeholder="100.00"
                        value={installmentAmounts[ln.id] ?? '100.00'}
                        onChange={(e) =>
                          setInstallmentAmounts((prev) => ({
                            ...prev,
                            [ln.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-sm btn-primary"
                        onClick={async () => {
                          if (accounts.length === 0) return;
                          const amt = parseMajorToCents(
                            installmentAmounts[ln.id] ?? '100.00'
                          );
                          if (amt <= 0) return;
                          repo.recordLoanInstallment({
                            loanId: ln.id,
                            accountId: accounts[0].id,
                            amountCents: amt,
                            date: referenceDate,
                          });
                          await onRefresh();
                          onNotify(
                            `Registrato movimento di ${formatCents(amt)} su "${ln.name}".`
                          );
                        }}
                      >
                        Registra Rata / Rimborso
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">
            <Plus size={17} /> Nuovo Prestito o Finanziamento
            <InfoTip
              title="Nuovo Prestito"
              text="Inserisci un credito (soldi prestati ad altri) o un debito/finanziamento con piano di rientro."
            />
          </h2>
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newLoanName.trim() || !newLoanCounterparty.trim()) {
              return;
            }
            repo.createLoan({
              name: newLoanName.trim(),
              counterpartyName: newLoanCounterparty.trim(),
              type: newLoanType,
              principalAmountCents: parseMajorToCents(newLoanPrincipalMajor),
              startDate: referenceDate,
              countInstallmentsInBudget: newLoanCountBudget,
            });
            setNewLoanName('');
            setNewLoanCounterparty('');
            await onRefresh();
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
        >
          <div className="field">
            <label htmlFor="loan-name">Nome Prestito / Finanziamento</label>
            <input
              id="loan-name"
              className="input"
              placeholder="es. Finanziamento Auto / Prestito a Marco"
              value={newLoanName}
              onChange={(e) => setNewLoanName(e.target.value)}
            />
          </div>

          <div className="field">
            <label htmlFor="loan-counterparty">Controparte</label>
            <input
              id="loan-counterparty"
              className="input"
              placeholder="es. Banca / Marco Rossi"
              value={newLoanCounterparty}
              onChange={(e) => setNewLoanCounterparty(e.target.value)}
            />
          </div>

          <div className="form-grid">
            <div className="field">
              <label htmlFor="loan-type">Direzione</label>
              <select
                id="loan-type"
                className="select"
                value={newLoanType}
                onChange={(e) =>
                  setNewLoanType(e.target.value as 'lent' | 'borrowed')
                }
              >
                <option value="borrowed">Debito / Finanziamento</option>
                <option value="lent">Credito / Soldi Prestati</option>
              </select>
            </div>

            <div className="field">
              <label htmlFor="loan-principal">Capitale Iniziale (€)</label>
              <input
                id="loan-principal"
                className="input mono-num"
                value={newLoanPrincipalMajor}
                onChange={(e) => setNewLoanPrincipalMajor(e.target.value)}
              />
            </div>
          </div>

          <label
            style={{
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.45rem',
              cursor: 'pointer',
            }}
          >
            <input
              type="checkbox"
              checked={newLoanCountBudget}
              onChange={(e) => setNewLoanCountBudget(e.target.checked)}
            />
            Includi automaticamente le rate nel calcolo del DailyBudget
          </label>

          <button type="submit" className="btn btn-primary">
            <Plus size={15} /> Crea Posizione
          </button>
        </form>
      </section>
    </div>
  );
}
