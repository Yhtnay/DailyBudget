import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DailyBudgetRepository,
  isValidSqliteBinary,
  seedDemoWorkspace,
  syncMarketRatesAndPrices,
} from './index.ts';

describe('@dailybudget/db SQLite-Wasm Repository & .dbbudget Binary Format', () => {
  it('initializes schema_v2, seeds demo workspace, and exports a valid SQLite3 .dbbudget binary', async () => {
    const repo = await DailyBudgetRepository.createEmpty({
      referenceDate: '2026-11-07',
    });
    seedDemoWorkspace(repo, '2026-11-07');

    const binary = repo.exportBinary();
    assert.equal(isValidSqliteBinary(binary), true);
    assert.ok(binary.byteLength > 4096);

    // Re-open from exported .dbbudget binary and verify full fidelity
    const reopened = await DailyBudgetRepository.fromBinary(binary, {
      referenceDate: '2026-11-07',
    });
    const summary = reopened.getDashboardSummary('2026-11-07');

    assert.equal(summary.settings.base_currency, 'EUR');
    assert.equal(summary.settings.monthly_budget_target, 240_000);
    assert.ok(summary.widgetSnapshot.daily_budget_allowance > 0);
    assert.equal(
      summary.widgetSnapshot.daily_budget_remaining,
      summary.dailyBudgetResult.remainingTodayCents
    );
    assert.ok(summary.cryptoSummary.totalValueCents > 0);
  });

  it('separates bank cashflow (base_amount) from budget competence (budget_base_amount) on Tricount expenses', async () => {
    const repo = await DailyBudgetRepository.createEmpty({
      referenceDate: '2026-11-07',
    });
    seedDemoWorkspace(repo, '2026-11-07');

    const txs = repo.getTransactionsWithDetails();
    const cenaTx = txs.find((t) => t.tricount_expense_id === 'texp_cena_baita');
    assert.ok(cenaTx, 'Linked Tricount transaction should exist');

    // Esempio da HANDOFF_CONTEXT.md:
    // Pago 100€ per 4 persone -> base_amount = 10000 (escono 100€ dal conto), budget_base_amount = 2500 (solo 25€ sul mio DailyBudget)
    assert.equal(cenaTx.base_amount, 10_000);
    assert.equal(cenaTx.budget_base_amount, 2_500);
    assert.equal(cenaTx.effective_affects_budget, true);
  });

  it('processes due recurring rules, creates linked fixed transactions, and advances next_occurrence_date', async () => {
    const repo = await DailyBudgetRepository.createEmpty({
      referenceDate: '2026-11-07',
    });
    seedDemoWorkspace(repo, '2026-11-07');

    const initialRules = repo.getRecurringRules();
    assert.equal(initialRules.length, 2);

    const execResult = repo.processDueRecurringRules('2026-11-07');
    assert.equal(execResult.committedCount, 1);
    assert.equal(execResult.transactions[0].recurring_rule_id, 'rec_cloud_ai');
    assert.equal(execResult.transactions[0].base_amount, 2_200);
    assert.equal(execResult.transactions[0].is_fixed, 1);

    const updatedRules = repo.getRecurringRules();
    const cloudRule = updatedRules.find((r) => r.id === 'rec_cloud_ai')!;
    assert.equal(cloudRule.next_occurrence_date, '2026-12-07');

    // Running again on the same date is idempotent
    const secondRun = repo.processDueRecurringRules('2026-11-07');
    assert.equal(secondRun.committedCount, 0);
  });

  it('supports 3-tier multi-currency Tricount expenses (CHF expense -> USD group -> EUR base workspace)', async () => {
    const repo = await DailyBudgetRepository.createEmpty({
      referenceDate: '2026-11-07',
    });
    seedDemoWorkspace(repo, '2026-11-07');

    // USD_EUR is seeded as 0.92
    repo.createTricountGroup({
      id: 'tgrp_usa_swiss',
      name: 'International Summit',
      defaultCurrency: 'USD',
      members: [
        { id: 'tmbr_me_intl', name: 'Andrea (Io)', isMe: true },
        { id: 'tmbr_friend_intl', name: 'Alex', isMe: false },
      ],
    });

    // 100.00 CHF paid by me at 1.15 USD/CHF -> 115.00 USD group amount (57.50 USD each)
    // Group USD to EUR base @ 0.92 -> Cashflow = round(11500 * 0.92) = 10580 EUR cents, Budget = round(5750 * 0.92) = 5290 EUR cents
    repo.createTricountExpense({
      id: 'texp_chf_usd_eur',
      groupId: 'tgrp_usa_swiss',
      paidByMemberId: 'tmbr_me_intl',
      title: 'Hotel Zurigo',
      amountCents: 10_000,
      currency: 'CHF',
      exchangeRateToGroup: 1.15,
      date: '2026-11-07',
      splitMode: 'equal',
      participants: [{ memberId: 'tmbr_me_intl' }, { memberId: 'tmbr_friend_intl' }],
      personalAccountId: 'acc_revolut',
      personalCategoryId: 'cat_dining',
    });

    const tx = repo
      .getTransactionsWithDetails()
      .find((t) => t.tricount_expense_id === 'texp_chf_usd_eur');
    assert.ok(tx, '3-tier Tricount transaction should be created');
    assert.equal(tx.base_amount, 10_580);
    assert.equal(tx.budget_base_amount, 5_290);
    assert.equal(tx.splits[0].amount_base, 5_290);
  });

  it('syncs market exchange rates and crypto prices with offline-first fallback resilience', async () => {
    const repo = await DailyBudgetRepository.createEmpty({
      referenceDate: '2026-11-07',
    });
    seedDemoWorkspace(repo, '2026-11-07');

    const report = await syncMarketRatesAndPrices(repo, { timeoutMs: 250 });
    assert.ok(report.mode === 'live_api' || report.mode === 'offline_fallback');
    assert.equal(report.updatedRatesCount, 3);
    assert.equal(report.updatedCryptoCount, 3);
    assert.ok(report.details.length > 10);
  });

  it('supports custom budget cycle (month_start_day = 27), refund incomes (include_in_budget = 1), and 1-click savings sweep', async () => {
    const repo = await DailyBudgetRepository.createEmpty({
      referenceDate: '2026-11-05',
    });
    repo.updateWorkspaceSettings({
      monthlyBudgetTargetCents: 200_000, // 2.000€
      monthStartDay: 27,
    });

    const checking = repo.createAccount({
      id: 'acc_chk',
      name: 'Conto Stipendio',
      type: 'checking',
      initialBalanceCents: 300_000,
      includeInBudget: true,
    });
    const savings = repo.createAccount({
      id: 'acc_sav',
      name: 'Conto Deposito',
      type: 'savings',
      initialBalanceCents: 500_000,
      includeInBudget: false,
    });

    // Expense on Oct 28 (inside cycle 2026-10-27 .. 2026-11-26): 100.00€
    repo.createTransaction({
      accountId: checking.id,
      type: 'expense',
      amountCents: 10_000,
      currency: 'EUR',
      date: '2026-10-28',
      description: 'Spesa Ottobre nel ciclo Novembre',
    });

    // Normal salary income (includeInBudget = null) does NOT inflate variable budget pool
    repo.createTransaction({
      accountId: checking.id,
      type: 'income',
      amountCents: 250_000,
      currency: 'EUR',
      date: '2026-10-27',
      description: 'Stipendio Ottobre',
    });

    const beforeRefund = repo.getDashboardSummary('2026-11-05');
    assert.equal(beforeRefund.cycleWindow.cycleStartDate, '2026-10-27');
    assert.equal(beforeRefund.cycleWindow.cycleEndDate, '2026-11-26');
    assert.equal(beforeRefund.dailyBudgetInput.variableSpentBeforeTodayCents, 10_000);

    // Explicit refund income (includeInBudget = 1) of 40.00€ reduces variableSpentBeforeTodayCents to 60.00€
    repo.createTransaction({
      accountId: checking.id,
      type: 'income',
      amountCents: 4_000,
      currency: 'EUR',
      includeInBudget: 1,
      date: '2026-10-30',
      description: 'Rimborso reso Amazon',
    });

    const afterRefund = repo.getDashboardSummary('2026-11-05');
    assert.equal(afterRefund.dailyBudgetInput.variableSpentBeforeTodayCents, 6_000);

    // 1-Click Savings Sweep transfers money without reducing the DailyBudget
    const sweepTx = repo.sweepSavingsToAccount({
      fromAccountId: checking.id,
      toSavingsAccountId: savings.id,
      amountCents: 25_000,
      date: '2026-11-05',
    });
    assert.equal(sweepTx.type, 'transfer');
    assert.equal(sweepTx.effective_affects_budget, false);

    const accountsAfter = repo.getAccounts();
    assert.equal(
      accountsAfter.find((a) => a.id === savings.id)?.cached_balance,
      525_000
    );
  });

  it('supports Tricount cash basis (include_tricount_owes_immediately = 0) where settlement impacts DailyBudget', async () => {
    const repo = await DailyBudgetRepository.createEmpty({
      referenceDate: '2026-11-07',
    });
    repo.updateWorkspaceSettings({
      monthlyBudgetTargetCents: 150_000,
      includeTricountOwesImmediately: false, // Cash basis (Criterio di Cassa)
    });

    const acc = repo.createAccount({
      id: 'acc_main',
      name: 'Conto Principale',
      type: 'checking',
      initialBalanceCents: 200_000,
      includeInBudget: true,
    });

    repo.createTricountGroup({
      id: 'tgrp_cash',
      name: 'Cena Amici',
      defaultCurrency: 'EUR',
      members: [
        { id: 'm_me', name: 'Io', isMe: true },
        { id: 'm_friend', name: 'Marco', isMe: false },
      ],
    });

    // Friend pays 80€ (my share 40€). Under cash basis, no personal transaction is created on expense day.
    repo.createTricountExpense({
      groupId: 'tgrp_cash',
      paidByMemberId: 'm_friend',
      title: 'Pizzeria',
      amountCents: 8_000,
      currency: 'EUR',
      date: '2026-11-06',
      splitMode: 'equal',
      participants: [{ memberId: 'm_me' }, { memberId: 'm_friend' }],
      personalAccountId: acc.id,
    });

    assert.equal(repo.getTransactionsWithDetails().length, 0);

    // When I settle my 40€ debt to Marco, it deducts 40€ from my bank account AND hits my DailyBudget today!
    repo.recordTricountSettlement({
      groupId: 'tgrp_cash',
      fromMemberId: 'm_me',
      toMemberId: 'm_friend',
      amountCents: 4_000,
      date: '2026-11-07',
      personalAccountId: acc.id,
    });

    const txs = repo.getTransactionsWithDetails();
    assert.equal(txs.length, 1);
    assert.equal(txs[0].type, 'tricount_settlement');
    assert.equal(txs[0].budget_base_amount, 4_000);
    assert.equal(txs[0].effective_affects_budget, true);

    const budget = repo.computeDailyBudgetForDate('2026-11-07');
    assert.equal(budget.input.variableSpentTodayCents, 4_000);
  });

  it('updates linked bank account balance on Crypto buy/sell and respects countInBudgetAsPac', async () => {
    const repo = await DailyBudgetRepository.createEmpty({
      referenceDate: '2026-11-07',
    });
    const bankAcc = repo.createAccount({
      id: 'acc_bank_crypto',
      name: 'Fineco',
      type: 'checking',
      initialBalanceCents: 500_000, // 5.000€
      includeInBudget: true,
    });
    const btc = repo.createCryptoAsset({
      id: 'cry_btc_test',
      symbol: 'BTC',
      name: 'Bitcoin',
      currentPriceBaseCents: 8_000_000, // 80.000€
    });

    // Buy 0.01 BTC @ 80.000€ (800€) + 5€ fee = 805€ with countInBudgetAsPac = true
    repo.createCryptoTransaction({
      assetId: btc.id,
      linkedAccountId: bankAcc.id,
      type: 'buy',
      quantity: '0.01',
      pricePerUnitBaseCents: 8_000_000,
      feeBaseCents: 500,
      countInBudgetAsPac: true,
      date: '2026-11-07',
    });

    const updatedBank = repo.getAccounts().find((a) => a.id === bankAcc.id)!;
    assert.equal(updatedBank.cached_balance, 500_000 - 80_500);

    const budget = repo.computeDailyBudgetForDate('2026-11-07');
    assert.equal(budget.input.fixedExpensesActualCents, 80_500);
  });

  it('handles smart hybrid attachments, CSV import with deduplication, CSV export, and Row-Level LWW Merge', async () => {
    const repoA = await DailyBudgetRepository.createEmpty({
      referenceDate: '2026-11-07',
    });
    const acc = repoA.createAccount({
      id: 'acc_shared',
      name: 'Conto Condiviso',
      type: 'checking',
      initialBalanceCents: 100_000,
    });
    const catFood = repoA.createCategory({
      id: 'cat_food',
      name: 'Alimentari',
      type: 'expense',
    });

    const csv = [
      'Data;Descrizione;Importo;Categoria',
      '05/11/2026;Esselunga Milano;-45,50;Alimentari',
      '06/11/2026;Rimborso Trenitalia;25,00;',
      '05/11/2026;Esselunga Milano;-45,50;Alimentari', // Duplicate row inside CSV
    ].join('\n');

    const importRes1 = repoA.importTransactionsFromCsv({
      accountId: acc.id,
      csvContent: csv,
      mapping: {
        dateColumnIndex: 0,
        descriptionColumnIndex: 1,
        amountColumnIndex: 2,
        categoryColumnIndex: 3,
      },
      defaultCategoryId: catFood.id,
    });
    assert.equal(importRes1.importedCount, 2);
    assert.equal(importRes1.skippedDuplicatesCount, 1);

    // Importing the same CSV again skips all existing transactions
    const importRes2 = repoA.importTransactionsFromCsv({
      accountId: acc.id,
      csvContent: csv,
      mapping: {
        dateColumnIndex: 0,
        descriptionColumnIndex: 1,
        amountColumnIndex: 2,
        categoryColumnIndex: 3,
      },
    });
    assert.equal(importRes2.importedCount, 0);
    assert.equal(importRes2.skippedDuplicatesCount, 3);

    const exportedCsv = repoA.exportTransactionsToCsv();
    assert.ok(exportedCsv.includes('Esselunga Milano'));
    assert.ok(exportedCsv.includes('-45.50'));

    // Smart hybrid attachments: <= 500 KB stored inline, > 500 KB stored as external path
    const txId = repoA.getTransactionsWithDetails()[0].id;
    const smallReceipt = repoA.createAttachment({
      transactionId: txId,
      fileName: 'scontrino.webp',
      mimeType: 'image/webp',
      dataBytes: new Uint8Array([1, 2, 3, 4]),
    });
    assert.equal(smallReceipt.storage_type, 'inline_blob');

    const largePdf = repoA.createAttachment({
      transactionId: txId,
      fileName: 'fattura_grande.pdf',
      mimeType: 'application/pdf',
      dataBytes: new Uint8Array(600 * 1024),
      externalPath: 'local://attachments/fattura_grande.pdf',
    });
    assert.equal(largePdf.storage_type, 'local_path');
    assert.equal(repoA.getAttachmentsForTransaction(txId).length, 2);

    // Row-Level LWW Merge between two .dbbudget binaries
    const binaryA = repoA.exportBinary();
    const repoB = await DailyBudgetRepository.fromBinary(binaryA, {
      referenceDate: '2026-11-07',
    });

    // In repoB (e.g. edited on mobile), add a new transaction and soft-delete one existing transaction
    const existingTxToTombstone = repoB.getTransactionsWithDetails()[0];
    repoB.deleteTransaction(existingTxToTombstone.id);
    repoB.createTransaction({
      id: 'tx_from_mobile',
      accountId: acc.id,
      type: 'expense',
      amountCents: 1_500,
      currency: 'EUR',
      date: '2026-11-07',
      description: 'Colazione Bar Mobile',
    });

    const { mergeExternalDbBudgetBinary } = await import('./sync-merge.ts');
    const mergeReport = await mergeExternalDbBudgetBinary(
      repoA,
      repoB.exportBinary()
    );
    assert.ok(mergeReport.mergedRowsCount >= 2);

    const mergedTxsInA = repoA.getTransactionsWithDetails();
    assert.ok(mergedTxsInA.some((t) => t.id === 'tx_from_mobile'));
    assert.ok(!mergedTxsInA.some((t) => t.id === existingTxToTombstone.id));
  });
});

