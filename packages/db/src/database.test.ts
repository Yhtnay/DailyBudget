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
});

