import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  doesTransactionAffectBudget,
  calculateDailyBudget,
  calculateTricountSettlements,
  calculateCryptoAssetMetrics,
  computeTricountExpenseSplits,
  validateTransactionSplits,
  parseMajorToCents,
} from './index.ts';

describe('DailyBudget Core Engine', () => {
  it('enforces Transaction > Account budget priority rule', () => {
    // Conto incluso (true), transazione default (null) -> true
    assert.equal(
      doesTransactionAffectBudget({
        txIncludeInBudget: null,
        accountIncludeInBudget: true,
        txType: 'expense',
      }),
      true
    );

    // Conto incluso (true), transazione forzata esclusa (0) -> false
    assert.equal(
      doesTransactionAffectBudget({
        txIncludeInBudget: 0,
        accountIncludeInBudget: true,
        txType: 'expense',
      }),
      false
    );

    // Conto escluso (false), transazione forzata inclusa (1) -> true
    assert.equal(
      doesTransactionAffectBudget({
        txIncludeInBudget: 1,
        accountIncludeInBudget: false,
        txType: 'expense',
      }),
      true
    );

    // Giroconti, movimenti prestiti e rimborsi Tricount sono esclusi salvo forzatura esplicita (1)
    assert.equal(
      doesTransactionAffectBudget({
        txIncludeInBudget: null,
        accountIncludeInBudget: true,
        txType: 'transfer',
      }),
      false
    );
    assert.equal(
      doesTransactionAffectBudget({
        txIncludeInBudget: 1,
        accountIncludeInBudget: false,
        txType: 'loan_movement',
      }),
      true
    );
  });

  it('computes dynamic DailyBudget separating fixed and variable pools', () => {
    const result = calculateDailyBudget({
      monthlyBudgetCents: 200_000, // 2.000,00 €
      fixedExpensesPlannedCents: 80_000, // 800,00 €
      fixedExpensesActualCents: 75_000, // 750,00 € -> EffectiveFixed = 800,00 €
      variableSpentBeforeTodayCents: 50_000, // 500,00 €
      variableSpentTodayCents: 2_000, // 20,00 €
      totalDaysInMonth: 30,
      currentDayOfMonth: 15, // 16 giorni rimanenti incluso oggi
    });

    // VariablePool = 200000 - 80000 = 120000
    // AvailableStartOfToday = 120000 - 50000 = 70000
    // DaysRemainingIncludingToday = 30 - 15 + 1 = 16
    // DailyAllowanceToday = floor(70000 / 16) = 4375 (43,75 €)
    assert.equal(result.dailyAllowanceCents, 4375);
    assert.equal(result.remainingTodayCents, 2375);
    assert.equal(result.remainingMonthVariableCents, 68_000);
    assert.equal(result.status, 'safe');
  });

  it('minimizes Tricount settlements via Greedy Minimum Cash Flow', () => {
    const settlements = calculateTricountSettlements([
      { memberId: 'andrea', memberName: 'Andrea', netBalanceCents: 7500 },
      { memberId: 'marco', memberName: 'Marco', netBalanceCents: -2500 },
      { memberId: 'giulia', memberName: 'Giulia', netBalanceCents: -5000 },
    ]);

    assert.equal(settlements.length, 2);
    assert.equal(settlements[0].fromMemberId, 'giulia');
    assert.equal(settlements[0].toMemberId, 'andrea');
    assert.equal(settlements[0].amountCents, 5000);
    assert.equal(settlements[1].fromMemberId, 'marco');
    assert.equal(settlements[1].toMemberId, 'andrea');
    assert.equal(settlements[1].amountCents, 2500);
  });

  it('distributes Tricount cent remainders without rounding loss', () => {
    const splits = computeTricountExpenseSplits(10_000, 'equal', [
      { memberId: 'm1' },
      { memberId: 'm2' },
      { memberId: 'm3' },
    ]);
    const sum = splits.reduce((acc, s) => acc + s.owedGroupAmountCents, 0);
    assert.equal(sum, 10_000);
    assert.deepEqual(
      splits.map((s) => s.owedGroupAmountCents),
      [3334, 3333, 3333]
    );
  });

  it('computes Crypto WAC and realized/unrealized P&L accurately', () => {
    const metrics = calculateCryptoAssetMetrics(
      [
        { type: 'buy', quantity: '1.00000000', pricePerUnitBaseCents: 5_000_000, feeBaseCents: 1_000 },
        { type: 'buy', quantity: '1.00000000', pricePerUnitBaseCents: 7_000_000, feeBaseCents: 1_000 },
        { type: 'sell', quantity: '0.50000000', pricePerUnitBaseCents: 8_000_000, feeBaseCents: 500 },
      ],
      8_500_000
    );

    assert.equal(metrics.totalQuantity, 1.5);
    assert.equal(metrics.averageBuyPriceCents, 6_001_000);
    assert.ok(metrics.realizedPnlCents > 0);
    assert.ok(metrics.unrealizedPnlCents > 0);
  });

  it('validates multi-category splits and parses cents safely', () => {
    assert.equal(parseMajorToCents('12,50'), 1250);
    const check = validateTransactionSplits(2500, [
      { categoryId: 'c1', amountBaseCents: 1500 },
      { categoryId: 'c2', amountBaseCents: 1000 },
    ]);
    assert.equal(check.valid, true);
  });
});
