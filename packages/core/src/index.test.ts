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
  computeMultiCurrencyTricountImpact,
  computeNextOccurrenceDate,
  evaluateDueRecurringRules,
  computeBudgetCycleWindow,
  computeTransactionDedupeKey,
  parseBankCsv,
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
    assert.equal(
      doesTransactionAffectBudget({
        txIncludeInBudget: null,
        accountIncludeInBudget: true,
        txType: 'tricount_settlement',
      }),
      false
    );
    assert.equal(
      doesTransactionAffectBudget({
        txIncludeInBudget: 1,
        accountIncludeInBudget: false,
        txType: 'tricount_settlement',
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

  it('computes Crypto WAC and realized/unrealized P&L accurately across buy, sell, staking_reward, transfer_in, transfer_out', () => {
    const metrics = calculateCryptoAssetMetrics(
      [
        { type: 'buy', quantity: '1.00000000', pricePerUnitBaseCents: 5_000_000, feeBaseCents: 1_000 },
        { type: 'transfer_in', quantity: '1.00000000', pricePerUnitBaseCents: 7_000_000, feeBaseCents: 1_000 },
        { type: 'staking_reward', quantity: '0.50000000', pricePerUnitBaseCents: 8_000_000, feeBaseCents: 0 },
        { type: 'transfer_out', quantity: '0.50000000', pricePerUnitBaseCents: 8_000_000, feeBaseCents: 0 },
        { type: 'sell', quantity: '0.50000000', pricePerUnitBaseCents: 8_000_000, feeBaseCents: 500 },
      ],
      8_500_000
    );

    assert.equal(metrics.totalQuantity, 1.5);
    // Cost basis after buy + transfer_in = 12,002,000 over 2.0 + 0.5 staking = 2.5 units (avg 4,800,800)
    // After transfer_out (0.5) and sell (0.5), 1.5 units remain at avg 4,800,800
    assert.equal(metrics.averageBuyPriceCents, 4_800_800);
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

  it('computes 3-tier multi-currency Tricount conversion and budget vs cashflow competence', () => {
    // Scenario A: I paid 100.00 CHF in a USD group (rate 1.12 -> 112.00 USD), workspace base is EUR (rate 0.92)
    // My quota in group is 56.00 USD (5600 cents)
    const paidByMe = computeMultiCurrencyTricountImpact({
      amountCents: 10_000,
      exchangeRateToGroup: 1.12,
      exchangeRateGroupToBase: 0.92,
      myOwedGroupAmountCents: 5_600,
      iPaidExpense: true,
      includeTricountOwesImmediately: false,
    });

    assert.equal(paidByMe.groupAmountCents, 11_200);
    assert.equal(paidByMe.personalCashflowBaseCents, 10_304); // round(11200 * 0.92)
    assert.equal(paidByMe.personalBudgetBaseCents, 5_152); // round(5600 * 0.92)
    assert.equal(paidByMe.shouldCreatePersonalTx, true);
    assert.equal(paidByMe.txIncludeInBudget, 1);

    // Scenario B: Paid by someone else, I owe 5600 USD cents, immediate budget inclusion ON
    const paidByOtherImmediate = computeMultiCurrencyTricountImpact({
      amountCents: 10_000,
      exchangeRateToGroup: 1.12,
      exchangeRateGroupToBase: 0.92,
      myOwedGroupAmountCents: 5_600,
      iPaidExpense: false,
      includeTricountOwesImmediately: true,
    });

    assert.equal(paidByOtherImmediate.groupAmountCents, 11_200);
    assert.equal(paidByOtherImmediate.personalCashflowBaseCents, 0);
    assert.equal(paidByOtherImmediate.personalBudgetBaseCents, 5_152);
    assert.equal(paidByOtherImmediate.shouldCreatePersonalTx, true);
    assert.equal(paidByOtherImmediate.txIncludeInBudget, 1);

    // Scenario C: I paid for others only (myOwedGroupAmountCents = 0) -> cashflow > 0, budget = 0, txIncludeInBudget = 0
    const paidForOthersOnly = computeMultiCurrencyTricountImpact({
      amountCents: 10_000,
      exchangeRateToGroup: 1,
      exchangeRateGroupToBase: 1,
      myOwedGroupAmountCents: 0,
      iPaidExpense: true,
      includeTricountOwesImmediately: true,
    });

    assert.equal(paidForOthersOnly.personalCashflowBaseCents, 10_000);
    assert.equal(paidForOthersOnly.personalBudgetBaseCents, 0);
    assert.equal(paidForOthersOnly.shouldCreatePersonalTx, true);
    assert.equal(paidForOthersOnly.txIncludeInBudget, 0);
  });

  it('advances recurring dates safely with UTC month-end clamping and evaluates due rules', () => {
    // Jan 31 + 1 month in non-leap year -> Feb 28
    assert.equal(computeNextOccurrenceDate('2025-01-31', 'monthly', 1), '2025-02-28');
    // Jan 31 + 1 month in leap year -> Feb 29
    assert.equal(computeNextOccurrenceDate('2024-01-31', 'monthly', 1), '2024-02-29');
    // Leap day + 1 year -> Feb 28
    assert.equal(computeNextOccurrenceDate('2024-02-29', 'yearly', 1), '2025-02-28');
    // Weekly and daily intervals
    assert.equal(computeNextOccurrenceDate('2025-03-28', 'weekly', 2), '2025-04-11');
    assert.equal(computeNextOccurrenceDate('2025-03-30', 'daily', 5), '2025-04-04');

    const evaluation = evaluateDueRecurringRules(
      [
        {
          id: 'rule-rent',
          accountId: 'acc-1',
          categoryId: 'cat-rent',
          amountCents: 85_000,
          currency: 'EUR',
          description: 'Affitto Casa',
          frequency: 'monthly',
          intervalCount: 1,
          nextOccurrenceDate: '2025-01-01',
          autoCommit: true,
          isActive: true,
        },
        {
          id: 'rule-manual',
          accountId: 'acc-1',
          categoryId: 'cat-gym',
          amountCents: 4_500,
          currency: 'EUR',
          description: 'Palestra',
          frequency: 'monthly',
          intervalCount: 1,
          nextOccurrenceDate: '2025-01-01',
          autoCommit: false, // Ignored because autoCommit is false
          isActive: true,
        },
        {
          id: 'rule-future',
          accountId: 'acc-1',
          categoryId: 'cat-sub',
          amountCents: 1_200,
          currency: 'EUR',
          description: 'Streaming',
          frequency: 'monthly',
          intervalCount: 1,
          nextOccurrenceDate: '2025-04-01', // Future relative to 2025-03-15
          autoCommit: true,
          isActive: true,
        },
      ],
      '2025-03-15'
    );

    assert.equal(evaluation.dueOccurrences.length, 3);
    assert.deepEqual(
      evaluation.dueOccurrences.map((o) => o.occurrenceDate),
      ['2025-01-01', '2025-02-01', '2025-03-01']
    );
    assert.deepEqual(evaluation.updatedNextDates, [
      { ruleId: 'rule-rent', nextOccurrenceDate: '2025-04-01' },
    ]);
  });

  it('floors dailyAllowanceCents at 0 when monthly variable pool is exhausted early', () => {
    const exhausted = calculateDailyBudget({
      monthlyBudgetCents: 150_000, // 1.500,00 €
      fixedExpensesPlannedCents: 80_000, // 800,00 € -> VariablePool = 700,00 € (70_000)
      fixedExpensesActualCents: 80_000,
      variableSpentBeforeTodayCents: 75_000, // Già sforato di 50,00 € prima di oggi
      variableSpentTodayCents: 1_500, // Speso altri 15,00 € oggi
      totalDaysInMonth: 30,
      currentDayOfMonth: 20,
    });

    assert.equal(exhausted.dailyAllowanceCents, 0);
    assert.equal(exhausted.remainingTodayCents, -1_500);
    assert.equal(exhausted.remainingMonthVariableCents, -6_500);
    assert.equal(exhausted.status, 'over_budget');
  });

  it('computes custom budget cycle windows for standard (day 1) and payday (day 27) cycles', () => {
    // Standard month cycle (monthStartDay = 1)
    const stdWindow = computeBudgetCycleWindow('2025-03-15', 1);
    assert.equal(stdWindow.cycleStartDate, '2025-03-01');
    assert.equal(stdWindow.cycleEndDate, '2025-03-31');
    assert.equal(stdWindow.totalDaysInCycle, 31);
    assert.equal(stdWindow.currentDayOfCycle, 15);
    assert.equal(stdWindow.daysRemainingIncludingToday, 17);

    // Custom payday cycle (monthStartDay = 27) when reference date is ON or AFTER day 27
    const afterPayday = computeBudgetCycleWindow('2025-03-28', 27);
    assert.equal(afterPayday.cycleStartDate, '2025-03-27');
    assert.equal(afterPayday.cycleEndDate, '2025-04-26');
    assert.equal(afterPayday.totalDaysInCycle, 31); // Mar 27..31 (5) + Apr 1..26 (26) = 31
    assert.equal(afterPayday.currentDayOfCycle, 2); // Mar 27 = day 1, Mar 28 = day 2
    assert.equal(afterPayday.daysRemainingIncludingToday, 30);

    // Custom payday cycle (monthStartDay = 27) when reference date is BEFORE day 27
    const beforePayday = computeBudgetCycleWindow('2025-03-10', 27);
    assert.equal(beforePayday.cycleStartDate, '2025-02-27');
    assert.equal(beforePayday.cycleEndDate, '2025-03-26');
    assert.equal(beforePayday.totalDaysInCycle, 28); // Feb 2025 has 28 days: Feb 27..28 (2) + Mar 1..26 (26) = 28
    assert.equal(beforePayday.currentDayOfCycle, 12); // Feb 27..28 (2) + Mar 1..10 (10) = 12
    assert.equal(beforePayday.daysRemainingIncludingToday, 17);
  });

  it('parses European and ISO bank CSV files and generates deterministic deduplication keys', () => {
    const csvContent = [
      'Data;Descrizione;Importo;Valuta;Categoria',
      '15/03/2025;"Esselunga   Milano";-45,80;EUR;Spesa Alimentare',
      '2025-03-27;"Bonifico Stipendio";2.450,00;EUR;Stipendio',
    ].join('\n');

    const rows = parseBankCsv(csvContent, {
      dateColumnIndex: 0,
      descriptionColumnIndex: 1,
      amountColumnIndex: 2,
      currencyColumnIndex: 3,
      categoryColumnIndex: 4,
      delimiter: ';',
      hasHeaderRow: true,
    });

    assert.equal(rows.length, 2);
    assert.equal(rows[0].date, '2025-03-15');
    assert.equal(rows[0].type, 'expense');
    assert.equal(rows[0].amountCents, 4580);
    assert.equal(rows[0].currency, 'EUR');
    assert.equal(rows[0].categoryHint, 'Spesa Alimentare');
    assert.equal(
      rows[0].dedupeKey,
      computeTransactionDedupeKey('2025-03-15', 'expense', 4580, '  esselunga milano ')
    );

    assert.equal(rows[1].date, '2025-03-27');
    assert.equal(rows[1].type, 'income');
    assert.equal(rows[1].amountCents, 245_000);
  });
});

