// =========================================================
// DAILYBUDGET - CORE ENGINE (packages/core/src/index.ts)
// Zero dipendenze esterne. Tutti gli importi Fiat sono in centesimi (interi).
// =========================================================

// ---------------------------------------------------------
// 1. REGOLA DI PRIORITÀ SUL BUDGET (Transazione > Conto)
// ---------------------------------------------------------
export type TransactionType = 
  | 'income' 
  | 'expense' 
  | 'transfer' 
  | 'loan_movement' 
  | 'tricount_settlement';

export interface TransactionBudgetCheck {
  txIncludeInBudget: 0 | 1 | null; // Override sulla transazione (prioritario)
  accountIncludeInBudget: boolean; // Default sul conto bancario
  txType: TransactionType;
}

/**
 * Determina se una transazione impatta il calcolo del DailyBudget.
 * Lo stato esplicito sulla transazione (0 o 1) vince sempre sul default del conto.
 */
export function doesTransactionAffectBudget(item: TransactionBudgetCheck): boolean {
  if (
    item.txType === 'transfer' ||
    item.txType === 'tricount_settlement' ||
    item.txType === 'loan_movement'
  ) {
    return item.txIncludeInBudget === 1;
  }

  if (item.txIncludeInBudget !== null) {
    return item.txIncludeInBudget === 1;
  }

  return item.accountIncludeInBudget;
}

// ---------------------------------------------------------
// 2. MOTORE CALCOLO DAILY BUDGET & FORECASTING
// ---------------------------------------------------------
export interface DailyBudgetInput {
  monthlyBudgetCents: number;
  fixedExpensesPlannedCents: number;
  fixedExpensesActualCents: number;
  variableSpentBeforeTodayCents: number;
  variableSpentTodayCents: number;
  totalDaysInMonth: number;
  currentDayOfMonth: number;
}

export interface DailyBudgetResult {
  dailyAllowanceCents: number;
  remainingTodayCents: number;
  remainingMonthVariableCents: number;
  projectedMonthEndTotalCents: number;
  projectedSavingsOrOverrunCents: number;
  status: 'safe' | 'warning' | 'over_budget';
}

export function calculateDailyBudget(input: DailyBudgetInput): DailyBudgetResult {
  const {
    monthlyBudgetCents,
    fixedExpensesPlannedCents,
    fixedExpensesActualCents,
    variableSpentBeforeTodayCents,
    variableSpentTodayCents,
    totalDaysInMonth,
    currentDayOfMonth,
  } = input;

  const effectiveFixedCents = Math.max(fixedExpensesPlannedCents, fixedExpensesActualCents);
  const totalVariablePoolCents = monthlyBudgetCents - effectiveFixedCents;
  const daysRemainingIncludingToday = Math.max(1, totalDaysInMonth - currentDayOfMonth + 1);

  const variableAvailableStartOfToday = totalVariablePoolCents - variableSpentBeforeTodayCents;
  const dailyAllowanceCents = Math.floor(variableAvailableStartOfToday / daysRemainingIncludingToday);
  const remainingTodayCents = dailyAllowanceCents - variableSpentTodayCents;
  const remainingMonthVariableCents = variableAvailableStartOfToday - variableSpentTodayCents;

  // Forecasting (Burn Rate)
  const totalVariableSpentSoFar = variableSpentBeforeTodayCents + variableSpentTodayCents;
  const daysElapsed = Math.max(1, currentDayOfMonth);
  const dailyBurnRate = totalVariableSpentSoFar / daysElapsed;
  const projectedVariableTotal = Math.round(dailyBurnRate * totalDaysInMonth);
  const projectedMonthEndTotalCents = effectiveFixedCents + projectedVariableTotal;
  const projectedSavingsOrOverrunCents = monthlyBudgetCents - projectedMonthEndTotalCents;

  let status: 'safe' | 'warning' | 'over_budget' = 'safe';
  if (remainingTodayCents < 0 || remainingMonthVariableCents < 0) {
    status = 'over_budget';
  } else if (remainingTodayCents < dailyAllowanceCents * 0.2) {
    status = 'warning';
  }

  return {
    dailyAllowanceCents,
    remainingTodayCents,
    remainingMonthVariableCents,
    projectedMonthEndTotalCents,
    projectedSavingsOrOverrunCents,
    status,
  };
}

// ---------------------------------------------------------
// 3. RISOLUTORE DEBITI TRICOUNT (Greedy Minimum Cash Flow)
// ---------------------------------------------------------
export interface MemberBalance {
  memberId: string;
  memberName: string;
  netBalanceCents: number; // Positivo = creditore, Negativo = debitore
}

export interface SettlementTransfer {
  fromMemberId: string;
  fromMemberName: string;
  toMemberId: string;
  toMemberName: string;
  amountCents: number;
}

export function calculateTricountSettlements(balances: MemberBalance[]): SettlementTransfer[] {
  const debtors = balances
    .filter((b) => b.netBalanceCents < 0)
    .map((b) => ({ ...b, amount: Math.abs(b.netBalanceCents) }))
    .sort((a, b) => b.amount - a.amount);

  const creditors = balances
    .filter((b) => b.netBalanceCents > 0)
    .map((b) => ({ ...b, amount: b.netBalanceCents }))
    .sort((a, b) => b.amount - a.amount);

  const settlements: SettlementTransfer[] = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settledAmount = Math.min(debtor.amount, creditor.amount);

    if (settledAmount > 0) {
      settlements.push({
        fromMemberId: debtor.memberId,
        fromMemberName: debtor.memberName,
        toMemberId: creditor.memberId,
        toMemberName: creditor.memberName,
        amountCents: settledAmount,
      });
    }

    debtor.amount -= settledAmount;
    creditor.amount -= settledAmount;

    if (debtor.amount === 0) i++;
    if (creditor.amount === 0) j++;
  }

  return settlements;
}

// ---------------------------------------------------------
// 4. MOTORE CRYPTO P&L (Weighted Average Cost - WAC)
// ---------------------------------------------------------
export interface CryptoTxInput {
  type: 'buy' | 'sell' | 'transfer_in' | 'transfer_out' | 'staking_reward';
  quantity: string;            // Stringa decimale (es. "0.05000000")
  pricePerUnitBaseCents: number;
  feeBaseCents: number;
}

export interface CryptoHoldingMetrics {
  totalQuantity: number;
  averageBuyPriceCents: number; // Prezzo Medio di Carico (PMC)
  totalCostBasisCents: number;
  currentValueCents: number;
  unrealizedPnlCents: number;
  unrealizedPnlPct: number;
  realizedPnlCents: number;
}

export function calculateCryptoAssetMetrics(
  transactions: CryptoTxInput[],
  currentPriceBaseCents: number
): CryptoHoldingMetrics {
  let totalQty = 0;
  let totalCostCents = 0;
  let realizedPnlCents = 0;

  for (const tx of transactions) {
    const qty = parseFloat(tx.quantity);
    if (isNaN(qty) || qty <= 0) continue;

    if (tx.type === 'buy' || tx.type === 'transfer_in') {
      totalCostCents += Math.round(qty * tx.pricePerUnitBaseCents) + tx.feeBaseCents;
      totalQty += qty;
    } else if (tx.type === 'staking_reward') {
      // Staking aumenta la quantità a costo zero (abbassa il PMC)
      totalQty += qty;
    } else if (tx.type === 'sell' || tx.type === 'transfer_out') {
      if (totalQty > 0) {
        const avgCostPerUnit = totalCostCents / totalQty;
        const costOfSoldUnits = Math.round(avgCostPerUnit * qty);
        const proceedsCents = Math.round(qty * tx.pricePerUnitBaseCents) - tx.feeBaseCents;
        
        if (tx.type === 'sell') {
          realizedPnlCents += proceedsCents - costOfSoldUnits;
        }
        
        totalCostCents = Math.max(0, totalCostCents - costOfSoldUnits);
        totalQty = Math.max(0, totalQty - qty);
      }
    }
  }

  const averageBuyPriceCents = totalQty > 0 ? Math.round(totalCostCents / totalQty) : 0;
  const currentValueCents = Math.round(totalQty * currentPriceBaseCents);
  const unrealizedPnlCents = currentValueCents - totalCostCents;
  const unrealizedPnlPct = totalCostCents > 0 ? (unrealizedPnlCents / totalCostCents) * 100 : 0;

  return {
    totalQuantity: totalQty,
    averageBuyPriceCents,
    totalCostBasisCents: totalCostCents,
    currentValueCents,
    unrealizedPnlCents,
    unrealizedPnlPct,
    realizedPnlCents,
  };
}