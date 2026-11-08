import React, { useCallback, useEffect, useRef, useState } from 'react';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {
  clearOpfsWorkspace,
  DailyBudgetRepository,
  isFileSystemAccessSupported,
  isOpfsSupported,
  loadBytesFromOpfs,
  mergeExternalDbBudgetBinary,
  openLocalDbBudgetFile,
  saveAsLocalDbBudgetFile,
  saveBytesToOpfs,
  seedDemoWorkspace,
  seedMinimalWorkspace,
  syncMarketRatesAndPrices,
  triggerBrowserDownload,
  writeBytesToDiskHandle,
  type AccountRow,
  type CategoryRow,
  type DashboardSummary,
  type EnrichedRecurringRule,
  type EnrichedTransaction,
  type FileSystemFileHandleLike,
  type LoanRow,
  type StoragePersistenceState,
  type TagRow,
  type TricountGroupDetail,
} from '@dailybudget/db';
import { CryptoTab } from './components/CryptoTab';
import { DashboardTab } from './components/DashboardTab';
import { LoansTab } from './components/LoansTab';
import { PersistenceHeader, type ActiveTab } from './components/PersistenceHeader';
import { TransactionsTab } from './components/TransactionsTab';
import { TricountTab } from './components/TricountTab';

export default function App() {
  const repoRef = useRef<DailyBudgetRepository | null>(null);
  const diskHandleRef = useRef<FileSystemFileHandleLike | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isReady, setIsReady] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [referenceDate, setReferenceDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  const [persistence, setPersistence] = useState<StoragePersistenceState>({
    fileName: 'active_workspace.dbbudget',
    opfsSupported: isOpfsSupported(),
    fileSystemAccessSupported: isFileSystemAccessSupported(),
    hasBoundDiskHandle: false,
    lastSavedAt: null,
    storageBackend: 'memory',
    byteSize: 0,
  });

  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [recurringRules, setRecurringRules] = useState<EnrichedRecurringRule[]>([]);
  const [tricountGroups, setTricountGroups] = useState<TricountGroupDetail[]>([]);
  const [loans, setLoans] = useState<LoanRow[]>([]);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const syncAndRefresh = useCallback(
    async (
      repo: DailyBudgetRepository,
      options?: { skipPersist?: boolean; customFileName?: string; refDate?: string }
    ) => {
      const targetDate = options?.refDate ?? repo.getReferenceDate();
      setDashboard(repo.getDashboardSummary(targetDate));
      setAccounts(repo.getAccounts());
      setCategories(repo.getCategories());
      setTags(repo.getTags());
      setTransactions(repo.getTransactionsWithDetails());
      setRecurringRules(repo.getRecurringRules());
      setTricountGroups(repo.getTricountGroupsWithDetails());
      setLoans(repo.getLoans());

      const binary = repo.exportBinary();
      if (!options?.skipPersist) {
        const backend = await saveBytesToOpfs(binary);
        if (diskHandleRef.current) {
          await writeBytesToDiskHandle(diskHandleRef.current, binary);
        }
        setPersistence((prev) => ({
          ...prev,
          fileName: options?.customFileName ?? prev.fileName,
          hasBoundDiskHandle: Boolean(diskHandleRef.current),
          lastSavedAt: Date.now(),
          storageBackend: backend,
          byteSize: binary.byteLength,
        }));
      } else {
        setPersistence((prev) => ({
          ...prev,
          fileName: options?.customFileName ?? prev.fileName,
          hasBoundDiskHandle: Boolean(diskHandleRef.current),
          byteSize: binary.byteLength,
        }));
      }
    },
    []
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const existing = await loadBytesFromOpfs();
        if (existing && mounted) {
          const repo = await DailyBudgetRepository.fromBinary(existing.bytes, { wasmUrl, referenceDate });
          repoRef.current = repo;
          await syncAndRefresh(repo, { skipPersist: true });
          setPersistence((prev) => ({
            ...prev,
            storageBackend: existing.backend,
            lastSavedAt: Date.now(),
            byteSize: existing.bytes.byteLength,
          }));
          setIsReady(true);
          return;
        }
        const repo = await DailyBudgetRepository.createEmpty({ wasmUrl, referenceDate });
        seedDemoWorkspace(repo, referenceDate);
        repoRef.current = repo;
        if (mounted) {
          await syncAndRefresh(repo, { customFileName: 'andrea_demo.dbbudget' });
          setIsReady(true);
        }
      } catch (err) {
        console.error('Failed to initialize SQLite-Wasm engine:', err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleOpenLocalFile = async () => {
    try {
      const opened = await openLocalDbBudgetFile();
      if (!opened) return;
      const repo = await DailyBudgetRepository.fromBinary(opened.bytes, { wasmUrl, referenceDate });
      repoRef.current = repo;
      diskHandleRef.current = opened.fileHandle;
      await syncAndRefresh(repo, { customFileName: opened.fileName });
      setStatusBanner(
        opened.fileHandle
          ? `File "${opened.fileName}" collegato in lettura/scrittura diretta su disco (File System Access API).`
          : `File "${opened.fileName}" importato nel workspace OPFS locale.`
      );
    } catch (err) {
      setStatusBanner((err as Error).message);
    }
  };

  const handleSaveToLocalDisk = async () => {
    const repo = repoRef.current;
    if (!repo) return;
    const binary = repo.exportBinary();
    if (diskHandleRef.current && (await writeBytesToDiskHandle(diskHandleRef.current, binary))) {
      setPersistence((prev) => ({ ...prev, lastSavedAt: Date.now(), byteSize: binary.byteLength }));
      setStatusBanner(`Salvataggio diretto completato su "${persistence.fileName}" (${(binary.byteLength / 1024).toFixed(1)} KB).`);
      return;
    }
    const saved = await saveAsLocalDbBudgetFile(binary, persistence.fileName);
    if (saved) {
      diskHandleRef.current = saved.fileHandle;
      setPersistence((prev) => ({
        ...prev,
        fileName: saved.fileName,
        hasBoundDiskHandle: Boolean(saved.fileHandle),
        lastSavedAt: Date.now(),
        byteSize: binary.byteLength,
      }));
      setStatusBanner(`File SQLite "${saved.fileName}" salvato sul disco locale (${(binary.byteLength / 1024).toFixed(1)} KB).`);
    }
  };

  const handleDownloadDbBudget = () => {
    if (!repoRef.current) return;
    triggerBrowserDownload(repoRef.current.exportBinary(), persistence.fileName);
    setStatusBanner(`Download di "${persistence.fileName}" avviato.`);
  };

  const handleResetDemo = async () => {
    await clearOpfsWorkspace();
    diskHandleRef.current = null;
    const repo = await DailyBudgetRepository.createEmpty({ wasmUrl, referenceDate });
    seedDemoWorkspace(repo, referenceDate);
    repoRef.current = repo;
    await syncAndRefresh(repo, { customFileName: 'andrea_demo.dbbudget' });
    setStatusBanner('Workspace Demo ripristinato e sincronizzato su OPFS.');
  };

  const handleNewCleanWorkspace = async () => {
    await clearOpfsWorkspace();
    diskHandleRef.current = null;
    const repo = await DailyBudgetRepository.createEmpty({ wasmUrl, referenceDate });
    seedMinimalWorkspace(repo);
    repoRef.current = repo;
    await syncAndRefresh(repo, { customFileName: 'nuovo_workspace.dbbudget' });
    setStatusBanner('Creato nuovo workspace pulito (.dbbudget).');
  };

  const handleSyncMarkets = async () => {
    if (!repoRef.current) return;
    const report = await syncMarketRatesAndPrices(repoRef.current);
    await syncAndRefresh(repoRef.current);
    setStatusBanner(report.details);
  };

  const handleMergeDbBudget = async () => {
    if (!repoRef.current) return;
    try {
      const opened = await openLocalDbBudgetFile();
      if (!opened) return;
      const res = await mergeExternalDbBudgetBinary(repoRef.current, opened.bytes, { wasmUrl });
      await syncAndRefresh(repoRef.current);
      setStatusBanner(`Merge LWW completato da "${opened.fileName}": ${res.mergedRowsCount} righe sincronizzate.`);
    } catch (err) {
      setStatusBanner((err as Error).message);
    }
  };

  if (!isReady || !dashboard || !repoRef.current) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: '0.75rem' }}>
        <div className="brand-mark">DB</div>
        <p style={{ fontWeight: 600 }}>Inizializzazione motore SQLite-Wasm &amp; OPFS (.dbbudget)...</p>
      </div>
    );
  }

  const refreshActiveRepo = async () => {
    if (repoRef.current) await syncAndRefresh(repoRef.current);
  };

  return (
    <div className="app-shell">
      <PersistenceHeader
        persistence={persistence}
        theme={theme}
        activeTab={activeTab}
        referenceDate={referenceDate}
        counts={{
          transactions: transactions.length,
          tricountGroups: tricountGroups.length,
          loans: loans.length,
          cryptoAssets: dashboard.cryptoSummary.assets.length,
        }}
        onOpenLocalFile={handleOpenLocalFile}
        onSaveToLocalDisk={handleSaveToLocalDisk}
        onDownloadDbBudget={handleDownloadDbBudget}
        onMergeDbBudget={handleMergeDbBudget}
        onNewCleanWorkspace={handleNewCleanWorkspace}
        onResetDemo={handleResetDemo}
        onSyncMarkets={handleSyncMarkets}
        onToggleTheme={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
        onSelectTab={setActiveTab}
        onChangeReferenceDate={async (nextDate) => {
          if (!repoRef.current) return;
          setReferenceDate(nextDate);
          repoRef.current.setReferenceDate(nextDate);
          await syncAndRefresh(repoRef.current, { refDate: nextDate });
        }}
      />

      <main className="main-container">
        {statusBanner && (
          <div className="banner-notice" role="status">
            <span>{statusBanner}</span>
            <button type="button" className="btn btn-sm" onClick={() => setStatusBanner(null)}>Chiudi</button>
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardTab repo={repoRef.current} dashboard={dashboard} accounts={accounts} transactions={transactions} referenceDate={referenceDate} onRefresh={refreshActiveRepo} onNotify={setStatusBanner} onNavigateTab={setActiveTab} />
        )}
        {activeTab === 'transactions' && (
          <TransactionsTab repo={repoRef.current} accounts={accounts} categories={categories} tags={tags} transactions={transactions} recurringRules={recurringRules} referenceDate={referenceDate} onRefresh={refreshActiveRepo} onNotify={setStatusBanner} />
        )}
        {activeTab === 'tricount' && (
          <TricountTab repo={repoRef.current} dashboard={dashboard} tricountGroups={tricountGroups} accounts={accounts} categories={categories} referenceDate={referenceDate} onRefresh={refreshActiveRepo} onNotify={setStatusBanner} />
        )}
        {activeTab === 'loans' && (
          <LoansTab repo={repoRef.current} loans={loans} accounts={accounts} referenceDate={referenceDate} onRefresh={refreshActiveRepo} onNotify={setStatusBanner} />
        )}
        {activeTab === 'crypto' && (
          <CryptoTab repo={repoRef.current} dashboard={dashboard} accounts={accounts} referenceDate={referenceDate} onRefresh={refreshActiveRepo} onSyncMarkets={handleSyncMarkets} onNotify={setStatusBanner} />
        )}
      </main>
    </div>
  );
}
