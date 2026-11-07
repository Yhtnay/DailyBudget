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

// ---------------------------------------------------------
// 5. UTILITÀ CONTABILI E HELPER DI DOMINIO (Zero-Float Fiat)
// ---------------------------------------------------------
export type SplitMode = 'equal' | 'exact' | 'percentage' | 'shares';

export interface SplitParticipantInput {
  memberId: string;
  shareValue?: number; // usato per exact (in centesimi), percentage (0..100) o shares (peso)
}

export interface ComputedTricountSplit {
  memberId: string;
  splitMode: SplitMode;
  shareValue: number | null;
  owedGroupAmountCents: number;
}

/**
 * Calcola le quote individuali di una spesa Tricount garantendo che la somma
 * delle quote intere in centesimi coincida esattamente con `groupAmountCents`
 * (distribuendo eventuali centesimi di resto sui primi partecipanti).
 */
export function computeTricountExpenseSplits(
  groupAmountCents: number,
  mode: SplitMode,
  participants: SplitParticipantInput[]
): ComputedTricountSplit[] {
  if (participants.length === 0) return [];

  if (mode === 'exact') {
    return participants.map((p) => ({
      memberId: p.memberId,
      splitMode: 'exact',
      shareValue: Math.round(p.shareValue ?? 0),
      owedGroupAmountCents: Math.round(p.shareValue ?? 0),
    }));
  }

  const weights = participants.map((p) => {
    if (mode === 'equal') return 1;
    return Math.max(0, p.shareValue ?? (mode === 'shares' ? 1 : 0));
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight <= 0) {
    return participants.map((p) => ({
      memberId: p.memberId,
      splitMode: mode,
      shareValue: p.shareValue ?? null,
      owedGroupAmountCents: 0,
    }));
  }

  const rawQuotas = weights.map((w) => (groupAmountCents * w) / totalWeight);
  const flooredQuotas = rawQuotas.map((q) => Math.floor(q));
  let remainderCents =
    groupAmountCents - flooredQuotas.reduce((acc, q) => acc + q, 0);

  // Distribuisce il resto in centesimi a chi ha la parte frazionaria maggiore
  const indicesByFraction = rawQuotas
    .map((q, idx) => ({ idx, frac: q - flooredQuotas[idx] }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; k < indicesByFraction.length && remainderCents > 0; k++) {
    flooredQuotas[indicesByFraction[k].idx] += 1;
    remainderCents -= 1;
  }

  return participants.map((p, idx) => ({
    memberId: p.memberId,
    splitMode: mode,
    shareValue: mode === 'equal' ? 1 : (p.shareValue ?? 1),
    owedGroupAmountCents: flooredQuotas[idx],
  }));
}

/**
 * Verifica che la somma degli split di categoria eguagli esattamente `budget_base_amount`.
 */
export function validateTransactionSplits(
  budgetBaseAmountCents: number,
  splits: Array<{ categoryId: string; amountBaseCents: number }>
): { valid: boolean; totalSplitCents: number; differenceCents: number } {
  const totalSplitCents = splits.reduce((acc, s) => acc + Math.round(s.amountBaseCents), 0);
  const differenceCents = budgetBaseAmountCents - totalSplitCents;
  return {
    valid: differenceCents === 0 && splits.length > 0,
    totalSplitCents,
    differenceCents,
  };
}

/**
 * Formatta un importo intero in centesimi in valuta leggibile (es. 1250 -> "12,50 €").
 */
export function formatCents(
  cents: number,
  currency: string = 'EUR',
  locale: string = 'it-IT'
): string {
  const majorUnits = cents / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(majorUnits);
  } catch {
    return `${majorUnits.toFixed(2)} ${currency}`;
  }
}

/**
 * Converte una stringa/numero utente (es. "12,50" o "12.50") in centesimi interi (1250).
 */
export function parseMajorToCents(input: string | number): number {
  if (typeof input === 'number') {
    return Math.round(input * 100);
  }
  const normalized = input.trim().replace(/\s/g, '').replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  if (Number.isNaN(parsed)) return 0;
  return Math.round(parsed * 100);
}