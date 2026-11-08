import React, { useEffect, useState } from 'react';
import { formatCents, parseMajorToCents } from '@dailybudget/core';
import type {
  AccountRow,
  DailyBudgetRepository,
  DashboardSummary,
} from '@dailybudget/db';
import {
  ArrowDownRight,
  ArrowUpRight,
  Coins,
  HardDrive,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { InfoTip } from './InfoTip';

interface CryptoTabProps {
  repo: DailyBudgetRepository;
  dashboard: DashboardSummary;
  accounts: AccountRow[];
  referenceDate: string;
  onRefresh: () => Promise<void>;
  onSyncMarkets: () => Promise<void>;
  onNotify: (msg: string) => void;
}

export function CryptoTab({
  repo,
  dashboard,
  accounts,
  referenceDate,
  onRefresh,
  onSyncMarkets,
  onNotify,
}: CryptoTabProps) {
  const { cryptoSummary } = dashboard;

  const [cryptoAssetId, setCryptoAssetId] = useState<string>(
    () => cryptoSummary.assets[0]?.asset.id ?? ''
  );
  const [cryptoTxType, setCryptoTxType] = useState<
    'buy' | 'sell' | 'staking_reward' | 'transfer_in' | 'transfer_out'
  >('buy');
  const [cryptoQty, setCryptoQty] = useState<string>('0.02500000');
  const [cryptoPriceMajor, setCryptoPriceMajor] = useState<string>('84500.00');
  const [cryptoFeeMajor, setCryptoFeeMajor] = useState<string>('2.50');
  const [cryptoNotes, setCryptoNotes] = useState<string>('');
  const [cryptoLinkedAccountId, setCryptoLinkedAccountId] =
    useState<string>('');
  const [cryptoCountPac, setCryptoCountPac] = useState<boolean>(false);
  const [priceEditMap, setPriceEditMap] = useState<Record<string, string>>({});

  useEffect(() => {
    if (cryptoSummary.assets.length > 0 && !cryptoAssetId) {
      setCryptoAssetId(cryptoSummary.assets[0].asset.id);
    }
  }, [cryptoSummary.assets, cryptoAssetId]);

  return (
    <>
      {/* Crypto KPIs */}
      <div className="metric-tile-group">
        <div className="card">
          <div className="metric-label">Valore Attuale Portfolio</div>
          <div className="metric-value mono-num" style={{ fontSize: '1.45rem' }}>
            {formatCents(cryptoSummary.totalValueCents)}
          </div>
        </div>

        <div className="card">
          <div className="metric-label" style={{ display: 'flex', alignItems: 'center' }}>
            Costo Storico di Carico
            <InfoTip
              title="Costo Storico"
              text="Calcolato sul Prezzo Medio Ponderato di Carico (WAC) per tutte le transazioni di acquisto."
            />
          </div>
          <div className="metric-value mono-num" style={{ fontSize: '1.45rem' }}>
            {formatCents(cryptoSummary.totalCostBasisCents)}
          </div>
        </div>

        <div className="card">
          <div className="metric-label">P&amp;L Latente</div>
          <div
            className="metric-value mono-num"
            style={{
              fontSize: '1.45rem',
              color:
                cryptoSummary.totalUnrealizedPnlCents >= 0
                  ? 'var(--status-safe)'
                  : 'var(--status-danger)',
            }}
          >
            {cryptoSummary.totalUnrealizedPnlCents >= 0 ? '+' : ''}
            {formatCents(cryptoSummary.totalUnrealizedPnlCents)} (
            {cryptoSummary.totalUnrealizedPnlPct.toFixed(2)}%)
          </div>
        </div>

        <div className="card">
          <div className="metric-label">P&amp;L Realizzato</div>
          <div
            className="metric-value mono-num"
            style={{
              fontSize: '1.45rem',
              color:
                cryptoSummary.totalRealizedPnlCents >= 0
                  ? 'var(--status-safe)'
                  : 'var(--status-danger)',
            }}
          >
            {cryptoSummary.totalRealizedPnlCents >= 0 ? '+' : ''}
            {formatCents(cryptoSummary.totalRealizedPnlCents)}
          </div>
        </div>
      </div>

      <div className="panel-pair desktop-split-view">
        {/* Tabella Holdings */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Coins size={17} />
                Asset in Portafoglio
                <InfoTip
                  title="Portafoglio Crypto"
                  text="Quantità con precisione fino a 8 decimali, Prezzo Medio Ponderato di Carico (PMC) e monitoraggio plusvalenze in tempo reale."
                />
              </h2>
            </div>

            <button
              id="btn-sync-markets-crypto"
              type="button"
              className="btn btn-sm"
              onClick={onSyncMarkets}
            >
              <RefreshCw size={14} /> Sync Tassi &amp; Crypto
            </button>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Quantità</th>
                  <th>Prezzo Medio (PMC)</th>
                  <th>Prezzo Mercato</th>
                  <th>Valore Attuale</th>
                  <th>P&amp;L Latente</th>
                  <th>P&amp;L Realizzato</th>
                </tr>
              </thead>
              <tbody>
                {cryptoSummary.assets.map(({ asset, metrics }) => (
                  <tr key={asset.id}>
                    <td>
                      <strong>{asset.symbol}</strong>
                      <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                        {asset.name}
                      </div>
                    </td>
                    <td className="mono-num">
                      {metrics.totalQuantity.toFixed(6)}
                    </td>
                    <td className="mono-num">
                      {formatCents(metrics.averageBuyPriceCents)}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <input
                          aria-label={`Prezzo ${asset.symbol}`}
                          className="input mono-num"
                          style={{ width: '115px', padding: '0.35rem 0.5rem', fontSize: '0.88rem' }}
                          value={
                            priceEditMap[asset.id] ??
                            (asset.current_price_base / 100).toFixed(2)
                          }
                          onChange={(e) =>
                            setPriceEditMap((prev) => ({
                              ...prev,
                              [asset.id]: e.target.value,
                            }))
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          title="Aggiorna quotazione"
                          onClick={async () => {
                            const raw =
                              priceEditMap[asset.id] ??
                              (asset.current_price_base / 100).toFixed(2);
                            const nextCents = parseMajorToCents(raw);
                            if (nextCents <= 0) return;
                            repo.updateCryptoAssetPrice(asset.id, nextCents);
                            await onRefresh();
                          }}
                        >
                          <RefreshCw size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="mono-num" style={{ fontWeight: 700 }}>
                      {formatCents(metrics.currentValueCents)}
                    </td>
                    <td
                      className="mono-num"
                      style={{
                        fontWeight: 600,
                        color:
                          metrics.unrealizedPnlCents >= 0
                            ? 'var(--status-safe)'
                            : 'var(--status-danger)',
                      }}
                    >
                      {metrics.unrealizedPnlCents >= 0 ? (
                        <ArrowUpRight size={13} style={{ verticalAlign: 'middle' }} />
                      ) : (
                        <ArrowDownRight size={13} style={{ verticalAlign: 'middle' }} />
                      )}
                      {formatCents(metrics.unrealizedPnlCents)} (
                      {metrics.unrealizedPnlPct.toFixed(1)}%)
                    </td>
                    <td className="mono-num">
                      {formatCents(metrics.realizedPnlCents)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Form Operazione Crypto */}
        <section className="card">
          <div className="card-header">
            <div>
              <h2 className="card-title">
                <Plus size={17} /> Registra Operazione Crypto
                <InfoTip
                  title="Operazioni Crypto"
                  text="Registra acquisto, vendita (con calcolo automatico plusvalenze/minusvalenze) o rendimento da staking. L'acquisto può alimentare un PAC di risparmio."
                />
              </h2>
            </div>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (!cryptoAssetId) return;
              repo.createCryptoTransaction({
                assetId: cryptoAssetId,
                linkedAccountId: cryptoLinkedAccountId || null,
                type: cryptoTxType,
                quantity: cryptoQty,
                pricePerUnitBaseCents:
                  cryptoTxType === 'staking_reward'
                    ? 0
                    : parseMajorToCents(cryptoPriceMajor),
                feeBaseCents: parseMajorToCents(cryptoFeeMajor),
                countInBudgetAsPac:
                  cryptoTxType === 'buy' && Boolean(cryptoLinkedAccountId)
                    ? cryptoCountPac
                    : false,
                date: referenceDate,
                notes: cryptoNotes.trim() || undefined,
              });
              setCryptoNotes('');
              await onRefresh();
              onNotify(
                cryptoLinkedAccountId
                  ? 'Operazione Crypto e movimento bancario collegato registrati con successo.'
                  : 'Operazione Crypto registrata con successo.'
              );
            }}
            style={{ display: 'flex', flexDirection: 'column', gap: '0.8rem' }}
          >
            <div className="form-grid">
              <div className="field">
                <label htmlFor="crypto-asset">Asset</label>
                <select
                  id="crypto-asset"
                  className="select"
                  value={cryptoAssetId}
                  onChange={(e) => setCryptoAssetId(e.target.value)}
                >
                  {cryptoSummary.assets.map(({ asset }) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.symbol} — {asset.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="crypto-tx-type">Tipo Operazione</label>
                <select
                  id="crypto-tx-type"
                  className="select"
                  value={cryptoTxType}
                  onChange={(e) =>
                    setCryptoTxType(
                      e.target.value as
                        | 'buy'
                        | 'sell'
                        | 'staking_reward'
                        | 'transfer_in'
                        | 'transfer_out'
                    )
                  }
                >
                  <option value="buy">Acquisto</option>
                  <option value="sell">Vendita</option>
                  <option value="staking_reward">Rendimento Staking</option>
                  <option value="transfer_in">Trasferimento in Entrata</option>
                  <option value="transfer_out">Trasferimento in Uscita</option>
                </select>
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="crypto-qty">Quantità Coin</label>
                <input
                  id="crypto-qty"
                  type="text"
                  inputMode="decimal"
                  className="input mono-num"
                  value={cryptoQty}
                  onChange={(e) => setCryptoQty(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="crypto-price">Prezzo Unitario (€)</label>
                <input
                  id="crypto-price"
                  type="text"
                  inputMode="decimal"
                  disabled={cryptoTxType === 'staking_reward'}
                  className="input mono-num"
                  value={cryptoPriceMajor}
                  onChange={(e) => setCryptoPriceMajor(e.target.value)}
                />
              </div>
            </div>

            <div className="form-grid">
              <div className="field">
                <label htmlFor="crypto-fee">Commissioni Network (€)</label>
                <input
                  id="crypto-fee"
                  type="text"
                  inputMode="decimal"
                  className="input mono-num"
                  value={cryptoFeeMajor}
                  onChange={(e) => setCryptoFeeMajor(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="crypto-linked-account">
                  Conto Bancario Collegato
                </label>
                <select
                  id="crypto-linked-account"
                  className="select"
                  value={cryptoLinkedAccountId}
                  onChange={(e) => setCryptoLinkedAccountId(e.target.value)}
                >
                  <option value="">-- Nessun movimento bancario automatico --</option>
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({formatCents(a.cached_balance, a.currency)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="field">
              <label htmlFor="crypto-notes">Note</label>
              <input
                id="crypto-notes"
                className="input"
                placeholder="es. PAC mensile / Staking"
                value={cryptoNotes}
                onChange={(e) => setCryptoNotes(e.target.value)}
              />
            </div>

            <label
              style={{
                fontSize: '0.88rem',
                display: 'flex',
                alignItems: 'center',
                gap: '0.45rem',
                cursor:
                  cryptoTxType === 'buy' && cryptoLinkedAccountId
                    ? 'pointer'
                    : 'not-allowed',
                opacity:
                  cryptoTxType === 'buy' && cryptoLinkedAccountId ? 1 : 0.6,
              }}
            >
              <input
                id="crypto-count-pac"
                type="checkbox"
                disabled={!(cryptoTxType === 'buy' && cryptoLinkedAccountId)}
                checked={cryptoCountPac}
                onChange={(e) => setCryptoCountPac(e.target.checked)}
              />
              Includi acquisto nel DailyBudget (PAC di risparmio)
            </label>

            <button type="submit" className="btn btn-primary">
              <HardDrive size={15} /> Registra nel Portfolio Crypto
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
