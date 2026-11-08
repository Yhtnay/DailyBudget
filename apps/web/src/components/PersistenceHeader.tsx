import React from 'react';
import type { StoragePersistenceState } from '@dailybudget/db';
import {
  Activity,
  Bitcoin,
  Database,
  Download,
  FolderOpen,
  GitMerge,
  HandCoins,
  Lock,
  Moon,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Sun,
  Users,
  Wallet,
} from 'lucide-react';

export type ActiveTab =
  | 'dashboard'
  | 'transactions'
  | 'tricount'
  | 'loans'
  | 'crypto'
  | 'settings';

interface PersistenceHeaderProps {
  persistence: StoragePersistenceState;
  theme: 'light' | 'dark';
  activeTab: ActiveTab;
  referenceDate: string;
  isPinEnabled?: boolean;
  onLockSession?: () => void;
  counts: {
    transactions: number;
    tricountGroups: number;
    loans: number;
    cryptoAssets: number;
  };
  onOpenLocalFile: () => void;
  onSaveToLocalDisk: () => void;
  onDownloadDbBudget: () => void;
  onMergeDbBudget: () => void;
  onNewCleanWorkspace: () => void;
  onResetDemo: () => void;
  onSyncMarkets: () => void;
  onToggleTheme: () => void;
  onSelectTab: (tab: ActiveTab) => void;
  onChangeReferenceDate: (nextDate: string) => void;
}

export function PersistenceHeader({
  persistence,
  theme,
  activeTab,
  referenceDate,
  counts,
  isPinEnabled,
  onLockSession,
  onOpenLocalFile,
  onSaveToLocalDisk,
  onDownloadDbBudget,
  onMergeDbBudget,
  onNewCleanWorkspace,
  onResetDemo,
  onSyncMarkets,
  onToggleTheme,
  onSelectTab,
  onChangeReferenceDate,
}: PersistenceHeaderProps) {
  return (
    <>
      <header className="persistence-bar">
        <div className="brand-cluster">
          <div className="brand-mark">DB</div>
          <div>
            <h1 className="brand-title">DailyBudget</h1>
            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
              SQLite-Wasm • OPFS • File System Access API
            </div>
          </div>

          <div className="file-pill" title="Stato del file SQLite .dbbudget attivo">
            <span
              className={`dot-indicator ${
                persistence.hasBoundDiskHandle ? 'disk-bound' : ''
              }`}
            />
            <span>{persistence.fileName}</span>
            <span>•</span>
            <span>{(persistence.byteSize / 1024).toFixed(1)} KB</span>
            <span>•</span>
            <span style={{ textTransform: 'uppercase' }}>
              {persistence.hasBoundDiskHandle
                ? 'DISK-SYNC'
                : persistence.storageBackend}
            </span>
          </div>
        </div>

        <div className="toolbar-actions">
          <button
            id="btn-open-dbbudget"
            type="button"
            className="btn"
            onClick={onOpenLocalFile}
          >
            <FolderOpen size={15} />
            Apri .dbbudget
          </button>

          <button
            id="btn-save-disk-dbbudget"
            type="button"
            className="btn btn-primary"
            onClick={onSaveToLocalDisk}
          >
            <Save size={15} />
            {persistence.hasBoundDiskHandle
              ? 'Salva su Disco'
              : 'Collega / Salva .dbbudget'}
          </button>

          <button
            id="btn-export-dbbudget"
            type="button"
            className="btn"
            onClick={onDownloadDbBudget}
            title="Scarica il file binario SQLite3 .dbbudget"
          >
            <Download size={15} />
            Esporta
          </button>

          <button
            id="btn-merge-dbbudget"
            type="button"
            className="btn"
            onClick={onMergeDbBudget}
            title="Sincronizza un altro file .dbbudget tramite Row-Level Last-Write-Wins (LWW)"
          >
            <GitMerge size={15} />
            Merge LWW .dbbudget
          </button>

          <button
            id="btn-new-workspace"
            type="button"
            className="btn"
            onClick={onNewCleanWorkspace}
            title="Crea un nuovo file .dbbudget vuoto"
          >
            <Database size={15} />
            Nuovo
          </button>

          <button
            id="btn-reset-demo"
            type="button"
            className="btn"
            onClick={onResetDemo}
            title="Ripristina dati dimostrativi completi"
          >
            <RotateCcw size={15} />
            Demo
          </button>

          <button
            id="btn-sync-markets"
            type="button"
            className="btn"
            onClick={onSyncMarkets}
            title="Sincronizza Tassi BCE Frankfurter e Quotazioni Crypto CoinGecko (con fallback offline)"
          >
            <RefreshCw size={15} />
            Sync Tassi &amp; Crypto
          </button>

          {isPinEnabled && onLockSession && (
            <button
              id="btn-lock-session"
              type="button"
              className="btn"
              onClick={onLockSession}
              title="Blocca sessione con PIN"
              aria-label="Blocca sessione con PIN"
            >
              <Lock size={15} />
              Blocca
            </button>
          )}

          <button
            id="btn-toggle-theme"
            type="button"
            className="btn"
            onClick={onToggleTheme}
            aria-label="Cambia Tema Chiaro/Scuro"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      <nav className="nav-strip" aria-label="Navigazione Moduli">
        <div className="nav-tabs">
          <button
            id="tab-dashboard"
            type="button"
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => onSelectTab('dashboard')}
          >
            <Activity size={16} />
            Dashboard &amp; DailyBudget
          </button>

          <button
            id="tab-transactions"
            type="button"
            className={`nav-tab ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => onSelectTab('transactions')}
          >
            <Wallet size={16} />
            Conti, Split &amp; Transazioni ({counts.transactions})
          </button>

          <button
            id="tab-tricount"
            type="button"
            className={`nav-tab ${activeTab === 'tricount' ? 'active' : ''}`}
            onClick={() => onSelectTab('tricount')}
          >
            <Users size={16} />
            Tricount Gruppi ({counts.tricountGroups})
          </button>

          <button
            id="tab-loans"
            type="button"
            className={`nav-tab ${activeTab === 'loans' ? 'active' : ''}`}
            onClick={() => onSelectTab('loans')}
          >
            <HandCoins size={16} />
            Prestiti &amp; Debiti ({counts.loans})
          </button>

          <button
            id="tab-crypto"
            type="button"
            className={`nav-tab ${activeTab === 'crypto' ? 'active' : ''}`}
            onClick={() => onSelectTab('crypto')}
          >
            <Bitcoin size={16} />
            Crypto WAC ({counts.cryptoAssets})
          </button>

          <button
            id="tab-settings"
            type="button"
            className={`nav-tab ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => onSelectTab('settings')}
          >
            <Settings size={16} />
            Impostazioni &amp; Sicurezza
          </button>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <label
            htmlFor="sim-reference-date"
            style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
          >
            Data Riferimento:
          </label>
          <input
            id="sim-reference-date"
            type="date"
            className="input mono-num"
            style={{ width: 'auto', padding: '0.28rem 0.5rem', fontSize: '0.78rem' }}
            value={referenceDate}
            onChange={(e) => {
              const nextDate = e.target.value;
              if (nextDate) {
                onChangeReferenceDate(nextDate);
              }
            }}
          />
        </div>
      </nav>
    </>
  );
}
