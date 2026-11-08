import React, { useEffect, useMemo, useState } from 'react';
import {
  doesTransactionAffectBudget,
  formatCents,
  parseMajorToCents,
  validateTransactionSplits,
  type RecurringFrequency,
  type TransactionType,
} from '@dailybudget/core';
import {
  triggerBrowserDownload,
  type AccountRow,
  type AccountType,
  type AttachmentRow,
  type CategoryRow,
  type DailyBudgetRepository,
  type EnrichedRecurringRule,
  type EnrichedTransaction,
  type TagRow,
} from '@dailybudget/db';
import {
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Paperclip,
  Plus,
  RefreshCw,
  Split,
  Tag,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import { compressReceiptImageIfPossible } from '../utils/receipt-compression';
import { InfoTip } from './InfoTip';

interface TransactionsTabProps {
  repo: DailyBudgetRepository;
  accounts: AccountRow[];
  categories: CategoryRow[];
  tags: TagRow[];
  transactions: EnrichedTransaction[];
  recurringRules: EnrichedRecurringRule[];
  referenceDate: string;
  onRefresh: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function TransactionsTab({
  repo,
  accounts,
  categories,
  tags,
  transactions,
  recurringRules,
  referenceDate,
  onRefresh,
  onNotify,
}: TransactionsTabProps) {
  // Filters
  const [txAccountFilter, setTxAccountFilter] = useState<string>('all');
  const [txTagFilter, setTxTagFilter] = useState<string>('all');

  // Quick-Add Transaction Form State
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [txAccountId, setTxAccountId] = useState<string>(
    () => accounts[0]?.id ?? ''
  );
  const [txToAccountId, setTxToAccountId] = useState<string>('');
  const [txAmountMajor, setTxAmountMajor] = useState<string>('24.50');
  const [txCurrency, setTxCurrency] = useState<string>('EUR');
  const [txCustomCompetence, setTxCustomCompetence] = useState<boolean>(false);
  const [txBudgetCompetenceMajor, setTxBudgetCompetenceMajor] =
    useState<string>('24.50');
  const [txBudgetOverride, setTxBudgetOverride] = useState<'null' | '1' | '0'>(
    'null'
  );
  const [txIsFixed, setTxIsFixed] = useState<boolean>(false);
  const [txDate, setTxDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [txDescription, setTxDescription] = useState<string>('');
  const [txSelectedTagIds, setTxSelectedTagIds] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [txSplits, setTxSplits] = useState<
    Array<{ categoryId: string; amountMajor: string; notes: string }>
  >(() => {
    const expCat = categories.find((c) => c.type === 'expense');
    return expCat
      ? [{ categoryId: expCat.id, amountMajor: '24.50', notes: '' }]
      : [];
  });

  // New Account Form State
  const [newAccName, setNewAccName] = useState<string>('');
  const [newAccType, setNewAccType] = useState<AccountType>('checking');
  const [newAccInitialMajor, setNewAccInitialMajor] =
    useState<string>('1000.00');
  const [newAccIncludeBudget, setNewAccIncludeBudget] = useState<boolean>(true);

  // New Recurring Rule Form State
  const [newRecDesc, setNewRecDesc] = useState<string>('');
  const [newRecAmountMajor, setNewRecAmountMajor] = useState<string>('29.90');
  const [newRecFreq, setNewRecFreq] = useState<RecurringFrequency>('monthly');
  const [newRecNextDate, setNewRecNextDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [newRecAccountId, setNewRecAccountId] = useState<string>(
    () => accounts[0]?.id ?? ''
  );
  const [newRecCategoryId, setNewRecCategoryId] = useState<string>(
    () => categories.find((c) => c.type === 'expense')?.id ?? ''
  );

  // Bank CSV Import/Export & Receipt Attachments State
  const [csvImportContent, setCsvImportContent] = useState<string>(
    'Data;Descrizione;Importo;Valuta\n05/11/2026;Spesa Carrefour Market;-42,80;EUR\n06/11/2026;Rimborso Biglietto Concerto;+35,00;EUR'
  );
  const [attachmentTxId, setAttachmentTxId] = useState<string>(
    () => transactions[0]?.id ?? ''
  );
  const [recentAttachments, setRecentAttachments] = useState<AttachmentRow[]>(
    () =>
      transactions[0]?.id
        ? repo.getAttachmentsForTransaction(transactions[0].id)
        : []
  );

  useEffect(() => {
    if (accounts.length > 0 && !txAccountId) {
      setTxAccountId(accounts[0].id);
      setNewRecAccountId(accounts[0].id);
    }
  }, [accounts, txAccountId]);

  useEffect(() => {
    const expCat = categories.find((c) => c.type === 'expense');
    if (expCat && txSplits.length === 0) {
      setTxSplits([{ categoryId: expCat.id, amountMajor: '24.50', notes: '' }]);
      setNewRecCategoryId(expCat.id);
    }
  }, [categories, txSplits.length]);

  useEffect(() => {
    const targetId = attachmentTxId || transactions[0]?.id;
    if (targetId) {
      if (!attachmentTxId) {
        setAttachmentTxId(targetId);
      }
      setRecentAttachments(repo.getAttachmentsForTransaction(targetId));
    }
  }, [transactions, attachmentTxId, repo]);

  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === txAccountId) ?? null,
    [accounts, txAccountId]
  );

  const previewAffectsBudget = useMemo(() => {
    const overrideVal: 0 | 1 | null =
      txBudgetOverride === 'null' ? null : txBudgetOverride === '1' ? 1 : 0;
    return doesTransactionAffectBudget({
      txIncludeInBudget: overrideVal,
      accountIncludeInBudget: selectedAccount
        ? selectedAccount.include_in_budget === 1
        : true,
      txType,
    });
  }, [txBudgetOverride, selectedAccount, txType]);

  const effectiveBudgetBaseCents = useMemo(() => {
    const rate = repo.getRateToBase(txCurrency);
    const cashflowBase = Math.round(parseMajorToCents(txAmountMajor) * rate);
    return txCustomCompetence
      ? parseMajorToCents(txBudgetCompetenceMajor)
      : cashflowBase;
  }, [repo, txAmountMajor, txCurrency, txCustomCompetence, txBudgetCompetenceMajor]);

  const splitCheck = useMemo(() => {
    return validateTransactionSplits(
      effectiveBudgetBaseCents,
      txSplits.map((s) => ({
        categoryId: s.categoryId,
        amountBaseCents: parseMajorToCents(s.amountMajor),
      }))
    );
  }, [effectiveBudgetBaseCents, txSplits]);

  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!txAccountId) return;

    const amountCents = parseMajorToCents(txAmountMajor);
    if (amountCents <= 0) return;

    const rate = repo.getRateToBase(txCurrency);
    const baseAmountCents = Math.round(amountCents * rate);
    const budgetBaseAmountCents = txCustomCompetence
      ? parseMajorToCents(txBudgetCompetenceMajor)
      : baseAmountCents;

    const includeInBudget: 0 | 1 | null =
      txBudgetOverride === 'null' ? null : txBudgetOverride === '1' ? 1 : 0;

    repo.createTransaction({
      accountId: txAccountId,
      toAccountId: txType === 'transfer' ? txToAccountId || null : null,
      type: txType,
      amountCents,
      currency: txCurrency,
      exchangeRateToBase: rate,
      baseAmountCents,
      budgetBaseAmountCents,
      includeInBudget,
      isFixed: txIsFixed,
      date: txDate,
      description: txDescription.trim() || `Movimento ${txType}`,
      splits:
        txType === 'expense' || txType === 'income'
          ? txSplits.map((s) => ({
              categoryId: s.categoryId,
              amountBaseCents: parseMajorToCents(s.amountMajor),
              notes: s.notes.trim() || undefined,
            }))
          : undefined,
      tagIds: txSelectedTagIds,
    });

    setTxDescription('');
    await onRefresh();
    onNotify('Transazione registrata con successo.');
  };

  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (
        txAccountFilter !== 'all' &&
        t.account_id !== txAccountFilter &&
        t.to_account_id !== txAccountFilter
      ) {
        return false;
      }
      if (txTagFilter !== 'all' && !t.tags.some((tg) => tg.id === txTagFilter)) {
        return false;
      }
      return true;
    });
  }, [transactions, txAccountFilter, txTagFilter]);

  return (
    <>
      {/* Conti Bancari */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <Wallet size={17} />
              Conti del Workspace
              <InfoTip
                title="Regola del Conto"
                text="Ogni conto ha un'impostazione predefinita di inclusione o esclusione dal budget, sovrascrivibile su qualsiasi singola transazione."
              />
            </h2>
          </div>
        </div>

        <div className="grid-3" style={{ marginBottom: '1.25rem' }}>
          {accounts.map((acc) => (
            <div
              key={acc.id}
              style={{
                padding: '1rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.55rem',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '0.92rem' }}>{acc.name}</strong>
                <span className="chip">{acc.type}</span>
              </div>
              <div className="mono-num" style={{ fontSize: '1.35rem', fontWeight: 700 }}>
                {formatCents(acc.cached_balance, acc.currency)}
              </div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginTop: '0.25rem',
                }}
              >
                <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Default Budget:{' '}
                  <strong>
                    {acc.include_in_budget === 1 ? 'Nel Budget' : 'Fuori Budget'}
                  </strong>
                </span>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={async () => {
                    repo.toggleAccountIncludeInBudget(
                      acc.id,
                      acc.include_in_budget !== 1
                    );
                    await onRefresh();
                  }}
                >
                  Inverti Default
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Creazione Rapida Conto */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newAccName.trim()) return;
            repo.createAccount({
              name: newAccName.trim(),
              type: newAccType,
              initialBalanceCents: parseMajorToCents(newAccInitialMajor),
              includeInBudget: newAccIncludeBudget,
            });
            setNewAccName('');
            await onRefresh();
          }}
          style={{
            display: 'flex',
            gap: '0.65rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            paddingTop: '0.85rem',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div className="field" style={{ flex: '1 1 200px' }}>
            <label htmlFor="new-acc-name">Nuovo Conto</label>
            <input
              id="new-acc-name"
              className="input"
              placeholder="es. Conto Deposito TradeRepublic"
              value={newAccName}
              onChange={(e) => setNewAccName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="new-acc-type">Tipo</label>
            <select
              id="new-acc-type"
              className="select"
              value={newAccType}
              onChange={(e) => setNewAccType(e.target.value as AccountType)}
            >
              <option value="checking">Conto Corrente (checking)</option>
              <option value="savings">Risparmio (savings)</option>
              <option value="credit_card">Carta (credit_card)</option>
              <option value="cash">Contanti (cash)</option>
            </select>
          </div>
          <div className="field" style={{ width: '130px' }}>
            <label htmlFor="new-acc-balance">Saldo Iniziale (€)</label>
            <input
              id="new-acc-balance"
              className="input mono-num"
              value={newAccInitialMajor}
              onChange={(e) => setNewAccInitialMajor(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="new-acc-budget">Default in Budget</label>
            <select
              id="new-acc-budget"
              className="select"
              value={newAccIncludeBudget ? '1' : '0'}
              onChange={(e) => setNewAccIncludeBudget(e.target.value === '1')}
            >
              <option value="1">Nel Budget</option>
              <option value="0">Fuori Budget</option>
            </select>
          </div>
          <button type="submit" className="btn btn-primary">
            <Plus size={15} /> Aggiungi Conto
          </button>
        </form>
      </section>

      {/* Regole Ricorrenti & Auto-Commit Scheduler */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <RefreshCw size={17} />
              Regole Ricorrenti &amp; Abbonamenti
              <InfoTip
                title="Spese Periodiche"
                text={`Generazione automatica spese fisse scadute rispetto alla data odierna (${referenceDate}).`}
              />
            </h2>
          </div>

          <button
            id="btn-process-recurring"
            type="button"
            className="btn btn-primary"
            onClick={async () => {
              const res = repo.processDueRecurringRules(referenceDate);
              await onRefresh();
              onNotify(
                res.committedCount > 0
                  ? `Auto-Commit completato: generate ${res.committedCount} transazioni ricorrenti scadute fino al ${referenceDate}.`
                  : `Nessuna regola ricorrente attiva con auto_commit=1 scaduta entro il ${referenceDate}.`
              );
            }}
          >
            <CheckCircle2 size={15} /> Esegui Ricorrenze Scadute
          </button>
        </div>

        <div className="grid-3" style={{ marginBottom: '1rem' }}>
          {recurringRules.map((rule) => {
            const isDue = rule.next_occurrence_date <= referenceDate;
            return (
              <div
                key={rule.id}
                style={{
                  padding: '0.9rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: isDue
                    ? '1px solid var(--status-warning)'
                    : '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '0.4rem',
                  }}
                >
                  <strong style={{ fontSize: '0.88rem' }}>
                    {rule.description || 'Ricorrenza'}
                  </strong>
                  <span className="chip">{rule.frequency}</span>
                </div>

                <div className="mono-num" style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                  {formatCents(rule.amount, rule.currency)}
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                  Conto: <strong>{rule.account_name}</strong> • Cat:{' '}
                  <strong>{rule.category_name}</strong>
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginTop: '0.2rem',
                    flexWrap: 'wrap',
                    gap: '0.4rem',
                  }}
                >
                  <span
                    className={`chip mono-num ${
                      isDue ? 'override-exclude' : 'override-include'
                    }`}
                  >
                    Prossima: {rule.next_occurrence_date}{' '}
                    {isDue ? '(SCADUTA / PRONTA)' : ''}
                  </span>

                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={async () => {
                      repo.toggleRecurringRule(rule.id, {
                        autoCommit: rule.auto_commit !== 1,
                      });
                      await onRefresh();
                    }}
                  >
                    auto_commit: {rule.auto_commit === 1 ? 'ON (1)' : 'OFF (0)'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!newRecDesc.trim()) return;
            const accId = newRecAccountId || accounts[0]?.id;
            const catId =
              newRecCategoryId ||
              categories.find((c) => c.type === 'expense')?.id ||
              categories[0]?.id;
            if (!accId || !catId) return;

            repo.createRecurringRule({
              accountId: accId,
              categoryId: catId,
              amountCents: parseMajorToCents(newRecAmountMajor),
              description: newRecDesc.trim(),
              frequency: newRecFreq,
              nextOccurrenceDate: newRecNextDate || referenceDate,
              autoCommit: true,
            });
            setNewRecDesc('');
            await onRefresh();
            onNotify('Nuova regola ricorrente salvata in recurring_rules.');
          }}
          style={{
            display: 'flex',
            gap: '0.6rem',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            paddingTop: '0.85rem',
            borderTop: '1px solid var(--border-subtle)',
          }}
        >
          <div className="field" style={{ flex: '1 1 180px' }}>
            <label htmlFor="rec-desc">Nuova Ricorrenza</label>
            <input
              id="rec-desc"
              className="input"
              placeholder="es. Abbonamento Palestra / Affitto"
              value={newRecDesc}
              onChange={(e) => setNewRecDesc(e.target.value)}
            />
          </div>
          <div className="field" style={{ width: '110px' }}>
            <label htmlFor="rec-amount">Importo (€)</label>
            <input
              id="rec-amount"
              className="input mono-num"
              value={newRecAmountMajor}
              onChange={(e) => setNewRecAmountMajor(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rec-freq">Frequenza</label>
            <select
              id="rec-freq"
              className="select"
              value={newRecFreq}
              onChange={(e) => setNewRecFreq(e.target.value as RecurringFrequency)}
            >
              <option value="monthly">Mensile (monthly)</option>
              <option value="weekly">Settimanale (weekly)</option>
              <option value="yearly">Annuale (yearly)</option>
              <option value="daily">Giornaliera (daily)</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="rec-next-date">Prossima Data</label>
            <input
              id="rec-next-date"
              type="date"
              className="input mono-num"
              value={newRecNextDate}
              onChange={(e) => setNewRecNextDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="rec-acc">Conto</label>
            <select
              id="rec-acc"
              className="select"
              value={newRecAccountId || accounts[0]?.id || ''}
              onChange={(e) => setNewRecAccountId(e.target.value)}
            >
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="rec-cat">Categoria</label>
            <select
              id="rec-cat"
              className="select"
              value={
                newRecCategoryId ||
                categories.find((c) => c.type === 'expense')?.id ||
                ''
              }
              onChange={(e) => setNewRecCategoryId(e.target.value)}
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
          <button type="submit" className="btn btn-primary">
            <Plus size={15} /> Aggiungi Ricorrenza
          </button>
        </form>
      </section>

      {/* Quick-Add Transazione Completa + Lista */}
      <div className="panel-pair desktop-split-view">
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Plus size={17} />
                Registra Movimento
                <InfoTip
                  title="Nuovo Movimento"
                  text="Registra spese, entrate o giroconti. Supporta la suddivisione tra più categorie e la distinzione tra cassa effettiva e quota budget."
                />
              </h2>
            </div>
          </div>

          <form onSubmit={handleCreateTransaction} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="tx-type">Tipo Movimento</label>
                <select
                  id="tx-type"
                  className="select"
                  value={txType}
                  onChange={(e) => setTxType(e.target.value as TransactionType)}
                >
                  <option value="expense">Spesa</option>
                  <option value="income">Entrata</option>
                  <option value="transfer">Giroconto</option>
                  <option value="loan_movement">Prestito / Rata</option>
                  <option value="tricount_settlement">Pareggio Gruppo</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="tx-account">Conto Origine</label>
                <select
                  id="tx-account"
                  className="select"
                  value={txAccountId}
                  onChange={(e) => setTxAccountId(e.target.value)}
                >
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.include_in_budget === 1 ? 'Nel Budget' : 'Fuori Budget'})
                    </option>
                  ))}
                </select>
              </div>

              {txType === 'transfer' && (
                <div className="field">
                  <label htmlFor="tx-to-account">Conto Destinazione</label>
                  <select
                    id="tx-to-account"
                    className="select"
                    value={txToAccountId}
                    onChange={(e) => setTxToAccountId(e.target.value)}
                  >
                    <option value="">-- Seleziona Conto --</option>
                    {accounts
                      .filter((a) => a.id !== txAccountId)
                      .map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}

              <div className="field">
                <label htmlFor="tx-amount">Importo Cashflow (Reale Conto)</label>
                <div style={{ display: 'flex', gap: '0.4rem' }}>
                  <input
                    id="tx-amount"
                    className="input mono-num"
                    value={txAmountMajor}
                    onChange={(e) => {
                      setTxAmountMajor(e.target.value);
                      if (!txCustomCompetence) {
                        setTxBudgetCompetenceMajor(e.target.value);
                        if (txSplits.length === 1) {
                          setTxSplits([
                            { ...txSplits[0], amountMajor: e.target.value },
                          ]);
                        }
                      }
                    }}
                  />
                  <select
                    aria-label="Valuta Transazione"
                    className="select"
                    style={{ width: '90px' }}
                    value={txCurrency}
                    onChange={(e) => setTxCurrency(e.target.value)}
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                    <option value="CHF">CHF</option>
                  </select>
                </div>
              </div>

              <div className="field">
                <label htmlFor="tx-date">Data</label>
                <input
                  id="tx-date"
                  type="date"
                  className="input mono-num"
                  value={txDate}
                  onChange={(e) => setTxDate(e.target.value)}
                />
              </div>
            </div>

            <div className="field">
              <label htmlFor="tx-desc">Descrizione</label>
              <input
                id="tx-desc"
                className="input"
                placeholder="es. Spesa Esselunga / Cena condivisa / Biglietto Treno"
                value={txDescription}
                onChange={(e) => setTxDescription(e.target.value)}
              />
            </div>

            {/* Regola B & C: Separazione Competenza + Override Budget */}
            <div
              style={{
                padding: '0.85rem',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--bg-elevated)',
                border: '1px solid var(--border-subtle)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.65rem',
              }}
            >
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="tx-override-budget">
                    Inclusione nel Budget
                  </label>
                  <select
                    id="tx-override-budget"
                    className="select"
                    value={txBudgetOverride}
                    onChange={(e) =>
                      setTxBudgetOverride(e.target.value as 'null' | '1' | '0')
                    }
                  >
                    <option value="null">
                      Predefinita dal Conto (
                      {selectedAccount?.include_in_budget === 1
                        ? 'Nel Budget'
                        : 'Fuori Budget'}
                      )
                    </option>
                    <option value="1">Forza Nel Budget</option>
                    <option value="0">Forza Fuori Budget</option>
                  </select>
                </div>

                <div className="field">
                  <label htmlFor="tx-fixed-mode">Pool di Spesa</label>
                  <select
                    id="tx-fixed-mode"
                    className="select"
                    value={txIsFixed ? '1' : '0'}
                    onChange={(e) => setTxIsFixed(e.target.value === '1')}
                  >
                    <option value="0">Spesa Variabile (impatta quota giornaliera)</option>
                    <option value="1">Spesa Fissa (Affitto, Bollette, Ricorrenze)</option>
                  </select>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <label
                  style={{
                    fontSize: '0.78rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={txCustomCompetence}
                    onChange={(e) => setTxCustomCompetence(e.target.checked)}
                  />
                  Competenza Budget diversa dal Cashflow (es. pago per altri)
                </label>

                <span
                  className={`chip ${
                    previewAffectsBudget ? 'override-include' : 'override-exclude'
                  }`}
                >
                  Esito: {previewAffectsBudget ? 'Nel Budget' : 'Fuori Budget'}
                </span>
              </div>

              {txCustomCompetence && (
                <div className="field">
                  <label htmlFor="tx-competence-amount">
                    Importo di Competenza Budget (€)
                  </label>
                  <input
                    id="tx-competence-amount"
                    className="input mono-num"
                    value={txBudgetCompetenceMajor}
                    onChange={(e) => setTxBudgetCompetenceMajor(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Multi-Category Splits (Regola D) */}
            {(txType === 'expense' || txType === 'income') && (
              <div
                style={{
                  padding: '0.85rem',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.6rem',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                    <Split size={14} style={{ verticalAlign: 'middle' }} /> Split
                    Multi-Categoria (Somma = {formatCents(effectiveBudgetBaseCents)})
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => {
                      const fallbackCat = categories[0]?.id ?? '';
                      const remCents = Math.max(0, splitCheck.differenceCents);
                      setTxSplits([
                        ...txSplits,
                        {
                          categoryId: fallbackCat,
                          amountMajor: (remCents / 100).toFixed(2),
                          notes: '',
                        },
                      ]);
                    }}
                  >
                    <Plus size={13} /> Aggiungi Riga Split
                  </button>
                </div>

                {txSplits.map((sp, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.3fr 0.9fr 1fr auto',
                      gap: '0.45rem',
                      alignItems: 'center',
                    }}
                  >
                    <select
                      aria-label={`Categoria Split ${idx + 1}`}
                      className="select"
                      value={sp.categoryId}
                      onChange={(e) => {
                        const copy = [...txSplits];
                        copy[idx] = { ...copy[idx], categoryId: e.target.value };
                        setTxSplits(copy);
                      }}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.type})
                        </option>
                      ))}
                    </select>

                    <input
                      aria-label={`Importo Split ${idx + 1}`}
                      className="input mono-num"
                      placeholder="0.00"
                      value={sp.amountMajor}
                      onChange={(e) => {
                        const copy = [...txSplits];
                        copy[idx] = { ...copy[idx], amountMajor: e.target.value };
                        setTxSplits(copy);
                      }}
                    />

                    <input
                      aria-label={`Nota Split ${idx + 1}`}
                      className="input"
                      placeholder="Nota sottovoce..."
                      value={sp.notes}
                      onChange={(e) => {
                        const copy = [...txSplits];
                        copy[idx] = { ...copy[idx], notes: e.target.value };
                        setTxSplits(copy);
                      }}
                    />

                    {txSplits.length > 1 && (
                      <button
                        type="button"
                        className="btn btn-sm btn-danger"
                        onClick={() =>
                          setTxSplits(txSplits.filter((_, i) => i !== idx))
                        }
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                ))}

                {!splitCheck.valid && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--status-warning)' }}>
                    Differenza da allocare:{' '}
                    <strong className="mono-num">
                      {formatCents(splitCheck.differenceCents)}
                    </strong>
                  </div>
                )}
              </div>
            )}

            {/* Multi-Tag M:N */}
            <div className="field">
              <label>Tag Trasversali M:N (#viaggio, #lavoro, #rimborsabile)</label>
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {tags.map((tg) => {
                  const active = txSelectedTagIds.includes(tg.id);
                  return (
                    <button
                      key={tg.id}
                      type="button"
                      className={`btn btn-sm ${active ? 'btn-primary' : ''}`}
                      onClick={() =>
                        setTxSelectedTagIds((prev) =>
                          prev.includes(tg.id)
                            ? prev.filter((id) => id !== tg.id)
                            : [...prev, tg.id]
                        )
                      }
                    >
                      #{tg.name}
                    </button>
                  );
                })}

                <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                  <input
                    className="input"
                    style={{ width: '130px', padding: '0.25rem 0.5rem', fontSize: '0.78rem' }}
                    placeholder="+ nuovo #tag"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={async () => {
                      if (!newTagInput.trim()) return;
                      const created = repo.createTag({
                        name: newTagInput.trim(),
                      });
                      setNewTagInput('');
                      setTxSelectedTagIds((prev) => [...prev, created.id]);
                      await onRefresh();
                    }}
                  >
                    Crea Tag
                  </button>
                </div>
              </div>
            </div>

            <button type="submit" className="btn btn-primary">
              <CheckCircle2 size={16} /> Registra Transazione su .dbbudget
            </button>
          </form>
        </section>

        {/* Lista Transazioni con Filtri */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                Registro Movimenti ({filteredTransactions.length})
                <InfoTip
                  title="Registro Movimenti"
                  text="Elenco completo dei movimenti con filtri rapidi per conto o tag."
                />
              </h2>
            </div>

            <div style={{ display: 'flex', gap: '0.4rem' }}>
              <select
                aria-label="Filtra per Conto"
                className="select"
                style={{ width: 'auto', fontSize: '0.78rem', padding: '0.3rem 0.5rem' }}
                value={txAccountFilter}
                onChange={(e) => setTxAccountFilter(e.target.value)}
              >
                <option value="all">Tutti i conti</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>

              <select
                aria-label="Filtra per Tag"
                className="select"
                style={{ width: 'auto', fontSize: '0.78rem', padding: '0.3rem 0.5rem' }}
                value={txTagFilter}
                onChange={(e) => setTxTagFilter(e.target.value)}
              >
                <option value="all">Tutti i #tag</option>
                {tags.map((t) => (
                  <option key={t.id} value={t.id}>
                    #{t.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="tx-list">
            {filteredTransactions.map((tx) => (
              <div key={tx.id} className="tx-row">
                <div className="tx-main">
                  <div className="tx-title">
                    <span>{tx.description || (tx.type === 'expense' ? 'Spesa' : tx.type === 'income' ? 'Entrata' : tx.type === 'transfer' ? 'Giroconto' : 'Movimento')}</span>
                    <span className="chip">
                      {tx.type === 'expense' ? 'Spesa' : tx.type === 'income' ? 'Entrata' : tx.type === 'transfer' ? 'Giroconto' : tx.type === 'loan_movement' ? 'Prestito' : 'Pareggio Gruppo'}
                    </span>
                    {tx.is_fixed === 1 && <span className="chip">FISSA</span>}
                    {tx.include_in_budget === 1 && (
                      <span className="chip override-include">Forzato: Nel Budget</span>
                    )}
                    {tx.include_in_budget === 0 && (
                      <span className="chip override-exclude">Forzato: Fuori Budget</span>
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
                        <Tag size={10} /> #{tg.name}
                      </span>
                    ))}
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div className="mono-num" style={{ fontWeight: 700 }}>
                      Cassa: {formatCents(tx.base_amount)}
                    </div>
                    <div
                      className="mono-num"
                      style={{
                        fontSize: '0.85rem',
                        color: tx.effective_affects_budget
                          ? 'var(--accent-primary)'
                          : 'var(--text-muted)',
                      }}
                    >
                      Budget:{' '}
                      {tx.effective_affects_budget
                        ? formatCents(tx.budget_base_amount)
                        : '0,00 € (Fuori Budget)'}
                    </div>
                  </div>

                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    title="Elimina transazione"
                    onClick={async () => {
                      repo.deleteTransaction(tx.id);
                      await onRefresh();
                    }}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Import / Export CSV Bancario & Allegati Scontrini (attachments) */}
      <section className="card">
        <div className="card-header">
          <div>
            <h2 className="card-title">
              <FileSpreadsheet size={17} />
              Archivio Movimenti &amp; Ricevute
              <InfoTip
                title="Archivio e Allegati"
                text="Esporta o importa movimenti in formato CSV con deduplica automatica. Allega immagini e scontrini compressi."
              />
            </h2>
          </div>

          <button
            id="btn-export-csv"
            type="button"
            className="btn"
            onClick={() => {
              const csv = repo.exportTransactionsToCsv();
              const bytes = new TextEncoder().encode(csv);
              triggerBrowserDownload(bytes, 'dailybudget_transactions.csv');
              onNotify(
                `Esportazione CSV completata (${transactions.length} transazioni in dailybudget_transactions.csv).`
              );
            }}
          >
            <Download size={15} /> Esporta CSV Transazioni
          </button>
        </div>

        <div className="panel-pair desktop-split-view">
          {/* Pannello Importazione Estratto Conto CSV */}
          <div
            style={{
              padding: '0.9rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            <strong style={{ fontSize: '0.86rem' }}>
              Importa Estratto Conto CSV (Campi: Data;Descrizione;Importo;Valuta)
            </strong>
            <textarea
              id="textarea-csv-import"
              className="input mono-num"
              rows={4}
              style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}
              value={csvImportContent}
              onChange={(e) => setCsvImportContent(e.target.value)}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Conto target: <strong>{selectedAccount?.name ?? accounts[0]?.name}</strong>
              </span>
              <button
                id="btn-import-csv"
                type="button"
                className="btn btn-primary btn-sm"
                onClick={async () => {
                  const targetAccId = txAccountId || accounts[0]?.id;
                  if (!targetAccId) return;
                  const expCatId =
                    categories.find((c) => c.type === 'expense')?.id ??
                    categories[0]?.id;
                  const res = repo.importTransactionsFromCsv({
                    accountId: targetAccId,
                    csvContent: csvImportContent,
                    mapping: {
                      dateColumnIndex: 0,
                      descriptionColumnIndex: 1,
                      amountColumnIndex: 2,
                      currencyColumnIndex: 3,
                      delimiter: ';',
                      hasHeaderRow: true,
                    },
                    defaultCategoryId: expCatId,
                  });
                  await onRefresh();
                  onNotify(
                    `Import CSV completato: ${res.importedCount} nuove transazioni importate, ${res.skippedDuplicatesCount} duplicati ignorati.`
                  );
                }}
              >
                <Upload size={14} /> Importa CSV con Deduplica
              </button>
            </div>
          </div>

          {/* Pannello Scontrini e Ricevute Ibridi */}
          <div
            style={{
              padding: '0.9rem',
              borderRadius: 'var(--radius-md)',
              backgroundColor: 'var(--bg-elevated)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.65rem',
            }}
          >
            <strong style={{ fontSize: '0.92rem' }}>
              <Paperclip size={14} style={{ verticalAlign: 'middle' }} /> Allega Scontrino o Ricevuta
            </strong>

            <div className="field">
              <label htmlFor="select-attachment-tx">Transazione Collegata</label>
              <select
                id="select-attachment-tx"
                className="select"
                value={attachmentTxId || transactions[0]?.id || ''}
                onChange={(e) => {
                  const nextTxId = e.target.value;
                  setAttachmentTxId(nextTxId);
                  if (nextTxId) {
                    setRecentAttachments(
                      repo.getAttachmentsForTransaction(nextTxId)
                    );
                  }
                }}
              >
                {transactions.slice(0, 15).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.date} — {t.description || (t.type === 'expense' ? 'Spesa' : t.type === 'income' ? 'Entrata' : t.type === 'transfer' ? 'Giroconto' : 'Movimento')} ({formatCents(t.base_amount)})
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <input
                id="input-upload-receipt"
                type="file"
                accept="image/*,application/pdf"
                style={{ fontSize: '0.76rem' }}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  const targetTxId = attachmentTxId || transactions[0]?.id;
                  if (!file || !targetTxId) return;
                  const processed = await compressReceiptImageIfPossible(file);
                  const att = repo.createAttachment({
                    transactionId: targetTxId,
                    fileName: processed.fileName,
                    mimeType: processed.mimeType,
                    dataBytes: processed.bytes,
                  });
                  setRecentAttachments(
                    repo.getAttachmentsForTransaction(targetTxId)
                  );
                  await onRefresh();
                  onNotify(
                    `Allegato "${att.file_name}" (${(processed.bytes.byteLength / 1024).toFixed(1)} KB) salvato con storage_type = "${att.storage_type}".`
                  );
                }}
              />
            </div>

            {recentAttachments.length > 0 && (
              <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                {recentAttachments.map((att) => (
                  <span key={att.id} className="chip override-include">
                    <Paperclip size={11} /> {att.file_name} [{att.storage_type}]
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
