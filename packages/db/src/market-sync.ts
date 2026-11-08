import type { DailyBudgetRepository } from './database.ts';

export interface MarketSyncReport {
  mode: 'live_api' | 'offline_fallback';
  updatedRatesCount: number;
  updatedCryptoCount: number;
  syncedAt: number;
  details: string;
}

interface FrankfurterResponse {
  amount: number;
  base: string;
  date: string;
  rates: Record<string, number>;
}

interface CoinGeckoPriceEntry {
  eur?: number;
  eur_24h_change?: number;
}

type CoinGeckoResponse = Record<string, CoinGeckoPriceEntry>;

const OFFLINE_FALLBACK_RATES: Record<string, number> = {
  USD_EUR: 0.9245,
  GBP_EUR: 1.184,
  CHF_EUR: 1.0635,
};

const OFFLINE_FALLBACK_CRYPTO_PRICES: Record<
  string,
  { priceBaseCents: number; change24hPct: number }
> = {
  BTC: { priceBaseCents: 8_620_000, change24hPct: 3.42 },
  ETH: { priceBaseCents: 304_500, change24hPct: 1.18 },
  SOL: { priceBaseCents: 19_850, change24hPct: 6.15 },
};

const COINGECKO_SYMBOL_TO_ID: Record<string, string> = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
};

/**
 * Sincronizza i tassi di cambio (Frankfurter ECB) e le quotazioni Crypto (CoinGecko).
 * In assenza di rete o in ambiente sandbox/offline, applica un fallback deterministico
 * locale così il ricalcolo di `widget_snapshot` e del portafoglio WAC funziona sempre offline-first.
 */
export async function syncMarketRatesAndPrices(
  repo: DailyBudgetRepository,
  options?: { timeoutMs?: number }
): Promise<MarketSyncReport> {
  const timeoutMs = options?.timeoutMs ?? 2500;
  const syncedAt = Date.now();

  try {
    const [fxRes, cgRes] = await Promise.all([
      fetch('https://api.frankfurter.app/latest?from=EUR&to=USD,GBP,CHF', {
        signal: AbortSignal.timeout(timeoutMs),
      }),
      fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin,ethereum,solana&vs_currencies=eur&include_24hr_change=true',
        {
          signal: AbortSignal.timeout(timeoutMs),
        }
      ),
    ]);

    if (!fxRes.ok || !cgRes.ok) {
      throw new Error(`HTTP status FX=${fxRes.status} CG=${cgRes.status}`);
    }

    const fxData = (await fxRes.json()) as FrankfurterResponse;
    const cgData = (await cgRes.json()) as CoinGeckoResponse;

    let updatedRatesCount = 0;
    for (const [symbol, rateFromEur] of Object.entries(fxData.rates ?? {})) {
      if (typeof rateFromEur === 'number' && rateFromEur > 0) {
        const rateToEur = Number((1 / rateFromEur).toFixed(4));
        repo.upsertExchangeRate(`${symbol.toUpperCase()}_EUR`, rateToEur);
        updatedRatesCount += 1;
      }
    }

    let updatedCryptoCount = 0;
    const portfolio = repo.getCryptoPortfolioSummary();
    for (const item of portfolio.assets) {
      const sym = item.asset.symbol.toUpperCase();
      const cgId = COINGECKO_SYMBOL_TO_ID[sym];
      const entry = cgId ? cgData[cgId] : undefined;
      if (entry && typeof entry.eur === 'number' && entry.eur > 0) {
        const priceCents = Math.round(entry.eur * 100);
        const changePct =
          typeof entry.eur_24h_change === 'number'
            ? Number(entry.eur_24h_change.toFixed(2))
            : undefined;
        repo.updateCryptoAssetPrice(item.asset.id, priceCents, changePct);
        updatedCryptoCount += 1;
      }
    }

    repo.recomputeWidgetSnapshot();

    return {
      mode: 'live_api',
      updatedRatesCount,
      updatedCryptoCount,
      syncedAt,
      details: `Quotazioni live aggiornate con successo (${updatedRatesCount} cambi BCE Frankfurter, ${updatedCryptoCount} asset CoinGecko).`,
    };
  } catch {
    let updatedRatesCount = 0;
    for (const [pair, rate] of Object.entries(OFFLINE_FALLBACK_RATES)) {
      repo.upsertExchangeRate(pair, rate);
      updatedRatesCount += 1;
    }

    let updatedCryptoCount = 0;
    const portfolio = repo.getCryptoPortfolioSummary();
    for (const item of portfolio.assets) {
      const sym = item.asset.symbol.toUpperCase();
      const snap = OFFLINE_FALLBACK_CRYPTO_PRICES[sym];
      if (snap) {
        repo.updateCryptoAssetPrice(
          item.asset.id,
          snap.priceBaseCents,
          snap.change24hPct
        );
        updatedCryptoCount += 1;
      }
    }

    repo.recomputeWidgetSnapshot();

    return {
      mode: 'offline_fallback',
      updatedRatesCount,
      updatedCryptoCount,
      syncedAt,
      details: `Modalità Offline-First attiva: applicato snapshot locale deterministico (${updatedRatesCount} cambi valuta USD/GBP/CHF, ${updatedCryptoCount} quotazioni Crypto BTC/ETH/SOL).`,
    };
  }
}
