import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  DailyBudgetRepository,
  isValidSqliteBinary,
  seedDemoWorkspace,
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
});
