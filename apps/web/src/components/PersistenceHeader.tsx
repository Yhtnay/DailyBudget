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
  Monitor,
  Moon,
  RefreshCw,
  RotateCcw,
  Save,
  Settings,
  Smartphone,
  Sparkles,
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

export type ViewMode = 'auto' | 'mobile' | 'desktop';

interface PersistenceHeaderProps {
  persistence: StoragePersistenceState;
  theme: 'light' | 'dark';
  activeTab: ActiveTab;
  referenceDate: string;
  viewMode: ViewMode;
  effectiveMode: 'mobile' | 'desktop';
  onSetViewMode: (mode: ViewMode) => void;
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
  viewMode,
  effectiveMode,
  onSetViewMode,
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
  const isMobile = effectiveMode === 'mobile';

  return (
    <>
      <header className={`persistence-bar ${isMobile ? 'mobile-compact' : ''}`}>
        <div className="brand-cluster">
          <div className="brand-mark">DB</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <h1 className="brand-title">DailyBudget</h1>
              {!isMobile && (
                <span className="pin-beta-pill" style={{ fontSize: '0.62rem', padding: '0.1rem 0.45rem' }}>
                  v0.2.0
                </span>
              )}
            </div>
            {!isMobile && (
              <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
                SQLite-Wasm • OPFS • File System Access API
              </div>
            )}
          </div>

          <div className="file-pill" title="Stato del file SQLite .dbbudget attivo">
            <span
              className={`dot-indicator ${
                persistence.hasBoundDiskHandle ? 'disk-bound' : ''
              }`}
            />
            <span className="file-pill-name">{persistence.fileName}</span>
            {!isMobile && (
              <>
                <span>•</span>
                <span>{(persistence.byteSize / 1024).toFixed(1)} KB</span>
                <span>•</span>
                <span style={{ textTransform: 'uppercase' }}>
                  {persistence.hasBoundDiskHandle
                    ? 'DISK-SYNC'
                    : persistence.storageBackend}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="toolbar-actions">
          {/* View Mode Switcher Pill */}
          <div className="view-mode-pill" role="group" aria-label="Modalità di visualizzazione">
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'auto' ? 'active' : ''}`}
              onClick={() => onSetViewMode('auto')}
              title="Modalità Auto (Adatta in base allo schermo)"
              aria-label="Modalità Auto"
            >
              <Sparkles size={13} />
              {!isMobile && <span>Auto</span>}
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'mobile' ? 'active' : ''}`}
              onClick={() => onSetViewMode('mobile')}
              title="Stile Mobile (Menu sole icone, proporzioni smartphone, Bottom Nav)"
              aria-label="Stile Mobile"
            >
              <Smartphone size={13} />
              {!isMobile && <span>Mobile</span>}
            </button>
            <button
              type="button"
              className={`view-mode-btn ${viewMode === 'desktop' ? 'active' : ''}`}
              onClick={() => onSetViewMode('desktop')}
              title="Modalità Desktop (Multi-schermo a finestra espansa)"
              aria-label="Modalità Desktop"
            >
              <Monitor size={13} />
              {!isMobile && <span>Desktop</span>}
            </button>
          </div>

          <button
            id="btn-open-dbbudget"
            type="button"
            className="btn"
            onClick={onOpenLocalFile}
            title="Apri file binario .dbbudget dal disco"
            aria-label="Apri .dbbudget"
          >
            <FolderOpen size={15} />
            {!isMobile && <span>Apri .dbbudget</span>}
          </button>

          <button
            id="btn-save-disk-dbbudget"
            type="button"
            className="btn btn-primary"
            onClick={onSaveToLocalDisk}
            title={
              persistence.hasBoundDiskHandle
                ? 'Salva direttamente su Disco (File System Access API)'
                : 'Collega e Salva .dbbudget su Disco'
            }
            aria-label="Salva su Disco"
          >
            <Save size={15} />
            {!isMobile && (
              <span>
                {persistence.hasBoundDiskHandle
                  ? 'Salva su Disco'
                  : 'Collega / Salva .dbbudget'}
              </span>
            )}
          </button>

          <button
            id="btn-export-dbbudget"
            type="button"
            className="btn"
            onClick={onDownloadDbBudget}
            title="Scarica il file binario SQLite3 .dbbudget"
            aria-label="Esporta .dbbudget"
          >
            <Download size={15} />
            {!isMobile && <span>Esporta</span>}
          </button>

          <button
            id="btn-merge-dbbudget"
            type="button"
            className="btn"
            onClick={onMergeDbBudget}
            title="Sincronizza un altro file .dbbudget tramite Row-Level Last-Write-Wins (LWW)"
            aria-label="Merge LWW .dbbudget"
          >
            <GitMerge size={15} />
            {!isMobile && <span>Merge LWW</span>}
          </button>

          <button
            id="btn-new-workspace"
            type="button"
            className="btn"
            onClick={onNewCleanWorkspace}
            title="Crea un nuovo file .dbbudget vuoto"
            aria-label="Nuovo workspace"
          >
            <Database size={15} />
            {!isMobile && <span>Nuovo</span>}
          </button>

          <button
            id="btn-reset-demo"
            type="button"
            className="btn"
            onClick={onResetDemo}
            title="Ripristina dati dimostrativi completi"
            aria-label="Demo dati"
          >
            <RotateCcw size={15} />
            {!isMobile && <span>Demo</span>}
          </button>

          <button
            id="btn-sync-markets"
            type="button"
            className="btn"
            onClick={onSyncMarkets}
            title="Sincronizza Tassi BCE Frankfurter e Quotazioni Crypto CoinGecko"
            aria-label="Sync Tassi e Crypto"
          >
            <RefreshCw size={15} />
            {!isMobile && <span>Sync Tassi</span>}
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
              {!isMobile && <span>Blocca</span>}
            </button>
          )}

          <button
            id="btn-toggle-theme"
            type="button"
            className="btn"
            onClick={onToggleTheme}
            aria-label="Cambia Tema Chiaro/Scuro"
            title="Cambia Tema Chiaro/Scuro"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      {/* Desktop Navigation Tab Bar */}
      {!isMobile && (
        <nav className="nav-strip" aria-label="Navigazione Moduli Desktop">
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
      )}

      {/* Mobile Reference Date Bar */}
      {isMobile && (
        <div className="mobile-reference-bar">
          <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
            Data Simulazione:
          </span>
          <input
            id="sim-reference-date-mobile"
            type="date"
            className="input mono-num"
            style={{ width: 'auto', padding: '0.2rem 0.45rem', fontSize: '0.76rem' }}
            value={referenceDate}
            onChange={(e) => {
              const nextDate = e.target.value;
              if (nextDate) {
                onChangeReferenceDate(nextDate);
              }
            }}
          />
        </div>
      )}

      {/* Mobile Bottom Navigation Bar (Sole Icone, Pinned at Bottom) */}
      {isMobile && (
        <nav className="mobile-bottom-nav" aria-label="Navigazione Moduli Mobile">
          <button
            id="mobile-nav-dashboard"
            type="button"
            className={`bottom-nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => onSelectTab('dashboard')}
            title="Dashboard & DailyBudget"
            aria-label="Dashboard"
          >
            <Activity size={22} />
          </button>

          <button
            id="mobile-nav-transactions"
            type="button"
            className={`bottom-nav-item ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => onSelectTab('transactions')}
            title={`Transazioni (${counts.transactions})`}
            aria-label="Transazioni"
          >
            <div className="icon-with-badge">
              <Wallet size={22} />
              {counts.transactions > 0 && <span className="bottom-nav-dot" />}
            </div>
          </button>

          <button
            id="mobile-nav-tricount"
            type="button"
            className={`bottom-nav-item ${activeTab === 'tricount' ? 'active' : ''}`}
            onClick={() => onSelectTab('tricount')}
            title={`Tricount (${counts.tricountGroups})`}
            aria-label="Tricount"
          >
            <div className="icon-with-badge">
              <Users size={22} />
              {counts.tricountGroups > 0 && <span className="bottom-nav-dot" />}
            </div>
          </button>

          <button
            id="mobile-nav-loans"
            type="button"
            className={`bottom-nav-item ${activeTab === 'loans' ? 'active' : ''}`}
            onClick={() => onSelectTab('loans')}
            title={`Prestiti (${counts.loans})`}
            aria-label="Prestiti"
          >
            <div className="icon-with-badge">
              <HandCoins size={22} />
              {counts.loans > 0 && <span className="bottom-nav-dot" />}
            </div>
          </button>

          <button
            id="mobile-nav-crypto"
            type="button"
            className={`bottom-nav-item ${activeTab === 'crypto' ? 'active' : ''}`}
            onClick={() => onSelectTab('crypto')}
            title={`Crypto WAC (${counts.cryptoAssets})`}
            aria-label="Crypto"
          >
            <div className="icon-with-badge">
              <Bitcoin size={22} />
              {counts.cryptoAssets > 0 && <span className="bottom-nav-dot" />}
            </div>
          </button>

          <button
            id="mobile-nav-settings"
            type="button"
            className={`bottom-nav-item ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => onSelectTab('settings')}
            title="Impostazioni & PIN"
            aria-label="Impostazioni"
          >
            <Settings size={22} />
          </button>
        </nav>
      )}
    </>
  );
}
