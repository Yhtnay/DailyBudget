import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import {
  doesTransactionAffectBudget,
  formatCents,
  parseMajorToCents,
  validateTransactionSplits,
  type RecurringFrequency,
  type SplitMode,
  type TransactionType,
} from '@dailybudget/core';
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
  type AccountType,
  type AttachmentRow,
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
import {
  Activity,
  ArrowDownRight,
  ArrowRightLeft,
  ArrowUpRight,
  Bitcoin,
  CheckCircle2,
  Coins,
  Database,
  Download,
  FileSpreadsheet,
  FolderOpen,
  GitMerge,
  HandCoins,
  HardDrive,
  Layers,
  Moon,
  Paperclip,
  PiggyBank,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Smartphone,
  Split,
  Sun,
  Tag,
  Trash2,
  Upload,
  Users,
  Wallet,
  Watch,
} from 'lucide-react';

async function compressReceiptImageIfPossible(
  file: File
): Promise<{ bytes: Uint8Array; mimeType: string; fileName: string }> {
  if (!file.type.startsWith('image/')) {
    const buf = await file.arrayBuffer();
    return {
      bytes: new Uint8Array(buf),
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
    };
  }

  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const maxDim = 1200;
      let width = img.width;
      let height = img.height;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.round((height * maxDim) / width);
          width = maxDim;
        } else {
          width = Math.round((width * maxDim) / height);
          height = maxDim;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        file.arrayBuffer().then((buf) =>
          resolve({
            bytes: new Uint8Array(buf),
            mimeType: file.type,
            fileName: file.name,
          })
        );
        return;
      }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        async (blob) => {
          if (!blob) {
            const buf = await file.arrayBuffer();
            resolve({
              bytes: new Uint8Array(buf),
              mimeType: file.type,
              fileName: file.name,
            });
            return;
          }
          const buf = await blob.arrayBuffer();
          const baseName = file.name.replace(/\.[^.]+$/, '');
          resolve({
            bytes: new Uint8Array(buf),
            mimeType: blob.type || 'image/webp',
            fileName: `${baseName}_compressed.webp`,
          });
        },
        'image/webp',
        0.75
      );
    };
    img.onerror = async () => {
      URL.revokeObjectURL(url);
      const buf = await file.arrayBuffer();
      resolve({
        bytes: new Uint8Array(buf),
        mimeType: file.type,
        fileName: file.name,
      });
    };
    img.src = url;
  });
}

type ActiveTab = 'dashboard' | 'transactions' | 'tricount' | 'loans' | 'crypto';

export default function App() {
  const repoRef = useRef<DailyBudgetRepository | null>(null);
  const diskHandleRef = useRef<FileSystemFileHandleLike | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isReady, setIsReady] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Reference Date (defaults to 2026-11-07 or today)
  const [referenceDate, setReferenceDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );

  // Persistence Metadata
  const [persistence, setPersistence] = useState<StoragePersistenceState>({
    fileName: 'active_workspace.dbbudget',
    opfsSupported: isOpfsSupported(),
    fileSystemAccessSupported: isFileSystemAccessSupported(),
    hasBoundDiskHandle: false,
    lastSavedAt: null,
    storageBackend: 'memory',
    byteSize: 0,
  });

  // Domain State Snapshot
  const [dashboard, setDashboard] = useState<DashboardSummary | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [tags, setTags] = useState<TagRow[]>([]);
  const [transactions, setTransactions] = useState<EnrichedTransaction[]>([]);
  const [recurringRules, setRecurringRules] = useState<EnrichedRecurringRule[]>([]);
  const [tricountGroups, setTricountGroups] = useState<TricountGroupDetail[]>([]);
  const [loans, setLoans] = useState<LoanRow[]>([]);

  // Filters
  const [txAccountFilter, setTxAccountFilter] = useState<string>('all');
  const [txTagFilter, setTxTagFilter] = useState<string>('all');

  // Quick-Add Transaction Form State
  const [txType, setTxType] = useState<TransactionType>('expense');
  const [txAccountId, setTxAccountId] = useState<string>('');
  const [txToAccountId, setTxToAccountId] = useState<string>('');
  const [txAmountMajor, setTxAmountMajor] = useState<string>('24.50');
  const [txCurrency, setTxCurrency] = useState<string>('EUR');
  const [txCustomCompetence, setTxCustomCompetence] = useState<boolean>(false);
  const [txBudgetCompetenceMajor, setTxBudgetCompetenceMajor] = useState<string>('24.50');
  const [txBudgetOverride, setTxBudgetOverride] = useState<'null' | '1' | '0'>('null');
  const [txIsFixed, setTxIsFixed] = useState<boolean>(false);
  const [txDate, setTxDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [txDescription, setTxDescription] = useState<string>('');
  const [txSelectedTagIds, setTxSelectedTagIds] = useState<string[]>([]);
  const [newTagInput, setNewTagInput] = useState<string>('');
  const [txSplits, setTxSplits] = useState<
    Array<{ categoryId: string; amountMajor: string; notes: string }>
  >([]);

  // New Account Form State
  const [newAccName, setNewAccName] = useState<string>('');
  const [newAccType, setNewAccType] = useState<AccountType>('checking');
  const [newAccInitialMajor, setNewAccInitialMajor] = useState<string>('1000.00');
  const [newAccIncludeBudget, setNewAccIncludeBudget] = useState<boolean>(true);

  // Tricount Form State
  const [selectedGroupId, setSelectedGroupId] = useState<string>('');
  const [tricountTitle, setTricountTitle] = useState<string>('');
  const [tricountAmountMajor, setTricountAmountMajor] = useState<string>('80.00');
  const [tricountCurrency, setTricountCurrency] = useState<string>('EUR');
  const [tricountRateToGroup, setTricountRateToGroup] = useState<string>('1.0');
  const [tricountPaidById, setTricountPaidById] = useState<string>('');
  const [tricountSplitMode, setTricountSplitMode] = useState<SplitMode>('equal');
  const [tricountMemberShares, setTricountMemberShares] = useState<Record<string, string>>({});
  const [tricountLinkAccount, setTricountLinkAccount] = useState<string>('');
  const [tricountLinkCategory, setTricountLinkCategory] = useState<string>('');

  // New Tricount Group Form State
  const [newGroupName, setNewGroupName] = useState<string>('');
  const [newGroupCurrency, setNewGroupCurrency] = useState<string>('EUR');
  const [newGroupMembersCsv, setNewGroupMembersCsv] = useState<string>(
    'Andrea (Io), Marco, Elena'
  );

  // New Recurring Rule Form State
  const [newRecDesc, setNewRecDesc] = useState<string>('');
  const [newRecAmountMajor, setNewRecAmountMajor] = useState<string>('29.90');
  const [newRecFreq, setNewRecFreq] = useState<RecurringFrequency>('monthly');
  const [newRecNextDate, setNewRecNextDate] = useState<string>(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [newRecAccountId, setNewRecAccountId] = useState<string>('');
  const [newRecCategoryId, setNewRecCategoryId] = useState<string>('');

  // Loans Form State
  const [newLoanName, setNewLoanName] = useState<string>('');
  const [newLoanCounterparty, setNewLoanCounterparty] = useState<string>('');
  const [newLoanType, setNewLoanType] = useState<'lent' | 'borrowed'>('borrowed');
  const [newLoanPrincipalMajor, setNewLoanPrincipalMajor] = useState<string>('1200.00');
  const [newLoanCountBudget, setNewLoanCountBudget] = useState<boolean>(false);
  const [installmentAmounts, setInstallmentAmounts] = useState<Record<string, string>>({});

  // Crypto Form State
  const [cryptoAssetId, setCryptoAssetId] = useState<string>('');
  const [cryptoTxType, setCryptoTxType] = useState<
    'buy' | 'sell' | 'staking_reward' | 'transfer_in' | 'transfer_out'
  >('buy');
  const [cryptoQty, setCryptoQty] = useState<string>('0.02500000');
  const [cryptoPriceMajor, setCryptoPriceMajor] = useState<string>('84500.00');
  const [cryptoFeeMajor, setCryptoFeeMajor] = useState<string>('2.50');
  const [cryptoNotes, setCryptoNotes] = useState<string>('');
  const [cryptoLinkedAccountId, setCryptoLinkedAccountId] = useState<string>('');
  const [cryptoCountPac, setCryptoCountPac] = useState<boolean>(false);
  const [priceEditMap, setPriceEditMap] = useState<Record<string, string>>({});

  // Bank CSV Import/Export & Receipt Attachments State
  const [csvImportContent, setCsvImportContent] = useState<string>(
    'Data;Descrizione;Importo;Valuta\n05/11/2026;Spesa Carrefour Market;-42,80;EUR\n06/11/2026;Rimborso Biglietto Concerto;+35,00;EUR'
  );
  const [attachmentTxId, setAttachmentTxId] = useState<string>('');
  const [recentAttachments, setRecentAttachments] = useState<AttachmentRow[]>([]);

  // Sync theme attribute on document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Refresh UI state from SQLite repository and persist to OPFS (+ bound disk file handle if present)
  const syncAndRefresh = useCallback(
    async (
      repo: DailyBudgetRepository,
      options?: {
        skipPersist?: boolean;
        customFileName?: string;
        refDate?: string;
      }
    ) => {
      const targetDate = options?.refDate ?? repo.getReferenceDate();
      const dash = repo.getDashboardSummary(targetDate);
      const accs = repo.getAccounts();
      const cats = repo.getCategories();
      const tgs = repo.getTags();
      const txs = repo.getTransactionsWithDetails();
      const recs = repo.getRecurringRules();
      const tgrps = repo.getTricountGroupsWithDetails();
      const lns = repo.getLoans();

      setDashboard(dash);
      setAccounts(accs);
      setCategories(cats);
      setTags(tgs);
      setTransactions(txs);
      setRecurringRules(recs);
      setTricountGroups(tgrps);
      setLoans(lns);

      if (accs.length > 0 && !txAccountId) {
        setTxAccountId(accs[0].id);
        setTricountLinkAccount(accs[0].id);
        setNewRecAccountId(accs[0].id);
      }
      const expCats = cats.filter((c) => c.type === 'expense');
      if (expCats.length > 0 && txSplits.length === 0) {
        setTxSplits([
          {
            categoryId: expCats[0].id,
            amountMajor: '24.50',
            notes: '',
          },
        ]);
        setTricountLinkCategory(expCats[0].id);
        setNewRecCategoryId(expCats[0].id);
      }
      if (tgrps.length > 0 && !selectedGroupId) {
        const firstGrp = tgrps[0];
        setSelectedGroupId(firstGrp.group.id);
        if (firstGrp.members.length > 0) {
          setTricountPaidById(firstGrp.members[0].id);
        }
      }
      if (dash.cryptoSummary.assets.length > 0 && !cryptoAssetId) {
        setCryptoAssetId(dash.cryptoSummary.assets[0].asset.id);
      }
      if (txs.length > 0) {
        const targetAttTxId = attachmentTxId || txs[0].id;
        if (!attachmentTxId) {
          setAttachmentTxId(txs[0].id);
        }
        setRecentAttachments(repo.getAttachmentsForTransaction(targetAttTxId));
      }

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
    [txAccountId, txSplits.length, selectedGroupId, cryptoAssetId]
  );

  // Initial Boot: load from OPFS/IndexedDB if present, otherwise initialize Demo Workspace
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const existing = await loadBytesFromOpfs();
        if (existing && mounted) {
          const repo = await DailyBudgetRepository.fromBinary(existing.bytes, {
            wasmUrl,
            referenceDate,
          });
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

        // First boot: create & seed demo .dbbudget workspace
        const repo = await DailyBudgetRepository.createEmpty({
          wasmUrl,
          referenceDate,
        });
        seedDemoWorkspace(repo, referenceDate);
        repoRef.current = repo;
        if (mounted) {
          await syncAndRefresh(repo, {
            customFileName: 'andrea_demo.dbbudget',
          });
          setIsReady(true);
        }
      } catch (err) {
        console.error('Failed to initialize SQLite-Wasm engine:', err);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // File Manager Handlers
  const handleOpenLocalFile = async () => {
    try {
      const opened = await openLocalDbBudgetFile();
      if (!opened) return;
      const repo = await DailyBudgetRepository.fromBinary(opened.bytes, {
        wasmUrl,
        referenceDate,
      });
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

    if (diskHandleRef.current) {
      const ok = await writeBytesToDiskHandle(diskHandleRef.current, binary);
      if (ok) {
        setPersistence((prev) => ({
          ...prev,
          lastSavedAt: Date.now(),
          byteSize: binary.byteLength,
        }));
        setStatusBanner(
          `Salvataggio diretto completato su "${persistence.fileName}" (${(
            binary.byteLength / 1024
          ).toFixed(1)} KB).`
        );
        return;
      }
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
      setStatusBanner(
        `File SQLite "${saved.fileName}" salvato sul disco locale (${(
          binary.byteLength / 1024
        ).toFixed(1)} KB).`
      );
    }
  };

  const handleDownloadDbBudget = () => {
    const repo = repoRef.current;
    if (!repo) return;
    const binary = repo.exportBinary();
    triggerBrowserDownload(binary, persistence.fileName);
    setStatusBanner(`Download di "${persistence.fileName}" avviato.`);
  };

  const handleResetDemo = async () => {
    await clearOpfsWorkspace();
    diskHandleRef.current = null;
    const repo = await DailyBudgetRepository.createEmpty({
      wasmUrl,
      referenceDate,
    });
    seedDemoWorkspace(repo, referenceDate);
    repoRef.current = repo;
    await syncAndRefresh(repo, { customFileName: 'andrea_demo.dbbudget' });
    setStatusBanner('Workspace Demo ripristinato e sincronizzato su OPFS.');
  };

  const handleNewCleanWorkspace = async () => {
    await clearOpfsWorkspace();
    diskHandleRef.current = null;
    const repo = await DailyBudgetRepository.createEmpty({
      wasmUrl,
      referenceDate,
    });
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

  const handleMergeExternalDbBudget = async () => {
    if (!repoRef.current) return;
    try {
      const opened = await openLocalDbBudgetFile();
      if (!opened) return;
      const res = await mergeExternalDbBudgetBinary(
        repoRef.current,
        opened.bytes,
        { wasmUrl }
      );
      await syncAndRefresh(repoRef.current);
      setStatusBanner(
        `Merge LWW completato da "${opened.fileName}": ${res.mergedRowsCount} righe sincronizzate.`
      );
    } catch (err) {
      setStatusBanner((err as Error).message);
    }
  };

  // Live preview of Transaction Budget Impact (Rule C: Transaction Override > Account Default)
  const selectedAccount = useMemo(
    () => accounts.find((a) => a.id === txAccountId) ?? null,
    [accounts, txAccountId]
  );

  const previewAffectsBudget = useMemo(() => {
    const overrideVal: 0 | 1 | null =
      txBudgetOverride === 'null' ? null : txBudgetOverride === '1' ? 1 : 0;
    return doesTransactionAffectBudget({
      txIncludeInBudget: overrideVal,
      accountIncludeInBudget: selectedAccount
        ? selectedAccount.include_in_budget === 1
        : true,
      txType,
    });
  }, [txBudgetOverride, selectedAccount, txType]);

  // Split Validation
  const effectiveBudgetBaseCents = useMemo(() => {
    const rate = repoRef.current?.getRateToBase(txCurrency) ?? 1.0;
    const cashflowBase = Math.round(parseMajorToCents(txAmountMajor) * rate);
    return txCustomCompetence
      ? parseMajorToCents(txBudgetCompetenceMajor)
      : cashflowBase;
  }, [txAmountMajor, txCurrency, txCustomCompetence, txBudgetCompetenceMajor]);

  const splitCheck = useMemo(() => {
    return validateTransactionSplits(
      effectiveBudgetBaseCents,
      txSplits.map((s) => ({
        categoryId: s.categoryId,
        amountBaseCents: parseMajorToCents(s.amountMajor),
      }))
    );
  }, [effectiveBudgetBaseCents, txSplits]);

  // Create Transaction Handler
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    const repo = repoRef.current;
    if (!repo || !txAccountId) return;

    const amountCents = parseMajorToCents(txAmountMajor);
    if (amountCents <= 0) return;

    const rate = repo.getRateToBase(txCurrency);
    const baseAmountCents = Math.round(amountCents * rate);
    const budgetBaseAmountCents = txCustomCompetence
      ? parseMajorToCents(txBudgetCompetenceMajor)
      : baseAmountCents;

    const includeInBudget: 0 | 1 | null =
      txBudgetOverride === 'null' ? null : txBudgetOverride === '1' ? 1 : 0;

    repo.createTransaction({
      accountId: txAccountId,
      toAccountId: txType === 'transfer' ? txToAccountId || null : null,
      type: txType,
      amountCents,
      currency: txCurrency,
      exchangeRateToBase: rate,
      baseAmountCents,
      budgetBaseAmountCents,
      includeInBudget,
      isFixed: txIsFixed,
      date: txDate,
      description: txDescription.trim() || `Movimento ${txType}`,
      splits:
        txType === 'expense' || txType === 'income'
          ? txSplits.map((s) => ({
              categoryId: s.categoryId,
              amountBaseCents: parseMajorToCents(s.amountMajor),
              notes: s.notes.trim() || undefined,
            }))
          : undefined,
      tagIds: txSelectedTagIds,
    });

    setTxDescription('');
    await syncAndRefresh(repo);
    setStatusBanner('Transazione salvata nel database SQLite (.dbbudget) e widget_snapshot aggiornato.');
  };

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (
        txAccountFilter !== 'all' &&
        t.account_id !== txAccountFilter &&
        t.to_account_id !== txAccountFilter
      ) {
        return false;
      }
      if (txTagFilter !== 'all' && !t.tags.some((tg) => tg.id === txTagFilter)) {
        return false;
      }
      return true;
    });
  }, [transactions, txAccountFilter, txTagFilter]);

  const activeTricountGroup = useMemo(
    () =>
      tricountGroups.find((g) => g.group.id === selectedGroupId) ??
      tricountGroups[0] ??
      null,
    [tricountGroups, selectedGroupId]
  );

  if (!isReady || !dashboard) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '0.75rem',
        }}
      >
        <div className="brand-mark">DB</div>
        <p style={{ fontWeight: 600 }}>
          Inizializzazione motore SQLite-Wasm &amp; OPFS (.dbbudget)...
        </p>
      </div>
    );
  }

  const { dailyBudgetInput, dailyBudgetResult, widgetSnapshot, cryptoSummary } =
    dashboard;

  const effectiveFixedCents = Math.max(
    dailyBudgetInput.fixedExpensesPlannedCents,
    dailyBudgetInput.fixedExpensesActualCents
  );
  const variablePoolCents =
    dailyBudgetInput.monthlyBudgetCents - effectiveFixedCents;

  const todaySpentPct =
    dailyBudgetResult.dailyAllowanceCents > 0
      ? Math.min(
          100,
          Math.max(
            0,
            Math.round(
              (dailyBudgetInput.variableSpentTodayCents /
                dailyBudgetResult.dailyAllowanceCents) *
                100
            )
          )
        )
      : 100;

  return (
    <div className="app-shell">
      {/* Top Local-First Persistence Bar */}
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
            onClick={handleOpenLocalFile}
          >
            <FolderOpen size={15} />
            Apri .dbbudget
          </button>

          <button
            id="btn-save-disk-dbbudget"
            type="button"
            className="btn btn-primary"
            onClick={handleSaveToLocalDisk}
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
            onClick={handleDownloadDbBudget}
            title="Scarica il file binario SQLite3 .dbbudget"
          >
            <Download size={15} />
            Esporta
          </button>

          <button
            id="btn-merge-dbbudget"
            type="button"
            className="btn"
            onClick={handleMergeExternalDbBudget}
            title="Sincronizza un altro file .dbbudget tramite Row-Level Last-Write-Wins (LWW)"
          >
            <GitMerge size={15} />
            Merge LWW .dbbudget
          </button>

          <button
            id="btn-new-workspace"
            type="button"
            className="btn"
            onClick={handleNewCleanWorkspace}
            title="Crea un nuovo file .dbbudget vuoto"
          >
            <Database size={15} />
            Nuovo
          </button>

          <button
            id="btn-reset-demo"
            type="button"
            className="btn"
            onClick={handleResetDemo}
            title="Ripristina dati dimostrativi completi"
          >
            <RotateCcw size={15} />
            Demo
          </button>

          <button
            id="btn-sync-markets"
            type="button"
            className="btn"
            onClick={handleSyncMarkets}
            title="Sincronizza Tassi BCE Frankfurter e Quotazioni Crypto CoinGecko (con fallback offline)"
          >
            <RefreshCw size={15} />
            Sync Tassi &amp; Crypto
          </button>

          <button
            id="btn-toggle-theme"
            type="button"
            className="btn"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            aria-label="Cambia Tema Chiaro/Scuro"
          >
            {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
          </button>
        </div>
      </header>

      {/* Navigation Tabs */}
      <nav className="nav-strip" aria-label="Navigazione Moduli">
        <div className="nav-tabs">
          <button
            id="tab-dashboard"
            type="button"
            className={`nav-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Activity size={16} />
            Dashboard &amp; DailyBudget
          </button>

          <button
            id="tab-transactions"
            type="button"
            className={`nav-tab ${activeTab === 'transactions' ? 'active' : ''}`}
            onClick={() => setActiveTab('transactions')}
          >
            <Wallet size={16} />
            Conti, Split &amp; Transazioni ({transactions.length})
          </button>

          <button
            id="tab-tricount"
            type="button"
            className={`nav-tab ${activeTab === 'tricount' ? 'active' : ''}`}
            onClick={() => setActiveTab('tricount')}
          >
            <Users size={16} />
            Tricount Gruppi ({tricountGroups.length})
          </button>

          <button
            id="tab-loans"
            type="button"
            className={`nav-tab ${activeTab === 'loans' ? 'active' : ''}`}
            onClick={() => setActiveTab('loans')}
          >
            <HandCoins size={16} />
            Prestiti &amp; Debiti ({loans.length})
          </button>

          <button
            id="tab-crypto"
            type="button"
            className={`nav-tab ${activeTab === 'crypto' ? 'active' : ''}`}
            onClick={() => setActiveTab('crypto')}
          >
            <Bitcoin size={16} />
            Crypto WAC ({cryptoSummary.assets.length})
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
            onChange={async (e) => {
              const nextDate = e.target.value;
              if (!nextDate || !repoRef.current) return;
              setReferenceDate(nextDate);
              repoRef.current.setReferenceDate(nextDate);
              await syncAndRefresh(repoRef.current, { refDate: nextDate });
            }}
          />
        </div>
      </nav>

      {/* Main Content */}
      <main className="main-container">
        {statusBanner && (
          <div className="banner-notice" role="status">
            <span>{statusBanner}</span>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setStatusBanner(null)}
            >
              Chiudi
            </button>
          </div>
        )}

        {/* =========================================================
            TAB 1: DASHBOARD & DAILY BUDGET ENGINE
           ========================================================= */}
        {activeTab === 'dashboard' && (
          <>
            <div className="grid-dashboard">
              {/* Hero DailyBudget Card */}
              <section className="card daily-hero">
                <div className="daily-hero-top">
                  <div>
                    <div className="card-subtitle">
                      DISPONIBILITÀ OGGI ({referenceDate} • Ciclo{' '}
                      {dashboard.cycleWindow.cycleStartDate} →{' '}
                      {dashboard.cycleWindow.cycleEndDate} • Giorno{' '}
                      {dashboard.cycleWindow.currentDayOfCycle}/
                      {dashboard.cycleWindow.totalDaysInCycle})
                    </div>
                    <div
                      className="allowance-display mono-num"
                      style={{
                        color:
                          dailyBudgetResult.status === 'over_budget'
                            ? 'var(--status-danger)'
                            : dailyBudgetResult.status === 'warning'
                              ? 'var(--status-warning)'
                              : 'var(--text-primary)',
                      }}
                    >
                      {formatCents(
                        dailyBudgetResult.remainingTodayCents,
                        dashboard.settings.base_currency
                      )}
                    </div>
                    <div
                      style={{
                        fontSize: '0.83rem',
                        color: 'var(--text-secondary)',
                        marginTop: '0.25rem',
                      }}
                    >
                      su quota giornaliera dinamica di{' '}
                      <strong className="mono-num">
                        {formatCents(
                          dailyBudgetResult.dailyAllowanceCents,
                          dashboard.settings.base_currency
                        )}
                      </strong>{' '}
                      (spesi oggi:{' '}
                      <span className="mono-num">
                        {formatCents(
                          dailyBudgetInput.variableSpentTodayCents,
                          dashboard.settings.base_currency
                        )}
                      </span>
                      )
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.5rem' }}>
                    <span className={`status-badge ${dailyBudgetResult.status}`}>
                      <ShieldCheck size={14} />
                      {dailyBudgetResult.status === 'safe'
                        ? 'In Target'
                        : dailyBudgetResult.status === 'warning'
                          ? 'Soglia < 20%'
                          : 'Over Budget'}
                    </span>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <label
                          htmlFor="input-month-start-day"
                          style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}
                        >
                          Giorno Inizio Ciclo:
                        </label>
                        <input
                          id="input-month-start-day"
                          type="number"
                          min={1}
                          max={28}
                          className="input mono-num"
                          style={{ width: '62px', padding: '0.25rem 0.4rem', fontSize: '0.8rem' }}
                          value={dashboard.settings.month_start_day}
                          onChange={async (e) => {
                            const day = Number.parseInt(e.target.value, 10);
                            if (Number.isNaN(day) || day < 1 || day > 28 || !repoRef.current) return;
                            repoRef.current.updateWorkspaceSettings({
                              monthStartDay: day,
                            });
                            await syncAndRefresh(repoRef.current);
                          }}
                        />
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                        <label
                          htmlFor="input-monthly-target"
                          style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}
                        >
                          Target Mensile:
                        </label>
                        <input
                          id="input-monthly-target"
                          type="number"
                          step="50"
                          className="input mono-num"
                          style={{ width: '100px', padding: '0.25rem 0.45rem', fontSize: '0.8rem' }}
                          value={(dashboard.settings.monthly_budget_target / 100).toFixed(0)}
                          onChange={async (e) => {
                            const val = Number.parseFloat(e.target.value);
                            if (Number.isNaN(val) || val <= 0 || !repoRef.current) return;
                            repoRef.current.updateWorkspaceSettings({
                              monthlyBudgetTargetCents: Math.round(val * 100),
                            });
                            await syncAndRefresh(repoRef.current);
                          }}
                        />
                        <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>€</span>
                      </div>
                    </div>

                    <button
                      id="btn-sweep-savings"
                      type="button"
                      className="btn btn-sm"
                      onClick={async () => {
                        if (!repoRef.current) return;
                        const checkingAcc =
                          accounts.find((a) => a.type === 'checking') ?? accounts[0];
                        const savingsAcc =
                          accounts.find((a) => a.type === 'savings') ?? accounts[1];
                        if (!checkingAcc || !savingsAcc) return;
                        const sweepAmountCents = Math.min(
                          10000,
                          Math.max(2500, dailyBudgetResult.remainingTodayCents)
                        );
                        repoRef.current.sweepSavingsToAccount({
                          fromAccountId: checkingAcc.id,
                          toSavingsAccountId: savingsAcc.id,
                          amountCents: sweepAmountCents,
                          date: referenceDate,
                          description: `Accantonamento Risparmio (${referenceDate})`,
                        });
                        await syncAndRefresh(repoRef.current);
                        setStatusBanner(
                          `Giroconto Risparmio completato: ${formatCents(sweepAmountCents)} trasferiti da "${checkingAcc.name}" a "${savingsAcc.name}" (neutro sul DailyBudget).`
                        );
                      }}
                    >
                      <PiggyBank size={14} /> Giroconta Risparmio a Conto Savings
                    </button>
                  </div>
                </div>

                {/* Progress Bar Today */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                      marginBottom: '0.35rem',
                    }}
                  >
                    <span>Consumo quota giornaliera</span>
                    <span className="mono-num">{todaySpentPct}%</span>
                  </div>
                  <div className="progress-track">
                    <div
                      className="progress-fill"
                      style={{
                        width: `${todaySpentPct}%`,
                        backgroundColor:
                          dailyBudgetResult.status === 'over_budget'
                            ? 'var(--status-danger)'
                            : dailyBudgetResult.status === 'warning'
                              ? 'var(--status-warning)'
                              : 'var(--accent-primary)',
                      }}
                    />
                  </div>
                </div>

                {/* Mathematical Breakdown (Pool Fisso vs Variabile + Burn Rate) */}
                <div className="formula-strip">
                  <div className="metric-item">
                    <span className="metric-label">
                      Pool Fisso Effettivo max(Plan, Act)
                    </span>
                    <span className="metric-value mono-num">
                      {formatCents(effectiveFixedCents)}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Plan {formatCents(dailyBudgetInput.fixedExpensesPlannedCents)} • Reale{' '}
                      {formatCents(dailyBudgetInput.fixedExpensesActualCents)}
                    </span>
                  </div>

                  <div className="metric-item">
                    <span className="metric-label">Pool Variabile Mensile</span>
                    <span className="metric-value mono-num">
                      {formatCents(variablePoolCents)}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Residuo Mese:{' '}
                      {formatCents(dailyBudgetResult.remainingMonthVariableCents)}
                    </span>
                  </div>

                  <div className="metric-item">
                    <span className="metric-label">Proiezione Fine Mese (Burn Rate)</span>
                    <span className="metric-value mono-num">
                      {formatCents(dailyBudgetResult.projectedMonthEndTotalCents)}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      su target {formatCents(dailyBudgetInput.monthlyBudgetCents)}
                    </span>
                  </div>

                  <div className="metric-item">
                    <span className="metric-label">Risparmio / Sforamento Stimato</span>
                    <span
                      className="metric-value mono-num"
                      style={{
                        color:
                          dailyBudgetResult.projectedSavingsOrOverrunCents >= 0
                            ? 'var(--status-safe)'
                            : 'var(--status-danger)',
                      }}
                    >
                      {dailyBudgetResult.projectedSavingsOrOverrunCents >= 0 ? '+' : ''}
                      {formatCents(dailyBudgetResult.projectedSavingsOrOverrunCents)}
                    </span>
                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      Fine mese stimato
                    </span>
                  </div>
                </div>
              </section>

              {/* Right Column: Native Widget & Watch Snapshot + Patrimonio */}
              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div className="card-header" style={{ marginBottom: 0 }}>
                  <div>
                    <h2 className="card-title">
                      <Watch size={17} />
                      Tabella SQLite <code>widget_snapshot</code> (O(1) Native Read)
                    </h2>
                    <p className="card-subtitle">
                      Riga pre-calcolata nel file <code>.dbbudget</code> per WidgetKit, WatchOS e Wear OS
                    </p>
                  </div>
                  <Smartphone size={18} style={{ color: 'var(--accent-primary)' }} />
                </div>

                <div className="widget-preview-box">
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      borderBottom: '1px solid var(--border-subtle)',
                      paddingBottom: '0.55rem',
                    }}
                  >
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
                      SELECT * FROM widget_snapshot WHERE id = &apos;current&apos;;
                    </span>
                    <span className="chip override-include">SYNCED</span>
                  </div>

                  <div className="grid-2" style={{ gap: '0.65rem' }}>
                    <div>
                      <div className="metric-label">daily_budget_remaining</div>
                      <div className="metric-value mono-num">
                        {formatCents(widgetSnapshot.daily_budget_remaining)}
                      </div>
                    </div>
                    <div>
                      <div className="metric-label">daily_budget_allowance</div>
                      <div className="metric-value mono-num">
                        {formatCents(widgetSnapshot.daily_budget_allowance)}
                      </div>
                    </div>
                    <div>
                      <div className="metric-label">month_remaining_budget</div>
                      <div className="metric-value mono-num">
                        {formatCents(widgetSnapshot.month_remaining_budget)}
                      </div>
                    </div>
                    <div>
                      <div className="metric-label">crypto_total_value / pnl</div>
                      <div className="metric-value mono-num">
                        {formatCents(widgetSnapshot.crypto_total_value)}{' '}
                        <span
                          style={{
                            fontSize: '0.76rem',
                            color:
                              widgetSnapshot.crypto_pnl_pct >= 0
                                ? 'var(--status-safe)'
                                : 'var(--status-danger)',
                          }}
                        >
                          ({widgetSnapshot.crypto_pnl_pct >= 0 ? '+' : ''}
                          {widgetSnapshot.crypto_pnl_pct.toFixed(2)}%)
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="grid-2" style={{ gap: '0.75rem', marginTop: 'auto' }}>
                  <div
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="metric-label">Liquidità Conti Bancari</div>
                    <div className="metric-value mono-num">
                      {formatCents(dashboard.totalBankBalanceCents)}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '0.75rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <div className="metric-label">Patrimonio Netto (Fiat + Crypto)</div>
                    <div className="metric-value mono-num">
                      {formatCents(dashboard.totalNetWorthCents)}
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Category Breakdown & Latest Transactions */}
            <div className="grid-2">
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">
                      <Layers size={17} />
                      Budget Categorie (Fisse vs Variabili)
                    </h2>
                    <p className="card-subtitle">
                      Calcolato sugli split di competenza (<code>transaction_splits</code>)
                    </p>
                  </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {dashboard.categoryBreakdown.map((cat) => {
                    const limit = cat.monthlyLimitCents ?? 0;
                    const pct =
                      limit > 0
                        ? Math.min(100, Math.round((cat.spentCents / limit) * 100))
                        : 0;
                    return (
                      <div key={cat.categoryId}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            fontSize: '0.82rem',
                            marginBottom: '0.28rem',
                          }}
                        >
                          <span style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                            <span
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: '50%',
                                backgroundColor: cat.color,
                                display: 'inline-block',
                              }}
                            />
                            {cat.name}
                            {cat.isFixed && (
                              <span className="chip">FISSA</span>
                            )}
                          </span>
                          <span className="mono-num">
                            <strong>{formatCents(cat.spentCents)}</strong>
                            {limit > 0 ? ` / ${formatCents(limit)}` : ''}
                          </span>
                        </div>
                        <div className="progress-track" style={{ height: 7 }}>
                          <div
                            className="progress-fill"
                            style={{
                              width: `${pct}%`,
                              backgroundColor:
                                pct >= 100 ? 'var(--status-danger)' : cat.color,
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">
                      <ArrowRightLeft size={17} />
                      Ultime Transazioni &amp; Regole di Competenza
                    </h2>
                    <p className="card-subtitle">
                      Mostra la distinzione tra Cashflow (<code>base_amount</code>) e Budget (
                      <code>budget_base_amount</code>)
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => setActiveTab('transactions')}
                  >
                    Tutte / Nuova
                  </button>
                </div>

                <div className="tx-list">
                  {transactions.slice(0, 6).map((tx) => (
                    <div key={tx.id} className="tx-row">
                      <div className="tx-main">
                        <div className="tx-title">
                          <span>{tx.description || tx.type}</span>
                          {tx.include_in_budget === 1 && (
                            <span className="chip override-include">
                              Override: Forza Budget [1]
                            </span>
                          )}
                          {tx.include_in_budget === 0 && (
                            <span className="chip override-exclude">
                              Override: Escluso [0]
                            </span>
                          )}
                          {tx.splits.length > 1 && (
                            <span className="chip">
                              <Split size={11} /> Split ({tx.splits.length})
                            </span>
                          )}
                        </div>
                        <div className="tx-meta">
                          <span>{tx.date}</span>
                          <span>•</span>
                          <span>{tx.account_name}</span>
                          {tx.splits.map((s) => (
                            <span key={s.id} className="chip">
                              {s.category_name}: {formatCents(s.amount_base)}
                            </span>
                          ))}
                          {tx.tags.map((tg) => (
                            <span key={tg.id} className="chip">
                              #{tg.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div style={{ textAlign: 'right' }}>
                        <div
                          className="mono-num"
                          style={{
                            fontWeight: 700,
                            color:
                              tx.type === 'income'
                                ? 'var(--status-safe)'
                                : 'var(--text-primary)',
                          }}
                        >
                          {tx.type === 'income' ? '+' : '-'}
                          {formatCents(Math.abs(tx.base_amount))}
                        </div>
                        {tx.base_amount !== tx.budget_base_amount && (
                          <div
                            className="mono-num"
                            style={{
                              fontSize: '0.73rem',
                              color: 'var(--accent-primary)',
                              fontWeight: 600,
                            }}
                          >
                            Budget: {formatCents(tx.budget_base_amount)}
                          </div>
                        )}
                        {!tx.effective_affects_budget && (
                          <div
                            style={{
                              fontSize: '0.7rem',
                              color: 'var(--text-muted)',
                            }}
                          >
                            No impatto DailyBudget
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        )}

        {/* =========================================================
            TAB 2: CONTI, SPLIT MULTI-CATEGORIA, MULTI-TAG & TRANSAZIONI
           ========================================================= */}
        {activeTab === 'transactions' && (
          <>
            {/* Conti Bancari */}
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    <Wallet size={17} />
                    Conti del Workspace &amp; Default Budget (Regola C)
                  </h2>
                  <p className="card-subtitle">
                    Ogni conto ha un flag <code>include_in_budget</code> di default, sovrascrivibile da qualsiasi singola transazione
                  </p>
                </div>
              </div>

              <div className="grid-3" style={{ marginBottom: '1.25rem' }}>
                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.55rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: '0.92rem' }}>{acc.name}</strong>
                      <span className="chip">{acc.type}</span>
                    </div>
                    <div className="mono-num" style={{ fontSize: '1.35rem', fontWeight: 700 }}>
                      {formatCents(acc.cached_balance, acc.currency)}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '0.25rem',
                      }}
                    >
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Default Budget:{' '}
                        <strong>
                          {acc.include_in_budget === 1 ? 'Incluso (1)' : 'Escluso (0)'}
                        </strong>
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={async () => {
                          if (!repoRef.current) return;
                          repoRef.current.toggleAccountIncludeInBudget(
                            acc.id,
                            acc.include_in_budget !== 1
                          );
                          await syncAndRefresh(repoRef.current);
                        }}
                      >
                        Inverti Default
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Creazione Rapida Conto */}
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!repoRef.current || !newAccName.trim()) return;
                  repoRef.current.createAccount({
                    name: newAccName.trim(),
                    type: newAccType,
                    initialBalanceCents: parseMajorToCents(newAccInitialMajor),
                    includeInBudget: newAccIncludeBudget,
                  });
                  setNewAccName('');
                  await syncAndRefresh(repoRef.current);
                }}
                style={{
                  display: 'flex',
                  gap: '0.65rem',
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  paddingTop: '0.85rem',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div className="field" style={{ flex: '1 1 200px' }}>
                  <label htmlFor="new-acc-name">Nuovo Conto</label>
                  <input
                    id="new-acc-name"
                    className="input"
                    placeholder="es. Conto Deposito TradeRepublic"
                    value={newAccName}
                    onChange={(e) => setNewAccName(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-acc-type">Tipo</label>
                  <select
                    id="new-acc-type"
                    className="select"
                    value={newAccType}
                    onChange={(e) => setNewAccType(e.target.value as AccountType)}
                  >
                    <option value="checking">Conto Corrente (checking)</option>
                    <option value="savings">Risparmio (savings)</option>
                    <option value="credit_card">Carta (credit_card)</option>
                    <option value="cash">Contanti (cash)</option>
                  </select>
                </div>
                <div className="field" style={{ width: '130px' }}>
                  <label htmlFor="new-acc-balance">Saldo Iniziale (€)</label>
                  <input
                    id="new-acc-balance"
                    className="input mono-num"
                    value={newAccInitialMajor}
                    onChange={(e) => setNewAccInitialMajor(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="new-acc-budget">Default in Budget</label>
                  <select
                    id="new-acc-budget"
                    className="select"
                    value={newAccIncludeBudget ? '1' : '0'}
                    onChange={(e) => setNewAccIncludeBudget(e.target.value === '1')}
                  >
                    <option value="1">Incluso (1)</option>
                    <option value="0">Escluso (0)</option>
                  </select>
                </div>
                <button type="submit" className="btn btn-primary">
                  <Plus size={15} /> Aggiungi Conto
                </button>
              </form>
            </section>

            {/* Regole Ricorrenti & Auto-Commit Scheduler */}
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    <RefreshCw size={17} />
                    Regole Ricorrenti &amp; Auto-Commit (<code>recurring_rules</code>)
                  </h2>
                  <p className="card-subtitle">
                    Generazione automatica spese fisse scadute rispetto alla Data Riferimento ({referenceDate}) con calcolo UTC deterministico
                  </p>
                </div>

                <button
                  id="btn-process-recurring"
                  type="button"
                  className="btn btn-primary"
                  onClick={async () => {
                    if (!repoRef.current) return;
                    const res = repoRef.current.processDueRecurringRules(referenceDate);
                    await syncAndRefresh(repoRef.current);
                    setStatusBanner(
                      res.committedCount > 0
                        ? `Auto-Commit completato: generate ${res.committedCount} transazioni ricorrenti scadute fino al ${referenceDate}.`
                        : `Nessuna regola ricorrente attiva con auto_commit=1 scaduta entro il ${referenceDate}.`
                    );
                  }}
                >
                  <CheckCircle2 size={15} /> Esegui Ricorrenze Scadute
                </button>
              </div>

              <div className="grid-3" style={{ marginBottom: '1rem' }}>
                {recurringRules.map((rule) => {
                  const isDue = rule.next_occurrence_date <= referenceDate;
                  return (
                    <div
                      key={rule.id}
                      style={{
                        padding: '0.9rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-elevated)',
                        border: isDue
                          ? '1px solid var(--status-warning)'
                          : '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.5rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.4rem',
                        }}
                      >
                        <strong style={{ fontSize: '0.88rem' }}>
                          {rule.description || 'Ricorrenza'}
                        </strong>
                        <span className="chip">{rule.frequency}</span>
                      </div>

                      <div className="mono-num" style={{ fontSize: '1.15rem', fontWeight: 700 }}>
                        {formatCents(rule.amount, rule.currency)}
                      </div>

                      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                        Conto: <strong>{rule.account_name}</strong> • Cat:{' '}
                        <strong>{rule.category_name}</strong>
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginTop: '0.2rem',
                          flexWrap: 'wrap',
                          gap: '0.4rem',
                        }}
                      >
                        <span
                          className={`chip mono-num ${
                            isDue ? 'override-exclude' : 'override-include'
                          }`}
                        >
                          Prossima: {rule.next_occurrence_date}{' '}
                          {isDue ? '(SCADUTA / PRONTA)' : ''}
                        </span>

                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={async () => {
                            if (!repoRef.current) return;
                            repoRef.current.toggleRecurringRule(rule.id, {
                              autoCommit: rule.auto_commit !== 1,
                            });
                            await syncAndRefresh(repoRef.current);
                          }}
                        >
                          auto_commit: {rule.auto_commit === 1 ? 'ON (1)' : 'OFF (0)'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!repoRef.current || !newRecDesc.trim()) return;
                  const accId = newRecAccountId || accounts[0]?.id;
                  const catId =
                    newRecCategoryId ||
                    categories.find((c) => c.type === 'expense')?.id ||
                    categories[0]?.id;
                  if (!accId || !catId) return;

                  repoRef.current.createRecurringRule({
                    accountId: accId,
                    categoryId: catId,
                    amountCents: parseMajorToCents(newRecAmountMajor),
                    description: newRecDesc.trim(),
                    frequency: newRecFreq,
                    nextOccurrenceDate: newRecNextDate || referenceDate,
                    autoCommit: true,
                  });
                  setNewRecDesc('');
                  await syncAndRefresh(repoRef.current);
                  setStatusBanner('Nuova regola ricorrente salvata in recurring_rules.');
                }}
                style={{
                  display: 'flex',
                  gap: '0.6rem',
                  flexWrap: 'wrap',
                  alignItems: 'flex-end',
                  paddingTop: '0.85rem',
                  borderTop: '1px solid var(--border-subtle)',
                }}
              >
                <div className="field" style={{ flex: '1 1 180px' }}>
                  <label htmlFor="rec-desc">Nuova Ricorrenza</label>
                  <input
                    id="rec-desc"
                    className="input"
                    placeholder="es. Abbonamento Palestra / Affitto"
                    value={newRecDesc}
                    onChange={(e) => setNewRecDesc(e.target.value)}
                  />
                </div>
                <div className="field" style={{ width: '110px' }}>
                  <label htmlFor="rec-amount">Importo (€)</label>
                  <input
                    id="rec-amount"
                    className="input mono-num"
                    value={newRecAmountMajor}
                    onChange={(e) => setNewRecAmountMajor(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="rec-freq">Frequenza</label>
                  <select
                    id="rec-freq"
                    className="select"
                    value={newRecFreq}
                    onChange={(e) => setNewRecFreq(e.target.value as RecurringFrequency)}
                  >
                    <option value="monthly">Mensile (monthly)</option>
                    <option value="weekly">Settimanale (weekly)</option>
                    <option value="yearly">Annuale (yearly)</option>
                    <option value="daily">Giornaliera (daily)</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="rec-next-date">Prossima Data</label>
                  <input
                    id="rec-next-date"
                    type="date"
                    className="input mono-num"
                    value={newRecNextDate}
                    onChange={(e) => setNewRecNextDate(e.target.value)}
                  />
                </div>
                <div className="field">
                  <label htmlFor="rec-acc">Conto</label>
                  <select
                    id="rec-acc"
                    className="select"
                    value={newRecAccountId || accounts[0]?.id || ''}
                    onChange={(e) => setNewRecAccountId(e.target.value)}
                  >
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="rec-cat">Categoria</label>
                  <select
                    id="rec-cat"
                    className="select"
                    value={
                      newRecCategoryId ||
                      categories.find((c) => c.type === 'expense')?.id ||
                      ''
                    }
                    onChange={(e) => setNewRecCategoryId(e.target.value)}
                  >
                    {categories
                      .filter((c) => c.type === 'expense')
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </select>
                </div>
                <button type="submit" className="btn btn-primary">
                  <Plus size={15} /> Aggiungi Ricorrenza
                </button>
              </form>
            </section>

            {/* Quick-Add Transazione Completa + Lista */}
            <div className="grid-2">
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">
                      <Plus size={17} />
                      Registra Transazione (Split, Tag &amp; Override Budget)
                    </h2>
                    <p className="card-subtitle">
                      Supporta separazione <code>base_amount</code> / <code>budget_base_amount</code> e gerarchia Transazione &gt; Conto
                    </p>
                  </div>
                </div>

                <form onSubmit={handleCreateTransaction} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="tx-type">Tipo Movimento</label>
                      <select
                        id="tx-type"
                        className="select"
                        value={txType}
                        onChange={(e) => setTxType(e.target.value as TransactionType)}
                      >
                        <option value="expense">Spesa (expense)</option>
                        <option value="income">Entrata (income)</option>
                        <option value="transfer">Giroconto (transfer)</option>
                        <option value="loan_movement">Rata/Prestito (loan_movement)</option>
                        <option value="tricount_settlement">Rimborso Tricount (tricount_settlement)</option>
                      </select>
                    </div>

                    <div className="field">
                      <label htmlFor="tx-account">Conto Origine</label>
                      <select
                        id="tx-account"
                        className="select"
                        value={txAccountId}
                        onChange={(e) => setTxAccountId(e.target.value)}
                      >
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name} ({a.include_in_budget === 1 ? 'Budget: Sì' : 'Budget: No'})
                          </option>
                        ))}
                      </select>
                    </div>

                    {txType === 'transfer' && (
                      <div className="field">
                        <label htmlFor="tx-to-account">Conto Destinazione</label>
                        <select
                          id="tx-to-account"
                          className="select"
                          value={txToAccountId}
                          onChange={(e) => setTxToAccountId(e.target.value)}
                        >
                          <option value="">-- Seleziona Conto --</option>
                          {accounts
                            .filter((a) => a.id !== txAccountId)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    )}

                    <div className="field">
                      <label htmlFor="tx-amount">Importo Cashflow (Reale Conto)</label>
                      <div style={{ display: 'flex', gap: '0.4rem' }}>
                        <input
                          id="tx-amount"
                          className="input mono-num"
                          value={txAmountMajor}
                          onChange={(e) => {
                            setTxAmountMajor(e.target.value);
                            if (!txCustomCompetence) {
                              setTxBudgetCompetenceMajor(e.target.value);
                              if (txSplits.length === 1) {
                                setTxSplits([
                                  { ...txSplits[0], amountMajor: e.target.value },
                                ]);
                              }
                            }
                          }}
                        />
                        <select
                          aria-label="Valuta Transazione"
                          className="select"
                          style={{ width: '90px' }}
                          value={txCurrency}
                          onChange={(e) => setTxCurrency(e.target.value)}
                        >
                          <option value="EUR">EUR</option>
                          <option value="USD">USD</option>
                          <option value="GBP">GBP</option>
                          <option value="CHF">CHF</option>
                        </select>
                      </div>
                    </div>

                    <div className="field">
                      <label htmlFor="tx-date">Data</label>
                      <input
                        id="tx-date"
                        type="date"
                        className="input mono-num"
                        value={txDate}
                        onChange={(e) => setTxDate(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="field">
                    <label htmlFor="tx-desc">Descrizione</label>
                    <input
                      id="tx-desc"
                      className="input"
                      placeholder="es. Spesa Esselunga / Cena condivisa / Biglietto Treno"
                      value={txDescription}
                      onChange={(e) => setTxDescription(e.target.value)}
                    />
                  </div>

                  {/* Regola B & C: Separazione Competenza + Override Budget */}
                  <div
                    style={{
                      padding: '0.85rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.65rem',
                    }}
                  >
                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="tx-override-budget">
                          Priorità Budget (<code>include_in_budget</code>)
                        </label>
                        <select
                          id="tx-override-budget"
                          className="select"
                          value={txBudgetOverride}
                          onChange={(e) =>
                            setTxBudgetOverride(e.target.value as 'null' | '1' | '0')
                          }
                        >
                          <option value="null">
                            NULL — Eredita dal Conto (
                            {selectedAccount?.include_in_budget === 1
                              ? 'Incluso'
                              : 'Escluso'}
                            )
                          </option>
                          <option value="1">1 — Forza INCLUSIONE nel DailyBudget</option>
                          <option value="0">0 — Forza ESCLUSIONE dal DailyBudget</option>
                        </select>
                      </div>

                      <div className="field">
                        <label htmlFor="tx-fixed-mode">Pool di Spesa</label>
                        <select
                          id="tx-fixed-mode"
                          className="select"
                          value={txIsFixed ? '1' : '0'}
                          onChange={(e) => setTxIsFixed(e.target.value === '1')}
                        >
                          <option value="0">Spesa Variabile (impatta quota giornaliera)</option>
                          <option value="1">Spesa Fissa (Affitto, Bollette, Ricorrenze)</option>
                        </select>
                      </div>
                    </div>

                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        flexWrap: 'wrap',
                        gap: '0.5rem',
                      }}
                    >
                      <label
                        style={{
                          fontSize: '0.78rem',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          cursor: 'pointer',
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={txCustomCompetence}
                          onChange={(e) => setTxCustomCompetence(e.target.checked)}
                        />
                        Competenza Budget diversa dal Cashflow (es. pago per altri)
                      </label>

                      <span
                        className={`chip ${
                          previewAffectsBudget ? 'override-include' : 'override-exclude'
                        }`}
                      >
                        Esito doesTransactionAffectBudget:{' '}
                        {previewAffectsBudget ? 'IMPATTA IL BUDGET' : 'ESCLUSA DAL BUDGET'}
                      </span>
                    </div>

                    {txCustomCompetence && (
                      <div className="field">
                        <label htmlFor="tx-competence-amount">
                          Importo di Competenza Budget (<code>budget_base_amount</code> in EUR)
                        </label>
                        <input
                          id="tx-competence-amount"
                          className="input mono-num"
                          value={txBudgetCompetenceMajor}
                          onChange={(e) => setTxBudgetCompetenceMajor(e.target.value)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Multi-Category Splits (Regola D) */}
                  {(txType === 'expense' || txType === 'income') && (
                    <div
                      style={{
                        padding: '0.85rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.6rem',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>
                          <Split size={14} style={{ verticalAlign: 'middle' }} /> Split
                          Multi-Categoria (Somma = {formatCents(effectiveBudgetBaseCents)})
                        </span>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => {
                            const fallbackCat = categories[0]?.id ?? '';
                            const remCents = Math.max(0, splitCheck.differenceCents);
                            setTxSplits([
                              ...txSplits,
                              {
                                categoryId: fallbackCat,
                                amountMajor: (remCents / 100).toFixed(2),
                                notes: '',
                              },
                            ]);
                          }}
                        >
                          <Plus size={13} /> Aggiungi Riga Split
                        </button>
                      </div>

                      {txSplits.map((sp, idx) => (
                        <div
                          key={idx}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1.3fr 0.9fr 1fr auto',
                            gap: '0.45rem',
                            alignItems: 'center',
                          }}
                        >
                          <select
                            aria-label={`Categoria Split ${idx + 1}`}
                            className="select"
                            value={sp.categoryId}
                            onChange={(e) => {
                              const copy = [...txSplits];
                              copy[idx] = { ...copy[idx], categoryId: e.target.value };
                              setTxSplits(copy);
                            }}
                          >
                            {categories.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name} ({c.type})
                              </option>
                            ))}
                          </select>

                          <input
                            aria-label={`Importo Split ${idx + 1}`}
                            className="input mono-num"
                            placeholder="0.00"
                            value={sp.amountMajor}
                            onChange={(e) => {
                              const copy = [...txSplits];
                              copy[idx] = { ...copy[idx], amountMajor: e.target.value };
                              setTxSplits(copy);
                            }}
                          />

                          <input
                            aria-label={`Nota Split ${idx + 1}`}
                            className="input"
                            placeholder="Nota sottovoce..."
                            value={sp.notes}
                            onChange={(e) => {
                              const copy = [...txSplits];
                              copy[idx] = { ...copy[idx], notes: e.target.value };
                              setTxSplits(copy);
                            }}
                          />

                          {txSplits.length > 1 && (
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              onClick={() =>
                                setTxSplits(txSplits.filter((_, i) => i !== idx))
                              }
                            >
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      ))}

                      {!splitCheck.valid && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--status-warning)' }}>
                          Differenza da allocare:{' '}
                          <strong className="mono-num">
                            {formatCents(splitCheck.differenceCents)}
                          </strong>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Multi-Tag M:N */}
                  <div className="field">
                    <label>Tag Trasversali M:N (#viaggio, #lavoro, #rimborsabile)</label>
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {tags.map((tg) => {
                        const active = txSelectedTagIds.includes(tg.id);
                        return (
                          <button
                            key={tg.id}
                            type="button"
                            className={`btn btn-sm ${active ? 'btn-primary' : ''}`}
                            onClick={() =>
                              setTxSelectedTagIds((prev) =>
                                prev.includes(tg.id)
                                  ? prev.filter((id) => id !== tg.id)
                                  : [...prev, tg.id]
                              )
                            }
                          >
                            #{tg.name}
                          </button>
                        );
                      })}

                      <div style={{ display: 'inline-flex', gap: '0.3rem' }}>
                        <input
                          className="input"
                          style={{ width: '130px', padding: '0.25rem 0.5rem', fontSize: '0.78rem' }}
                          placeholder="+ nuovo #tag"
                          value={newTagInput}
                          onChange={(e) => setNewTagInput(e.target.value)}
                        />
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={async () => {
                            if (!repoRef.current || !newTagInput.trim()) return;
                            const created = repoRef.current.createTag({
                              name: newTagInput.trim(),
                            });
                            setNewTagInput('');
                            setTxSelectedTagIds((prev) => [...prev, created.id]);
                            await syncAndRefresh(repoRef.current);
                          }}
                        >
                          Crea Tag
                        </button>
                      </div>
                    </div>
                  </div>

                  <button type="submit" className="btn btn-primary">
                    <CheckCircle2 size={16} /> Registra Transazione su .dbbudget
                  </button>
                </form>
              </section>

              {/* Lista Transazioni con Filtri */}
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">
                      Registro Movimenti ({filteredTransactions.length})
                    </h2>
                    <p className="card-subtitle">
                      Filtra per conto o tag trasversale
                    </p>
                  </div>

                  <div style={{ display: 'flex', gap: '0.4rem' }}>
                    <select
                      aria-label="Filtra per Conto"
                      className="select"
                      style={{ width: 'auto', fontSize: '0.78rem', padding: '0.3rem 0.5rem' }}
                      value={txAccountFilter}
                      onChange={(e) => setTxAccountFilter(e.target.value)}
                    >
                      <option value="all">Tutti i conti</option>
                      {accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>

                    <select
                      aria-label="Filtra per Tag"
                      className="select"
                      style={{ width: 'auto', fontSize: '0.78rem', padding: '0.3rem 0.5rem' }}
                      value={txTagFilter}
                      onChange={(e) => setTxTagFilter(e.target.value)}
                    >
                      <option value="all">Tutti i #tag</option>
                      {tags.map((t) => (
                        <option key={t.id} value={t.id}>
                          #{t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="tx-list">
                  {filteredTransactions.map((tx) => (
                    <div key={tx.id} className="tx-row">
                      <div className="tx-main">
                        <div className="tx-title">
                          <span>{tx.description || tx.type}</span>
                          <span className="chip">{tx.type}</span>
                          {tx.is_fixed === 1 && <span className="chip">FISSA</span>}
                          {tx.include_in_budget === 1 && (
                            <span className="chip override-include">Forza [1]</span>
                          )}
                          {tx.include_in_budget === 0 && (
                            <span className="chip override-exclude">Esclusa [0]</span>
                          )}
                        </div>
                        <div className="tx-meta">
                          <span>{tx.date}</span>
                          <span>•</span>
                          <span>{tx.account_name}</span>
                          {tx.splits.map((s) => (
                            <span key={s.id} className="chip">
                              {s.category_name}: {formatCents(s.amount_base)}
                            </span>
                          ))}
                          {tx.tags.map((tg) => (
                            <span key={tg.id} className="chip">
                              <Tag size={10} /> #{tg.name}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                        <div style={{ textAlign: 'right' }}>
                          <div className="mono-num" style={{ fontWeight: 700 }}>
                            Cashflow: {formatCents(tx.base_amount)}
                          </div>
                          <div
                            className="mono-num"
                            style={{
                              fontSize: '0.74rem',
                              color: tx.effective_affects_budget
                                ? 'var(--accent-primary)'
                                : 'var(--text-muted)',
                            }}
                          >
                            Competenza:{' '}
                            {tx.effective_affects_budget
                              ? formatCents(tx.budget_base_amount)
                              : '0,00 € (Esclusa)'}
                          </div>
                        </div>

                        <button
                          type="button"
                          className="btn btn-sm btn-danger"
                          title="Elimina transazione"
                          onClick={async () => {
                            if (!repoRef.current) return;
                            repoRef.current.deleteTransaction(tx.id);
                            await syncAndRefresh(repoRef.current);
                          }}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* Import / Export CSV Bancario & Allegati Scontrini (attachments) */}
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    <FileSpreadsheet size={17} />
                    Import / Export CSV Bancario &amp; Allegati Scontrini (<code>attachments</code>)
                  </h2>
                  <p className="card-subtitle">
                    Deduplica deterministica su import CSV e compressione WebP client-side (&le; 500 KB <code>inline_blob</code> SQLite vs <code>local_path</code>)
                  </p>
                </div>

                <button
                  id="btn-export-csv"
                  type="button"
                  className="btn"
                  onClick={() => {
                    if (!repoRef.current) return;
                    const csv = repoRef.current.exportTransactionsToCsv();
                    const bytes = new TextEncoder().encode(csv);
                    triggerBrowserDownload(bytes, 'dailybudget_transactions.csv');
                    setStatusBanner(
                      `Esportazione CSV completata (${transactions.length} transazioni in dailybudget_transactions.csv).`
                    );
                  }}
                >
                  <Download size={15} /> Esporta CSV Transazioni
                </button>
              </div>

              <div className="grid-2">
                {/* Colonna 1: Import CSV con Deduplica */}
                <div
                  style={{
                    padding: '0.9rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <strong style={{ fontSize: '0.86rem' }}>
                    Importa Estratto Conto CSV (Formato: Data;Descrizione;Importo;Valuta)
                  </strong>
                  <textarea
                    id="textarea-csv-import"
                    className="input mono-num"
                    rows={4}
                    style={{ fontFamily: 'var(--font-mono)', fontSize: '0.76rem' }}
                    value={csvImportContent}
                    onChange={(e) => setCsvImportContent(e.target.value)}
                  />
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                      Conto target: <strong>{selectedAccount?.name ?? accounts[0]?.name}</strong>
                    </span>
                    <button
                      id="btn-import-csv"
                      type="button"
                      className="btn btn-primary btn-sm"
                      onClick={async () => {
                        if (!repoRef.current) return;
                        const targetAccId = txAccountId || accounts[0]?.id;
                        if (!targetAccId) return;
                        const expCatId =
                          categories.find((c) => c.type === 'expense')?.id ??
                          categories[0]?.id;
                        const res = repoRef.current.importTransactionsFromCsv({
                          accountId: targetAccId,
                          csvContent: csvImportContent,
                          mapping: {
                            dateColumnIndex: 0,
                            descriptionColumnIndex: 1,
                            amountColumnIndex: 2,
                            currencyColumnIndex: 3,
                            delimiter: ';',
                            hasHeaderRow: true,
                          },
                          defaultCategoryId: expCatId,
                        });
                        await syncAndRefresh(repoRef.current);
                        setStatusBanner(
                          `Import CSV completato: ${res.importedCount} nuove transazioni importate, ${res.skippedDuplicatesCount} duplicati ignorati.`
                        );
                      }}
                    >
                      <Upload size={14} /> Importa CSV con Deduplica
                    </button>
                  </div>
                </div>

                {/* Colonna 2: Smart Hybrid Receipt Attachment Uploader */}
                <div
                  style={{
                    padding: '0.9rem',
                    borderRadius: 'var(--radius-md)',
                    backgroundColor: 'var(--bg-elevated)',
                    border: '1px solid var(--border-subtle)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.65rem',
                  }}
                >
                  <strong style={{ fontSize: '0.86rem' }}>
                    <Paperclip size={14} style={{ verticalAlign: 'middle' }} /> Allega Scontrino / Ricevuta Ibrida (<code>inline_blob</code> &le; 500 KB)
                  </strong>

                  <div className="field">
                    <label htmlFor="select-attachment-tx">Transazione Collegata</label>
                    <select
                      id="select-attachment-tx"
                      className="select"
                      value={attachmentTxId || transactions[0]?.id || ''}
                      onChange={(e) => {
                        const nextTxId = e.target.value;
                        setAttachmentTxId(nextTxId);
                        if (repoRef.current && nextTxId) {
                          setRecentAttachments(
                            repoRef.current.getAttachmentsForTransaction(nextTxId)
                          );
                        }
                      }}
                    >
                      {transactions.slice(0, 15).map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.date} — {t.description || t.type} ({formatCents(t.base_amount)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                    <input
                      id="input-upload-receipt"
                      type="file"
                      accept="image/*,application/pdf"
                      style={{ fontSize: '0.76rem' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        const targetTxId = attachmentTxId || transactions[0]?.id;
                        if (!file || !repoRef.current || !targetTxId) return;
                        const processed = await compressReceiptImageIfPossible(file);
                        const att = repoRef.current.createAttachment({
                          transactionId: targetTxId,
                          fileName: processed.fileName,
                          mimeType: processed.mimeType,
                          dataBytes: processed.bytes,
                        });
                        setRecentAttachments(
                          repoRef.current.getAttachmentsForTransaction(targetTxId)
                        );
                        await syncAndRefresh(repoRef.current);
                        setStatusBanner(
                          `Allegato "${att.file_name}" (${(processed.bytes.byteLength / 1024).toFixed(1)} KB) salvato con storage_type = "${att.storage_type}".`
                        );
                      }}
                    />
                  </div>

                  {recentAttachments.length > 0 && (
                    <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
                      {recentAttachments.map((att) => (
                        <span key={att.id} className="chip override-include">
                          <Paperclip size={11} /> {att.file_name} [{att.storage_type}]
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </section>
          </>
        )}

        {/* =========================================================
            TAB 3: TRICOUNT (SPESE DI GRUPPO & MINIMUM CASH FLOW)
           ========================================================= */}
        {activeTab === 'tricount' && (
          <>
            <div className="card">
              <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <h2 className="card-title">
                    <Users size={18} />
                    Gruppi Tricount &amp; Risolutore Minimum Cash Flow
                  </h2>
                  <select
                    aria-label="Seleziona Gruppo Tricount"
                    className="select"
                    style={{ width: 'auto', fontWeight: 600 }}
                    value={activeTricountGroup?.group.id ?? ''}
                    onChange={(e) => {
                      const nextId = e.target.value;
                      setSelectedGroupId(nextId);
                      const grp = tricountGroups.find((g) => g.group.id === nextId);
                      if (grp && grp.members.length > 0) {
                        setTricountPaidById(grp.members[0].id);
                      }
                    }}
                  >
                    {tricountGroups.map((g) => (
                      <option key={g.group.id} value={g.group.id}>
                        {g.group.name} ({g.group.default_currency})
                      </option>
                    ))}
                  </select>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <label
                      htmlFor="select-tricount-competence-mode"
                      style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}
                    >
                      Modalità Quote a Debito:
                    </label>
                    <select
                      id="select-tricount-competence-mode"
                      className="select"
                      style={{ width: 'auto', fontSize: '0.78rem' }}
                      value={String(dashboard.settings.include_tricount_owes_immediately)}
                      onChange={async (e) => {
                        if (!repoRef.current) return;
                        const val = e.target.value;
                        repoRef.current.updateWorkspaceSettings({
                          includeTricountOwesImmediately: val === '1',
                        });
                        await syncAndRefresh(repoRef.current);
                        setStatusBanner(
                          val === '1'
                            ? 'Tricount impostato su Competenza Economica (include_tricount_owes_immediately = 1).'
                            : 'Tricount impostato su Criterio di Cassa al Rimborso (include_tricount_owes_immediately = 0).'
                        );
                      }}
                    >
                      <option value="1">
                        1 — Competenza Economica (Impatto immediato alla data spesa)
                      </option>
                      <option value="0">
                        0 — Criterio di Cassa (Impatto al Rimborso tricount_settlement)
                      </option>
                    </select>
                  </div>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!repoRef.current || !newGroupName.trim()) return;
                    const names = newGroupMembersCsv
                      .split(',')
                      .map((s) => s.trim())
                      .filter(Boolean);
                    if (names.length < 2) return;
                    const created = repoRef.current.createTricountGroup({
                      name: newGroupName.trim(),
                      defaultCurrency: newGroupCurrency,
                      members: names.map((n, idx) => ({
                        name: n,
                        isMe: idx === 0,
                      })),
                    });
                    setNewGroupName('');
                    setSelectedGroupId(created.group.id);
                    setTricountPaidById(created.members[0]?.id ?? '');
                    await syncAndRefresh(repoRef.current);
                  }}
                  style={{ display: 'flex', gap: '0.45rem', flexWrap: 'wrap' }}
                >
                  <input
                    className="input"
                    style={{ width: '170px' }}
                    placeholder="Nome nuovo gruppo..."
                    value={newGroupName}
                    onChange={(e) => setNewGroupName(e.target.value)}
                  />
                  <select
                    id="new-group-currency"
                    aria-label="Valuta Default Gruppo"
                    className="select"
                    style={{ width: '85px' }}
                    value={newGroupCurrency}
                    onChange={(e) => setNewGroupCurrency(e.target.value)}
                  >
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="CHF">CHF</option>
                    <option value="GBP">GBP</option>
                  </select>
                  <input
                    className="input"
                    style={{ width: '220px' }}
                    placeholder="Membri (es. Andrea, Marco, Giulia)"
                    value={newGroupMembersCsv}
                    onChange={(e) => setNewGroupMembersCsv(e.target.value)}
                  />
                  <button type="submit" className="btn">
                    <Plus size={14} /> Crea Gruppo
                  </button>
                </form>
              </div>

              {activeTricountGroup && (
                <div className="grid-2">
                  {/* Saldi Netti + Piano di Rimborso Ottimizzato */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div
                      style={{
                        padding: '1rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.65rem' }}>
                        Saldi Netti dei Partecipanti ({activeTricountGroup.group.default_currency})
                      </h3>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        {activeTricountGroup.balances.map((b) => {
                          const memberObj = activeTricountGroup.members.find(
                            (m) => m.id === b.memberId
                          );
                          return (
                            <div
                              key={b.memberId}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.45rem 0.65rem',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              <span style={{ fontWeight: 600 }}>
                                {b.memberName}{' '}
                                {memberObj?.is_me === 1 && (
                                  <span className="chip override-include">is_me = 1</span>
                                )}
                              </span>
                              <span
                                className="mono-num"
                                style={{
                                  fontWeight: 700,
                                  color:
                                    b.netBalanceCents > 0
                                      ? 'var(--status-safe)'
                                      : b.netBalanceCents < 0
                                        ? 'var(--status-danger)'
                                        : 'var(--text-muted)',
                                }}
                              >
                                {b.netBalanceCents > 0 ? '+' : ''}
                                {formatCents(
                                  b.netBalanceCents,
                                  activeTricountGroup.group.default_currency
                                )}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Greedy Minimum Cash Flow Settlements */}
                    <div
                      style={{
                        padding: '1rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-strong)',
                      }}
                    >
                      <h3 style={{ fontSize: '0.88rem', fontWeight: 700, marginBottom: '0.25rem' }}>
                        Piano di Rimborso Ottimizzato (<code>calculateTricountSettlements</code>)
                      </h3>
                      <p className="card-subtitle" style={{ marginBottom: '0.75rem' }}>
                        Algoritmo Greedy Minimum Cash Flow per azzerare i debiti col minimo numero di bonifici
                      </p>

                      {activeTricountGroup.settlements.length === 0 ? (
                        <div className="chip override-include">
                          Tutti i conti del gruppo sono in pareggio!
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                          {activeTricountGroup.settlements.map((s, idx) => (
                            <div
                              key={idx}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '0.6rem 0.75rem',
                                borderRadius: 'var(--radius-sm)',
                                backgroundColor: 'var(--bg-surface)',
                                border: '1px solid var(--border-subtle)',
                              }}
                            >
                              <div>
                                <strong>{s.fromMemberName}</strong> deve a{' '}
                                <strong>{s.toMemberName}</strong>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                                <span className="mono-num" style={{ fontWeight: 700 }}>
                                  {formatCents(
                                    s.amountCents,
                                    activeTricountGroup.group.default_currency
                                  )}
                                </span>
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary"
                                  onClick={async () => {
                                    if (!repoRef.current) return;
                                    repoRef.current.recordTricountSettlement({
                                      groupId: activeTricountGroup.group.id,
                                      fromMemberId: s.fromMemberId,
                                      toMemberId: s.toMemberId,
                                      amountCents: s.amountCents,
                                      date: referenceDate,
                                      personalAccountId: tricountLinkAccount || accounts[0]?.id,
                                    });
                                    await syncAndRefresh(repoRef.current);
                                    setStatusBanner(
                                      `Rimborso di ${formatCents(s.amountCents)} registrato (${s.fromMemberName} → ${s.toMemberName}).`
                                    );
                                  }}
                                >
                                  Registra Rimborso
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Form Nuova Spesa di Gruppo */}
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!repoRef.current || !activeTricountGroup || !tricountTitle.trim()) {
                        return;
                      }
                      const amountCents = parseMajorToCents(tricountAmountMajor);
                      const rate = Number.parseFloat(tricountRateToGroup) || 1.0;

                      const participants = activeTricountGroup.members.map((m) => {
                        const rawVal = tricountMemberShares[m.id];
                        const parsed = Number.parseFloat(rawVal ?? '');
                        return {
                          memberId: m.id,
                          shareValue:
                            tricountSplitMode === 'exact'
                              ? parseMajorToCents(rawVal || '0')
                              : Number.isNaN(parsed)
                                ? 1
                                : parsed,
                        };
                      });

                      repoRef.current.createTricountExpense({
                        groupId: activeTricountGroup.group.id,
                        paidByMemberId:
                          tricountPaidById || activeTricountGroup.members[0].id,
                        title: tricountTitle.trim(),
                        amountCents,
                        currency: tricountCurrency,
                        exchangeRateToGroup: rate,
                        date: referenceDate,
                        splitMode: tricountSplitMode,
                        participants,
                        personalAccountId: tricountLinkAccount || null,
                        personalCategoryId: tricountLinkCategory || null,
                      });

                      setTricountTitle('');
                      await syncAndRefresh(repoRef.current);
                      setStatusBanner(
                        'Spesa Tricount salvata e quota personale sincronizzata col DailyBudget.'
                      );
                    }}
                    style={{
                      padding: '1rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: 'var(--bg-elevated)',
                      border: '1px solid var(--border-subtle)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                    }}
                  >
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700 }}>
                      Aggiungi Spesa di Gruppo (Multi-Valuta &amp; Collegamento DailyBudget)
                    </h3>

                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="tricount-title">Titolo Spesa</label>
                        <input
                          id="tricount-title"
                          className="input"
                          placeholder="es. Cena Baita / Benzina Autostrada"
                          value={tricountTitle}
                          onChange={(e) => setTricountTitle(e.target.value)}
                        />
                      </div>

                      <div className="field">
                        <label htmlFor="tricount-paid-by">Pagato Da</label>
                        <select
                          id="tricount-paid-by"
                          className="select"
                          value={tricountPaidById || activeTricountGroup.members[0]?.id}
                          onChange={(e) => setTricountPaidById(e.target.value)}
                        >
                          {activeTricountGroup.members.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name} {m.is_me === 1 ? '(Io)' : ''}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field">
                        <label htmlFor="tricount-amount">Importo Totale Spesa</label>
                        <div style={{ display: 'flex', gap: '0.35rem' }}>
                          <input
                            id="tricount-amount"
                            className="input mono-num"
                            value={tricountAmountMajor}
                            onChange={(e) => setTricountAmountMajor(e.target.value)}
                          />
                          <select
                            aria-label="Valuta Spesa Tricount"
                            className="select"
                            style={{ width: '85px' }}
                            value={tricountCurrency}
                            onChange={(e) => {
                              const curr = e.target.value;
                              setTricountCurrency(curr);
                              if (curr === activeTricountGroup.group.default_currency) {
                                setTricountRateToGroup('1.0');
                              } else if (curr === 'CHF') {
                                setTricountRateToGroup('1.06');
                              } else if (curr === 'USD') {
                                setTricountRateToGroup('0.92');
                              }
                            }}
                          >
                            <option value="EUR">EUR</option>
                            <option value="CHF">CHF</option>
                            <option value="USD">USD</option>
                            <option value="GBP">GBP</option>
                          </select>
                        </div>
                      </div>

                      <div className="field">
                        <label htmlFor="tricount-split-mode">Modalità Divisione</label>
                        <select
                          id="tricount-split-mode"
                          className="select"
                          value={tricountSplitMode}
                          onChange={(e) => setTricountSplitMode(e.target.value as SplitMode)}
                        >
                          <option value="equal">Parti Uguali (equal)</option>
                          <option value="shares">Quote / Pesi (shares)</option>
                          <option value="percentage">Percentuale % (percentage)</option>
                          <option value="exact">Importo Esatto € (exact)</option>
                        </select>
                      </div>
                    </div>

                    {tricountSplitMode !== 'equal' && (
                      <div className="grid-2" style={{ gap: '0.5rem' }}>
                        {activeTricountGroup.members.map((m) => (
                          <div key={m.id} className="field">
                            <label>
                              {m.name} ({tricountSplitMode})
                            </label>
                            <input
                              className="input mono-num"
                              placeholder={
                                tricountSplitMode === 'percentage'
                                  ? '25'
                                  : tricountSplitMode === 'shares'
                                    ? '1'
                                    : '20.00'
                              }
                              value={tricountMemberShares[m.id] ?? ''}
                              onChange={(e) =>
                                setTricountMemberShares((prev) => ({
                                  ...prev,
                                  [m.id]: e.target.value,
                                }))
                              }
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="form-grid">
                      <div className="field">
                        <label htmlFor="tricount-link-acc">
                          Collega al mio Conto (Regola B: Cashflow vs Quota Mia)
                        </label>
                        <select
                          id="tricount-link-acc"
                          className="select"
                          value={tricountLinkAccount}
                          onChange={(e) => setTricountLinkAccount(e.target.value)}
                        >
                          <option value="">-- Non collegare conto --</option>
                          {accounts.map((a) => (
                            <option key={a.id} value={a.id}>
                              {a.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="field">
                        <label htmlFor="tricount-link-cat">Categoria per la mia Quota</label>
                        <select
                          id="tricount-link-cat"
                          className="select"
                          value={tricountLinkCategory}
                          onChange={(e) => setTricountLinkCategory(e.target.value)}
                        >
                          {categories
                            .filter((c) => c.type === 'expense')
                            .map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>

                    <button type="submit" className="btn btn-primary">
                      <Plus size={15} /> Registra Spesa Tricount
                    </button>
                  </form>
                </div>
              )}
            </div>

            {/* Storico Spese del Gruppo */}
            {activeTricountGroup && (
              <section className="card">
                <div className="card-header">
                  <h3 className="card-title">
                    Storico Spese &amp; Rimborsi — {activeTricountGroup.group.name}
                  </h3>
                </div>
                <div className="tx-list">
                  {activeTricountGroup.expenses.map((exp) => (
                    <div key={exp.id} className="tx-row">
                      <div className="tx-main">
                        <div className="tx-title">
                          <span>{exp.title}</span>
                          <span className="chip">{exp.expense_type}</span>
                        </div>
                        <div className="tx-meta">
                          <span>{exp.date}</span>
                          <span>•</span>
                          <span>
                            Pagato da <strong>{exp.paid_by_name}</strong>
                          </span>
                          {exp.splits.map((s) => (
                            <span key={s.id} className="chip">
                              {s.member_name}: {formatCents(s.owed_group_amount)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="mono-num" style={{ fontWeight: 700 }}>
                        {formatCents(
                          exp.group_amount,
                          activeTricountGroup.group.default_currency
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}

        {/* =========================================================
            TAB 4: PRESTITI & DEBITI (loans)
           ========================================================= */}
        {activeTab === 'loans' && (
          <div className="grid-2">
            <section className="card">
              <div className="card-header">
                <div>
                  <h2 className="card-title">
                    <HandCoins size={17} />
                    Posizioni Attive (Crediti <code>lent</code> &amp; Debiti <code>borrowed</code>)
                  </h2>
                  <p className="card-subtitle">
                    Traccia capitale iniziale, residuo e impatto opzionale delle rate sul DailyBudget
                  </p>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {loans.map((ln) => {
                  const repaid = ln.principal_amount - ln.remaining_amount;
                  const pct =
                    ln.principal_amount > 0
                      ? Math.round((repaid / ln.principal_amount) * 100)
                      : 100;
                  return (
                    <div
                      key={ln.id}
                      style={{
                        padding: '1rem',
                        borderRadius: 'var(--radius-md)',
                        backgroundColor: 'var(--bg-elevated)',
                        border: '1px solid var(--border-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.65rem',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                          <strong style={{ fontSize: '0.94rem' }}>{ln.name}</strong>
                          <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>
                            Controparte: <strong>{ln.counterparty_name}</strong> • Stato:{' '}
                            {ln.status}
                          </div>
                        </div>
                        <span
                          className={`chip ${
                            ln.type === 'lent' ? 'override-include' : 'override-exclude'
                          }`}
                        >
                          {ln.type === 'lent'
                            ? 'CREDITO (Soldi Prestati)'
                            : 'DEBITO / FINANZIAMENTO'}
                        </span>
                      </div>

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.84rem' }}>
                        <span>
                          Residuo:{' '}
                          <strong className="mono-num">
                            {formatCents(ln.remaining_amount, ln.currency)}
                          </strong>
                        </span>
                        <span className="mono-num" style={{ color: 'var(--text-muted)' }}>
                          su {formatCents(ln.principal_amount, ln.currency)} ({pct}% saldato)
                        </span>
                      </div>

                      <div className="progress-track" style={{ height: 8 }}>
                        <div
                          className="progress-fill"
                          style={{
                            width: `${pct}%`,
                            backgroundColor:
                              ln.type === 'lent'
                                ? 'var(--status-safe)'
                                : 'var(--accent-primary)',
                          }}
                        />
                      </div>

                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          gap: '0.5rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span className="chip">
                          count_installments_in_budget: {ln.count_installments_in_budget}
                        </span>

                        {ln.remaining_amount > 0 && (
                          <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                            <input
                              aria-label={`Importo rata per ${ln.name}`}
                              className="input mono-num"
                              style={{ width: '100px', padding: '0.28rem 0.5rem' }}
                              placeholder="100.00"
                              value={installmentAmounts[ln.id] ?? '100.00'}
                              onChange={(e) =>
                                setInstallmentAmounts((prev) => ({
                                  ...prev,
                                  [ln.id]: e.target.value,
                                }))
                              }
                            />
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              onClick={async () => {
                                if (!repoRef.current || accounts.length === 0) return;
                                const amt = parseMajorToCents(
                                  installmentAmounts[ln.id] ?? '100.00'
                                );
                                if (amt <= 0) return;
                                repoRef.current.recordLoanInstallment({
                                  loanId: ln.id,
                                  accountId: accounts[0].id,
                                  amountCents: amt,
                                  date: referenceDate,
                                });
                                await syncAndRefresh(repoRef.current);
                                setStatusBanner(
                                  `Registrato movimento di ${formatCents(amt)} su "${ln.name}".`
                                );
                              }}
                            >
                              Registra Rata / Rimborso
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="card">
              <div className="card-header">
                <h2 className="card-title">
                  <Plus size={17} /> Nuovo Prestito o Finanziamento
                </h2>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!repoRef.current || !newLoanName.trim() || !newLoanCounterparty.trim()) {
                    return;
                  }
                  repoRef.current.createLoan({
                    name: newLoanName.trim(),
                    counterpartyName: newLoanCounterparty.trim(),
                    type: newLoanType,
                    principalAmountCents: parseMajorToCents(newLoanPrincipalMajor),
                    startDate: referenceDate,
                    countInstallmentsInBudget: newLoanCountBudget,
                  });
                  setNewLoanName('');
                  setNewLoanCounterparty('');
                  await syncAndRefresh(repoRef.current);
                }}
                style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}
              >
                <div className="field">
                  <label htmlFor="loan-name">Nome Prestito / Finanziamento</label>
                  <input
                    id="loan-name"
                    className="input"
                    placeholder="es. Finanziamento Auto / Prestito a Marco"
                    value={newLoanName}
                    onChange={(e) => setNewLoanName(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="loan-counterparty">Controparte</label>
                  <input
                    id="loan-counterparty"
                    className="input"
                    placeholder="es. Findomestic / Marco Rossi"
                    value={newLoanCounterparty}
                    onChange={(e) => setNewLoanCounterparty(e.target.value)}
                  />
                </div>

                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="loan-type">Direzione</label>
                    <select
                      id="loan-type"
                      className="select"
                      value={newLoanType}
                      onChange={(e) =>
                        setNewLoanType(e.target.value as 'lent' | 'borrowed')
                      }
                    >
                      <option value="borrowed">Debito / Finanziamento (borrowed)</option>
                      <option value="lent">Credito / Soldi Prestati (lent)</option>
                    </select>
                  </div>

                  <div className="field">
                    <label htmlFor="loan-principal">Capitale Iniziale (€)</label>
                    <input
                      id="loan-principal"
                      className="input mono-num"
                      value={newLoanPrincipalMajor}
                      onChange={(e) => setNewLoanPrincipalMajor(e.target.value)}
                    />
                  </div>
                </div>

                <label
                  style={{
                    fontSize: '0.82rem',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={newLoanCountBudget}
                    onChange={(e) => setNewLoanCountBudget(e.target.checked)}
                  />
                  Includi automaticamente le rate nel calcolo del DailyBudget (
                  <code>count_installments_in_budget = 1</code>)
                </label>

                <button type="submit" className="btn btn-primary">
                  <Plus size={15} /> Crea Posizione
                </button>
              </form>
            </section>
          </div>
        )}

        {/* =========================================================
            TAB 5: CRYPTO PORTFOLIO (WAC & P&L ENGINE)
           ========================================================= */}
        {activeTab === 'crypto' && (
          <>
            {/* Crypto KPIs */}
            <div className="grid-4">
              <div className="card">
                <div className="metric-label">Valore Attuale Portfolio</div>
                <div className="metric-value mono-num" style={{ fontSize: '1.45rem' }}>
                  {formatCents(cryptoSummary.totalValueCents)}
                </div>
              </div>

              <div className="card">
                <div className="metric-label">Costo Storico di Carico (WAC Basis)</div>
                <div className="metric-value mono-num" style={{ fontSize: '1.45rem' }}>
                  {formatCents(cryptoSummary.totalCostBasisCents)}
                </div>
              </div>

              <div className="card">
                <div className="metric-label">P&amp;L Non Realizzato (Unrealized)</div>
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
                <div className="metric-label">P&amp;L Realizzato (Vendite Chiuse)</div>
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

            <div className="grid-dashboard">
              {/* Tabella Holdings & WAC */}
              <section className="card">
                <div className="card-header">
                  <div>
                    <h2 className="card-title">
                      <Coins size={17} />
                      Asset in Portafoglio &amp; Calcolo WAC (<code>calculateCryptoAssetMetrics</code>)
                    </h2>
                    <p className="card-subtitle">
                      Quantità con precisione 8 decimali, Prezzo Medio di Carico (PMC) e aggiornamento prezzi offline/online
                    </p>
                  </div>

                  <button
                    id="btn-sync-markets-crypto"
                    type="button"
                    className="btn btn-sm"
                    onClick={handleSyncMarkets}
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
                        <th>PMC (WAC)</th>
                        <th>Prezzo Mercato</th>
                        <th>Valore Attuale</th>
                        <th>P&amp;L Unrealized</th>
                        <th>P&amp;L Realized</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cryptoSummary.assets.map(({ asset, metrics }) => (
                        <tr key={asset.id}>
                          <td>
                            <strong>{asset.symbol}</strong>
                            <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>
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
                                style={{ width: '105px', padding: '0.25rem 0.45rem', fontSize: '0.78rem' }}
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
                                title="Aggiorna prezzo e ricalcola widget_snapshot"
                                onClick={async () => {
                                  if (!repoRef.current) return;
                                  const raw =
                                    priceEditMap[asset.id] ??
                                    (asset.current_price_base / 100).toFixed(2);
                                  const nextCents = parseMajorToCents(raw);
                                  if (nextCents <= 0) return;
                                  repoRef.current.updateCryptoAssetPrice(
                                    asset.id,
                                    nextCents
                                  );
                                  await syncAndRefresh(repoRef.current);
                                }}
                              >
                                <RefreshCw size={12} />
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
                    </h2>
                    <p className="card-subtitle">
                      Acquisto, Vendita (calcola Realized P&amp;L) o Staking Reward (abbassa PMC)
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!repoRef.current || !cryptoAssetId) return;
                    repoRef.current.createCryptoTransaction({
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
                    await syncAndRefresh(repoRef.current);
                    setStatusBanner(
                      cryptoLinkedAccountId
                        ? 'Operazione Crypto + movimento Fiat bancario collegato registrati (WAC e widget_snapshot aggiornati).'
                        : 'Operazione Crypto salvata: WAC e widget_snapshot ricalcolati.'
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
                        <option value="buy">Acquisto (buy)</option>
                        <option value="sell">Vendita (sell)</option>
                        <option value="staking_reward">Staking Reward (costo 0)</option>
                        <option value="transfer_in">Deposito (transfer_in)</option>
                        <option value="transfer_out">Prelievo (transfer_out)</option>
                      </select>
                    </div>

                    <div className="field">
                      <label htmlFor="crypto-qty">Quantità (Stringa Decimale)</label>
                      <input
                        id="crypto-qty"
                        className="input mono-num"
                        value={cryptoQty}
                        onChange={(e) => setCryptoQty(e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="crypto-price">Prezzo Unitario (€)</label>
                      <input
                        id="crypto-price"
                        className="input mono-num"
                        disabled={cryptoTxType === 'staking_reward'}
                        value={
                          cryptoTxType === 'staking_reward' ? '0.00' : cryptoPriceMajor
                        }
                        onChange={(e) => setCryptoPriceMajor(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="form-grid">
                    <div className="field">
                      <label htmlFor="crypto-fee">Commissione / Fee (€)</label>
                      <input
                        id="crypto-fee"
                        className="input mono-num"
                        value={cryptoFeeMajor}
                        onChange={(e) => setCryptoFeeMajor(e.target.value)}
                      />
                    </div>

                    <div className="field">
                      <label htmlFor="crypto-linked-account">
                        Conto Bancario Fiat Collegato (<code>linked_account_id</code>)
                      </label>
                      <select
                        id="crypto-linked-account"
                        className="select"
                        value={cryptoLinkedAccountId}
                        onChange={(e) => setCryptoLinkedAccountId(e.target.value)}
                      >
                        <option value="">-- Nessun movimento Fiat automatico --</option>
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
                      placeholder="es. PAC mensile / Staking nativo"
                      value={cryptoNotes}
                      onChange={(e) => setCryptoNotes(e.target.value)}
                    />
                  </div>

                  <label
                    style={{
                      fontSize: '0.8rem',
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
                    Conta come PAC nel DailyBudget (<code>include_in_budget = 1</code>)
                  </label>

                  <button type="submit" className="btn btn-primary">
                    <HardDrive size={15} /> Registra nel Portfolio Crypto
                  </button>
                </form>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
