import type { DailyBudgetRepository } from './database.ts';

export function seedMinimalWorkspace(
  repo: DailyBudgetRepository,
  options?: {
    name?: string;
    baseCurrency?: string;
    monthlyBudgetTargetCents?: number;
  }
): void {
  repo.updateWorkspaceSettings({
    name: options?.name ?? 'Nuovo Workspace DailyBudget',
    baseCurrency: options?.baseCurrency ?? 'EUR',
    monthlyBudgetTargetCents: options?.monthlyBudgetTargetCents ?? 200_000,
    monthStartDay: 1,
    includeTricountOwesImmediately: true,
  });

  repo.upsertExchangeRate('USD_EUR', 0.92);
  repo.upsertExchangeRate('GBP_EUR', 1.18);
  repo.upsertExchangeRate('CHF_EUR', 1.06);

  repo.createAccount({
    id: 'acc_checking_main',
    name: 'Conto Corrente Principale',
    type: 'checking',
    currency: 'EUR',
    initialBalanceCents: 350_000,
    includeInBudget: true,
    color: '#0f766e',
    icon: 'landmark',
  });

  repo.createCategory({
    id: 'cat_housing',
    name: 'Affitto / Mutuo',
    type: 'expense',
    monthlyLimitCents: 75_000,
    isFixedExpense: true,
    color: '#0284c7',
    icon: 'home',
  });

  repo.createCategory({
    id: 'cat_groceries',
    name: 'Spesa Alimentare',
    type: 'expense',
    monthlyLimitCents: 40_000,
    isFixedExpense: false,
    color: '#16a34a',
    icon: 'shopping-cart',
  });

  repo.createCategory({
    id: 'cat_dining',
    name: 'Ristoranti & Uscite',
    type: 'expense',
    monthlyLimitCents: 25_000,
    isFixedExpense: false,
    color: '#ea580c',
    icon: 'utensils',
  });

  repo.recomputeWidgetSnapshot();
}

export function seedDemoWorkspace(
  repo: DailyBudgetRepository,
  referenceDate?: string
): void {
  const today = referenceDate ?? repo.getReferenceDate();
  const ym = today.slice(0, 7);
  const dayNum = Number.parseInt(today.slice(8, 10), 10);
  const d1 = `${ym}-01`;
  const d3 = `${ym}-${String(Math.max(1, Math.min(dayNum - 3, 28))).padStart(2, '0')}`;
  const d2 = `${ym}-${String(Math.max(1, Math.min(dayNum - 1, 28))).padStart(2, '0')}`;

  repo.updateWorkspaceSettings({
    name: 'Andrea • Finanza & Crypto (.dbbudget)',
    baseCurrency: 'EUR',
    monthlyBudgetTargetCents: 240_000, // 2.400,00 € target mensile
    monthStartDay: 1,
    includeTricountOwesImmediately: true,
  });

  repo.upsertExchangeRate('USD_EUR', 0.92);
  repo.upsertExchangeRate('GBP_EUR', 1.18);
  repo.upsertExchangeRate('CHF_EUR', 1.06);

  // 1. Conti Bancari (Checking, Savings escluso da budget, Carta Credito, Contanti)
  const accFineco = repo.createAccount({
    id: 'acc_fineco',
    name: 'Fineco Conto Principale',
    type: 'checking',
    currency: 'EUR',
    initialBalanceCents: 685_000, // 6.850,00 €
    includeInBudget: true,
    color: '#0f766e',
    icon: 'landmark',
  });

  const accRevolut = repo.createAccount({
    id: 'acc_revolut',
    name: 'Revolut Multi-Currency',
    type: 'credit_card',
    currency: 'EUR',
    initialBalanceCents: 142_000, // 1.420,00 €
    creditLimitCents: 300_000,
    includeInBudget: true,
    color: '#0284c7',
    icon: 'credit-card',
  });

  const accSavings = repo.createAccount({
    id: 'acc_savings',
    name: 'Fondo Emergenza (BBVA 4%)',
    type: 'savings',
    currency: 'EUR',
    initialBalanceCents: 1_500_000, // 15.000,00 €
    includeInBudget: false, // Conto Risparmio escluso di default dal DailyBudget!
    color: '#d97706',
    icon: 'piggy-bank',
  });

  // 2. Categorie Fisse e Variabili
  const catRent = repo.createCategory({
    id: 'cat_rent',
    name: 'Affitto & Condominio',
    type: 'expense',
    monthlyLimitCents: 75_000, // 750,00 €
    isFixedExpense: true,
    color: '#0284c7',
    icon: 'home',
  });

  const catUtilities = repo.createCategory({
    id: 'cat_utilities',
    name: 'Bollette, Fibra & Cloud',
    type: 'expense',
    monthlyLimitCents: 15_000, // 150,00 €
    isFixedExpense: true,
    color: '#0d9488',
    icon: 'zap',
  });

  const catGroceries = repo.createCategory({
    id: 'cat_groceries',
    name: 'Supermercato & Spesa',
    type: 'expense',
    monthlyLimitCents: 45_000,
    isFixedExpense: false,
    color: '#16a34a',
    icon: 'shopping-cart',
  });

  const catDining = repo.createCategory({
    id: 'cat_dining',
    name: 'Ristoranti, Cene & Bar',
    type: 'expense',
    monthlyLimitCents: 35_000,
    isFixedExpense: false,
    color: '#ea580c',
    icon: 'utensils',
  });

  const catTransport = repo.createCategory({
    id: 'cat_transport',
    name: 'Trasporti, Treno & Carburante',
    type: 'expense',
    monthlyLimitCents: 25_000,
    isFixedExpense: false,
    color: '#2563eb',
    icon: 'car',
  });

  const catHome = repo.createCategory({
    id: 'cat_home_var',
    name: 'Casa, Tech & Igiene',
    type: 'expense',
    monthlyLimitCents: 20_000,
    isFixedExpense: false,
    color: '#ca8a04',
    icon: 'package',
  });

  const catSalary = repo.createCategory({
    id: 'cat_salary',
    name: 'Stipendio & Consulenze',
    type: 'income',
    monthlyLimitCents: null,
    isFixedExpense: false,
    color: '#15803d',
    icon: 'briefcase',
  });

  // 3. Tag M:N trasversali
  const tagViaggio = repo.createTag({ id: 'tag_viaggio', name: 'viaggio', color: '#0284c7' });
  const tagLavoro = repo.createTag({ id: 'tag_lavoro', name: 'lavoro', color: '#0f766e' });
  const tagRimborsabile = repo.createTag({
    id: 'tag_rimborsabile',
    name: 'rimborsabile',
    color: '#d97706',
  });
  const tagCasa = repo.createTag({ id: 'tag_casa', name: 'casa', color: '#4f46e5' });

  // 4. Transazioni dimostrative di tutte le regole contabili:
  // Stipendio inizio mese
  repo.createTransaction({
    accountId: accFineco.id,
    type: 'income',
    amountCents: 315_000, // +3.150,00 €
    currency: 'EUR',
    date: d1,
    description: 'Bonifico Stipendio Mensile',
    splits: [{ categoryId: catSalary.id, amountBaseCents: 315_000 }],
    tagIds: [tagLavoro.id],
  });

  // Spesa Fissa: Affitto
  repo.createTransaction({
    accountId: accFineco.id,
    type: 'expense',
    amountCents: 75_000, // 750,00 €
    currency: 'EUR',
    isFixed: true,
    date: d1,
    description: 'Canone Affitto Mensile + Spese',
    splits: [{ categoryId: catRent.id, amountBaseCents: 75_000 }],
    tagIds: [tagCasa.id],
  });

  // Spesa Fissa: Fibra + Energia
  repo.createTransaction({
    accountId: accFineco.id,
    type: 'expense',
    amountCents: 11_800, // 118,00 €
    currency: 'EUR',
    isFixed: true,
    date: d3,
    description: 'Fattura Luce & Fibra FTTH',
    splits: [{ categoryId: catUtilities.id, amountBaseCents: 11_800 }],
    tagIds: [tagCasa.id],
  });

  // Spesa Multi-Categoria (Split): Esselunga (Alimentari + Prodotti Casa)
  repo.createTransaction({
    accountId: accRevolut.id,
    type: 'expense',
    amountCents: 14_650, // 146,50 €
    currency: 'EUR',
    isFixed: false,
    date: d3,
    description: 'Esselunga Spesa Settimanale (Split 2 Categorie)',
    splits: [
      { categoryId: catGroceries.id, amountBaseCents: 10_400, notes: 'Alimentari freschi' },
      { categoryId: catHome.id, amountBaseCents: 4_250, notes: 'Detersivi e lampadine LED' },
    ],
    tagIds: [tagCasa.id],
  });

  // Esempio Override Priorità Transazione > Conto (Regola C):
  // Spesa su Conto Risparmio (normalmente escluso) ma forzata con include_in_budget = 1
  repo.createTransaction({
    accountId: accSavings.id,
    type: 'expense',
    amountCents: 6_500, // 65,00 €
    currency: 'EUR',
    includeInBudget: 1, // Forza INCLUSIONE anche se Fondo Emergenza ha include_in_budget = 0!
    isFixed: false,
    date: d2,
    description: 'Tagliando Bici Elettrica (Pagato da Fondo Risparmio ma forzato a Budget)',
    splits: [{ categoryId: catTransport.id, amountBaseCents: 6_500 }],
  });

  // Spesa su Conto Principale ma forzata ESCLUSA (include_in_budget = 0) perché anticipo aziendale
  repo.createTransaction({
    accountId: accRevolut.id,
    type: 'expense',
    amountCents: 18_500, // 185,00 €
    currency: 'EUR',
    includeInBudget: 0, // Forza ESCLUSIONE dal DailyBudget
    isFixed: false,
    date: d2,
    description: 'Biglietto Frecciarossa Trasferta Cliente (Anticipo Rimborsabile)',
    splits: [{ categoryId: catTransport.id, amountBaseCents: 18_500 }],
    tagIds: [tagLavoro.id, tagRimborsabile.id],
  });

  // Spesa di OGGI
  repo.createTransaction({
    accountId: accRevolut.id,
    type: 'expense',
    amountCents: 1_850, // 18,50 €
    currency: 'EUR',
    isFixed: false,
    date: today,
    description: 'Pranzo Poke & Caffè',
    splits: [{ categoryId: catDining.id, amountBaseCents: 1_850 }],
    tagIds: [tagLavoro.id],
  });

  // 5. Modulo Tricount: "Weekend Dolomiti" con esempio canonico 100€ pagati per 4 persone (25€ quota mia)
  repo.createTricountGroup({
    id: 'tgrp_dolomiti',
    name: 'Weekend Dolomiti 🏔️',
    defaultCurrency: 'EUR',
    description: 'Baita, cene e carburante tra 4 amici',
    members: [
      { id: 'tmbr_andrea', name: 'Andrea (Io)', isMe: true, weight: 1 },
      { id: 'tmbr_marco', name: 'Marco', isMe: false, weight: 1 },
      { id: 'tmbr_giulia', name: 'Giulia', isMe: false, weight: 1 },
      { id: 'tmbr_luca', name: 'Luca', isMe: false, weight: 1 },
    ],
  });

  // Esempio esatto da HANDOFF_CONTEXT.md:
  // Pago 100,00 € di cena per 4 persone col mio conto -> base_amount = 10000, budget_base_amount = 2500!
  repo.createTricountExpense({
    id: 'texp_cena_baita',
    groupId: 'tgrp_dolomiti',
    paidByMemberId: 'tmbr_andrea',
    title: 'Cena in Baita Canederli & Vino (100€ per 4)',
    amountCents: 10_000, // 100,00 €
    currency: 'EUR',
    exchangeRateToGroup: 1.0,
    date: today,
    splitMode: 'equal',
    participants: [
      { memberId: 'tmbr_andrea' },
      { memberId: 'tmbr_marco' },
      { memberId: 'tmbr_giulia' },
      { memberId: 'tmbr_luca' },
    ],
    personalAccountId: accRevolut.id,
    personalCategoryId: catDining.id,
    personalTagIds: [tagViaggio.id],
  });

  // Seconda spesa nel gruppo: Giulia paga 160€ di Skipass/Rifugio
  repo.createTricountExpense({
    id: 'texp_rifugio',
    groupId: 'tgrp_dolomiti',
    paidByMemberId: 'tmbr_giulia',
    title: 'Prenotazione Rifugio & Legna',
    amountCents: 16_000, // 160,00 €
    currency: 'EUR',
    exchangeRateToGroup: 1.0,
    date: d2,
    splitMode: 'equal',
    participants: [
      { memberId: 'tmbr_andrea' },
      { memberId: 'tmbr_marco' },
      { memberId: 'tmbr_giulia' },
      { memberId: 'tmbr_luca' },
    ],
    personalAccountId: accRevolut.id,
    personalCategoryId: catTransport.id,
    personalTagIds: [tagViaggio.id],
  });

  // 6. Modulo Prestiti & Debiti (loans)
  repo.createLoan({
    id: 'loan_macbook',
    name: 'Finanziamento Tasso Zero MacBook Pro',
    counterpartyName: 'Apple Financial Services',
    type: 'borrowed',
    currency: 'EUR',
    principalAmountCents: 240_000, // 2.400,00 €
    remainingAmountCents: 160_000, // 1.600,00 € residui
    interestRatePct: 0.0,
    startDate: `${ym.slice(0, 4)}-03-01`,
    dueDate: `${Number(ym.slice(0, 4)) + 1}-03-01`,
    countInstallmentsInBudget: true,
    notes: 'Rata mensile da 100,00 € inclusa nel budget fisso',
  });

  repo.createLoan({
    id: 'loan_prestito_fratello',
    name: 'Anticipo Caparra Moto a Matteo',
    counterpartyName: 'Matteo',
    type: 'lent',
    currency: 'EUR',
    principalAmountCents: 120_000, // 1.200,00 € prestati
    remainingAmountCents: 75_000, // 750,00 € ancora da ricevere
    interestRatePct: 0.0,
    startDate: `${ym.slice(0, 4)}-06-15`,
    dueDate: `${ym.slice(0, 4)}-12-31`,
    countInstallmentsInBudget: false,
    notes: 'Rimborso in 3 tranche via bonifico',
  });

  // 7. Modulo Crypto Portfolio (WAC & P&L)
  const btc = repo.createCryptoAsset({
    id: 'cry_btc',
    symbol: 'BTC',
    name: 'Bitcoin',
    currentPriceBaseCents: 8_450_000, // 84.500,00 €
    priceChange24hPct: 2.85,
    alertThresholdPct: 5.0,
  });

  repo.createCryptoTransaction({
    assetId: btc.id,
    linkedAccountId: accFineco.id,
    type: 'buy',
    quantity: '0.08000000',
    pricePerUnitBaseCents: 6_100_000, // acquistato a 61.000 €
    feeBaseCents: 450,
    date: `${ym.slice(0, 4)}-02-10`,
    notes: 'PAC Accumulo BTC Tier 1',
  });

  repo.createCryptoTransaction({
    assetId: btc.id,
    linkedAccountId: accFineco.id,
    type: 'buy',
    quantity: '0.04500000',
    pricePerUnitBaseCents: 7_400_000, // acquistato a 74.000 €
    feeBaseCents: 350,
    date: `${ym.slice(0, 4)}-07-18`,
    notes: 'PAC Accumulo BTC Tier 2',
  });

  const eth = repo.createCryptoAsset({
    id: 'cry_eth',
    symbol: 'ETH',
    name: 'Ethereum',
    currentPriceBaseCents: 298_000, // 2.980,00 €
    priceChange24hPct: -1.15,
    alertThresholdPct: 8.0,
  });

  repo.createCryptoTransaction({
    assetId: eth.id,
    linkedAccountId: accRevolut.id,
    type: 'buy',
    quantity: '1.50000000',
    pricePerUnitBaseCents: 245_000, // acquistato a 2.450 €
    feeBaseCents: 250,
    date: `${ym.slice(0, 4)}-04-05`,
    notes: 'Posizione Core ETH',
  });

  repo.createCryptoTransaction({
    assetId: eth.id,
    type: 'staking_reward',
    quantity: '0.04250000',
    pricePerUnitBaseCents: 0,
    feeBaseCents: 0,
    date: d2,
    notes: 'Reward Staking Lido/Kiln (costo zero -> riduce PMC)',
  });

  const sol = repo.createCryptoAsset({
    id: 'cry_sol',
    symbol: 'SOL',
    name: 'Solana',
    currentPriceBaseCents: 19_400, // 194,00 €
    priceChange24hPct: 5.4,
    alertThresholdPct: 10.0,
  });

  repo.createCryptoTransaction({
    assetId: sol.id,
    linkedAccountId: accRevolut.id,
    type: 'buy',
    quantity: '20.00000000',
    pricePerUnitBaseCents: 13_200, // acquistato a 132,00 €
    feeBaseCents: 150,
    date: `${ym.slice(0, 4)}-05-12`,
    notes: 'Ingresso Solana',
  });

  repo.createCryptoTransaction({
    assetId: sol.id,
    linkedAccountId: accRevolut.id,
    type: 'sell',
    quantity: '5.00000000',
    pricePerUnitBaseCents: 18_500, // presa di profitto parziale a 185,00 €
    feeBaseCents: 100,
    date: d3,
    notes: 'Take profit 25% posizione SOL',
  });

  repo.recomputeWidgetSnapshot(today);
}
