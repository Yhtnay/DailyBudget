import type {
  AccountRow,
  CategoryRow,
  CryptoAssetRow,
  CryptoTransactionRow,
  LoanRow,
  RecurringRuleRow,
  TagRow,
  TransactionRow,
  TransactionSplitRow,
  TricountExpenseRow,
  TricountGroupRow,
  TricountMemberRow,
  TricountSplitRow,
  WorkspaceSettingsRow,
} from './schema.ts';
import { DailyBudgetRepository } from './database.ts';

export interface SyncDeltaPacket {
  version: 2;
  exportedAt: number;
  sinceTimestamp: number;
  tables: {
    workspace_settings: WorkspaceSettingsRow[];
    accounts: AccountRow[];
    categories: CategoryRow[];
    tags: TagRow[];
    loans: LoanRow[];
    tricount_groups: TricountGroupRow[];
    tricount_members: TricountMemberRow[];
    tricount_expenses: TricountExpenseRow[];
    tricount_splits: TricountSplitRow[];
    recurring_rules: RecurringRuleRow[];
    transactions: TransactionRow[];
    transaction_splits: TransactionSplitRow[];
    transaction_tags: Array<{ transaction_id: string; tag_id: string }>;
    crypto_assets: CryptoAssetRow[];
    crypto_transactions: CryptoTransactionRow[];
  };
}

/**
 * Opens an external `.dbbudget` SQLite3 binary, extracts its `SyncDeltaPacket`,
 * and applies a Row-Level Last-Write-Wins (LWW) merge into `targetRepo`,
 * preserving soft-delete tombstones (`is_deleted = 1`) and recomputing
 * all account balances and `widget_snapshot`.
 */
export async function mergeExternalDbBudgetBinary(
  targetRepo: DailyBudgetRepository,
  externalBytes: Uint8Array,
  options?: { wasmUrl?: string }
): Promise<{ mergedRowsCount: number }> {
  const sourceRepo = await DailyBudgetRepository.fromBinary(externalBytes, {
    wasmUrl: options?.wasmUrl,
    referenceDate: targetRepo.getReferenceDate(),
  });
  const packet = sourceRepo.exportRawTablesForSync(0);
  return targetRepo.applyRawTablesLwwMerge(packet);
}
