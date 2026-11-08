import React, { useState, useRef, useEffect } from 'react';
import type { StoragePersistenceState } from '@dailybudget/db';
import {
  Activity,
  Bitcoin,
  ChevronDown,
  Database,
  Download,
  FolderOpen,
  GitMerge,
  HandCoins,
  Lock,
  Menu,
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
import { DailyBudgetAppIcon } from './DailyBudgetAppIcon';

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
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') setIsMenuOpen(false);
    }
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false);
      }
    }
    if (isMenuOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isMenuOpen]);

  const executeAndClose = (fn: () => void) => {
    fn();
    setIsMenuOpen(false);
  };

  return (
    <>
      <header className={`persistence-bar ${isMobile ? 'mobile-compact' : ''}`}>
        <div className="brand-cluster">
          <div className="brand-mark-wrapper" title="DailyBudget">
            <DailyBudgetAppIcon size={isMobile ? 28 : 34} />
          </div>
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
              <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Database Locale • Sincronizzazione Offline
              </div>
            )}
          </div>

          <div className="file-pill" title="Stato del file di bilancio attivo">
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

        {/* Top-Right Unified Dropdown Menu */}
        <div className="header-menu-container" ref={menuRef}>
          <button
            id="btn-header-menu-trigger"
            type="button"
            className={`btn header-menu-trigger ${isMenuOpen ? 'active' : ''}`}
            onClick={() => setIsMenuOpen((prev) => !prev)}
            aria-expanded={isMenuOpen}
            aria-haspopup="true"
            aria-label="Menu opzioni e gestione file"
            title="Menu Opzioni, Persistenza, Dati e Visualizzazione"
          >
            <Menu size={17} />
            {!isMobile && <span>Menu</span>}
            <ChevronDown size={14} className={`menu-chevron ${isMenuOpen ? 'rotated' : ''}`} />
          </button>

          {isMenuOpen && (
            <div className="header-dropdown-menu" role="menu">
              {/* Summary / Active Workspace */}
              <div className="dropdown-file-summary">
                <div className="dropdown-file-title">Workspace Attivo</div>
                <div className="dropdown-file-details">
                  <span className={`dot-indicator ${persistence.hasBoundDiskHandle ? 'disk-bound' : ''}`} />
                  <span className="dropdown-file-name" title={persistence.fileName}>{persistence.fileName}</span>
                  <span className="dropdown-file-badge">
                    {persistence.hasBoundDiskHandle ? 'DISK-SYNC' : persistence.storageBackend}
                  </span>
                </div>
              </div>

              {/* Section 1: File & Persistence */}
              <div className="dropdown-section">
                <div className="dropdown-section-label">Archiviazione &amp; File .dbbudget</div>

                <button
                  id="btn-save-disk-dbbudget"
                  type="button"
                  className="dropdown-item primary-action"
                  role="menuitem"
                  onClick={() => executeAndClose(onSaveToLocalDisk)}
                  title={
                    persistence.hasBoundDiskHandle
                      ? 'Salva direttamente su Disco (File System Access API)'
                      : 'Collega e Salva .dbbudget su Disco'
                  }
                >
                  <Save size={16} />
                  <div className="dropdown-item-content">
                    <span className="dropdown-item-title">
                      {persistence.hasBoundDiskHandle ? 'Salva su Disco' : 'Collega / Salva su Disco'}
                    </span>
                    <span className="dropdown-item-desc">File System Access API</span>
                  </div>
                </button>

                <button
                  id="btn-open-dbbudget"
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => executeAndClose(onOpenLocalFile)}
                  title="Apri file .dbbudget dal disco"
                >
                  <FolderOpen size={16} />
                  <div className="dropdown-item-content">
                    <span className="dropdown-item-title">Apri file .dbbudget</span>
                    <span className="dropdown-item-desc">Carica bilancio dal dispositivo</span>
                  </div>
                </button>

                <button
                  id="btn-export-dbbudget"
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => executeAndClose(onDownloadDbBudget)}
                  title="Scarica file di backup .dbbudget"
                >
                  <Download size={16} />
                  <div className="dropdown-item-content">
                    <span className="dropdown-item-title">Esporta .dbbudget</span>
                    <span className="dropdown-item-desc">Scarica copia di backup</span>
                  </div>
                </button>

                <button
                  id="btn-merge-dbbudget"
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => executeAndClose(onMergeDbBudget)}
                  title="Sincronizza un altro file .dbbudget"
                >
                  <GitMerge size={16} />
                  <div className="dropdown-item-content">
                    <span className="dropdown-item-title">Sincronizza File</span>
                    <span className="dropdown-item-desc">Unisci modifiche recenti</span>
                  </div>
                </button>

                <button
                  id="btn-new-workspace"
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => executeAndClose(onNewCleanWorkspace)}
                  title="Crea un nuovo file .dbbudget vuoto"
                >
                  <Database size={16} />
                  <div className="dropdown-item-content">
                    <span className="dropdown-item-title">Nuovo Workspace</span>
                    <span className="dropdown-item-desc">Inizializza database vuoto</span>
                  </div>
                </button>

                <button
                  id="btn-reset-demo"
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => executeAndClose(onResetDemo)}
                  title="Ripristina dati dimostrativi completi"
                >
                  <RotateCcw size={16} />
                  <div className="dropdown-item-content">
                    <span className="dropdown-item-title">Ripristina Demo</span>
                    <span className="dropdown-item-desc">Ricarica dati di esempio</span>
                  </div>
                </button>
              </div>

              {/* Section 2: External Markets */}
              <div className="dropdown-section">
                <div className="dropdown-section-label">Dati Esterni</div>
                <button
                  id="btn-sync-markets"
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={() => executeAndClose(onSyncMarkets)}
                  title="Sincronizza Tassi BCE Frankfurter e Quotazioni Crypto CoinGecko"
                >
                  <RefreshCw size={16} />
                  <div className="dropdown-item-content">
                    <span className="dropdown-item-title">Sync Tassi &amp; Crypto</span>
                    <span className="dropdown-item-desc">BCE Frankfurter &amp; CoinGecko</span>
                  </div>
                </button>
              </div>

              {/* Section 3: Visual & Theme */}
              <div className="dropdown-section">
                <div className="dropdown-section-label">Visualizzazione &amp; Tema</div>

                <button
                  id="btn-toggle-theme"
                  type="button"
                  className="dropdown-item"
                  role="menuitem"
                  onClick={onToggleTheme}
                  title="Cambia Tema Chiaro/Scuro"
                >
                  {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                  <div className="dropdown-item-content">
                    <span className="dropdown-item-title">
                      Tema {theme === 'dark' ? 'Chiaro' : 'Scuro'}
                    </span>
                    <span className="dropdown-item-desc">
                      Attualmente: {theme === 'dark' ? 'Scuro' : 'Chiaro'}
                    </span>
                  </div>
                </button>

                <div className="dropdown-segmented-row">
                  <span className="dropdown-segmented-label">Layout:</span>
                  <div className="view-mode-pill" role="group" aria-label="Modalità di visualizzazione">
                    <button
                      type="button"
                      className={`view-mode-btn ${viewMode === 'auto' ? 'active' : ''}`}
                      onClick={() => onSetViewMode('auto')}
                      title="Modalità Auto (Adatta in base allo schermo)"
                    >
                      <Sparkles size={13} />
                      <span>Auto</span>
                    </button>
                    <button
                      type="button"
                      className={`view-mode-btn ${viewMode === 'mobile' ? 'active' : ''}`}
                      onClick={() => onSetViewMode('mobile')}
                      title="Stile Mobile (Menu sole icone, proporzioni smartphone, Bottom Nav)"
                    >
                      <Smartphone size={13} />
                      <span>Mobile</span>
                    </button>
                    <button
                      type="button"
                      className={`view-mode-btn ${viewMode === 'desktop' ? 'active' : ''}`}
                      onClick={() => onSetViewMode('desktop')}
                      title="Modalità Desktop (Multi-schermo a finestra espansa)"
                    >
                      <Monitor size={13} />
                      <span>Desktop</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Section 4: Security (if PIN enabled) */}
              {isPinEnabled && onLockSession && (
                <div className="dropdown-section">
                  <div className="dropdown-section-label">Sicurezza</div>
                  <button
                    id="btn-lock-session"
                    type="button"
                    className="dropdown-item danger-action"
                    role="menuitem"
                    onClick={() => executeAndClose(onLockSession)}
                    title="Blocca sessione con PIN"
                  >
                    <Lock size={16} />
                    <div className="dropdown-item-content">
                      <span className="dropdown-item-title">Blocca Sessione</span>
                      <span className="dropdown-item-desc">Richiede PIN per rientrare</span>
                    </div>
                  </button>
                </div>
              )}
            </div>
          )}
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
              Crypto ({counts.cryptoAssets})
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
            title={`Crypto (${counts.cryptoAssets})`}
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
