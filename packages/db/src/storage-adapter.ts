// =========================================================
// DAILYBUDGET - LOCAL-FIRST PERSISTENCE & FILE MANAGER
// Integrates OPFS (Origin Private File System) + File System Access API
// + IndexedDB / Anchor Download fallbacks for .dbbudget SQLite files
// =========================================================

export interface FileSystemFileHandleLike {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{
    write(data: Uint8Array | Blob | BufferSource): Promise<void>;
    close(): Promise<void>;
  }>;
  queryPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
  requestPermission?(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
}

export interface OpenedDbBudgetFile {
  fileName: string;
  bytes: Uint8Array;
  fileHandle: FileSystemFileHandleLike | null;
  source: 'file_system_access_api' | 'file_input_fallback';
}

export interface StoragePersistenceState {
  fileName: string;
  opfsSupported: boolean;
  fileSystemAccessSupported: boolean;
  hasBoundDiskHandle: boolean;
  lastSavedAt: number | null;
  storageBackend: 'opfs' | 'indexeddb' | 'memory';
  byteSize: number;
}

const OPFS_DEFAULT_FILENAME = 'active_workspace.dbbudget';
const IDB_DB_NAME = 'dailybudget_local_persistence';
const IDB_STORE_NAME = 'sqlite_snapshots';
const SQLITE_MAGIC_HEADER = 'SQLite format 3\0';

/**
 * Validates that a binary payload starts with the 16-byte SQLite3 format header.
 */
export function isValidSqliteBinary(bytes: Uint8Array): boolean {
  if (!bytes || bytes.byteLength < 16) return false;
  const headerChars = Array.from(bytes.subarray(0, 16))
    .map((b) => String.fromCharCode(b))
    .join('');
  return headerChars === SQLITE_MAGIC_HEADER;
}

export function isOpfsSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.storage !== 'undefined' &&
    typeof navigator.storage.getDirectory === 'function'
  );
}

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'showOpenFilePicker' in window &&
    'showSaveFilePicker' in window
  );
}

// ---------------------------------------------------------
// 1. OPFS (Origin Private File System) + IndexedDB Fallback
// ---------------------------------------------------------

export async function saveBytesToOpfs(
  bytes: Uint8Array,
  fileName: string = OPFS_DEFAULT_FILENAME
): Promise<'opfs' | 'indexeddb' | 'memory'> {
  if (isOpfsSupported()) {
    try {
      const rootDir = await navigator.storage.getDirectory();
      const fileHandle = await rootDir.getFileHandle(fileName, { create: true });
      const writable = await fileHandle.createWritable();
      const bufferCopy = new Uint8Array(bytes.byteLength);
      bufferCopy.set(bytes);
      await writable.write(bufferCopy);
      await writable.close();
      return 'opfs';
    } catch {
      // Fallback to IndexedDB if OPFS fails in private browsing / restricted frame
    }
  }

  const savedToIdb = await saveBytesToIndexedDb(fileName, bytes);
  return savedToIdb ? 'indexeddb' : 'memory';
}

export async function loadBytesFromOpfs(
  fileName: string = OPFS_DEFAULT_FILENAME
): Promise<{ bytes: Uint8Array; backend: 'opfs' | 'indexeddb' } | null> {
  if (isOpfsSupported()) {
    try {
      const rootDir = await navigator.storage.getDirectory();
      const fileHandle = await rootDir.getFileHandle(fileName, { create: false });
      const file = await fileHandle.getFile();
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      if (isValidSqliteBinary(bytes)) {
        return { bytes, backend: 'opfs' };
      }
    } catch {
      // File does not exist yet in OPFS or OPFS unavailable
    }
  }

  const idbBytes = await loadBytesFromIndexedDb(fileName);
  if (idbBytes && isValidSqliteBinary(idbBytes)) {
    return { bytes: idbBytes, backend: 'indexeddb' };
  }

  return null;
}

export async function clearOpfsWorkspace(
  fileName: string = OPFS_DEFAULT_FILENAME
): Promise<void> {
  if (isOpfsSupported()) {
    try {
      const rootDir = await navigator.storage.getDirectory();
      await rootDir.removeEntry(fileName);
    } catch {
      // Ignore if absent
    }
  }
  await deleteFromIndexedDb(fileName);
}

// ---------------------------------------------------------
// 2. FILE SYSTEM ACCESS API (.dbbudget Direct Disk I/O)
// ---------------------------------------------------------

/**
 * Opens a `.dbbudget` file from the user's local disk.
 * Uses File System Access API when available (returning a live writable FileHandle),
 * or falls back to a standard `<input type="file">` picker.
 */
export async function openLocalDbBudgetFile(): Promise<OpenedDbBudgetFile | null> {
  if (isFileSystemAccessSupported()) {
    try {
      const pickerFn = (window as unknown as {
        showOpenFilePicker: (options?: unknown) => Promise<FileSystemFileHandleLike[]>;
      }).showOpenFilePicker;

      const handles = await pickerFn({
        id: 'dailybudget_workspace',
        multiple: false,
        types: [
          {
            description: 'DailyBudget SQLite Workspace (.dbbudget)',
            accept: {
              'application/vnd.sqlite3': ['.dbbudget', '.sqlite', '.db'],
              'application/octet-stream': ['.dbbudget'],
            },
          },
        ],
      });

      if (!handles || handles.length === 0) return null;
      const handle = handles[0];
      const file = await handle.getFile();
      const bytes = new Uint8Array(await file.arrayBuffer());

      if (!isValidSqliteBinary(bytes)) {
        throw new Error(
          `Il file "${file.name}" non è un database SQLite3 valido (.dbbudget).`
        );
      }

      return {
        fileName: file.name,
        bytes,
        fileHandle: handle,
        source: 'file_system_access_api',
      };
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return null;
      }
      throw err;
    }
  }

  return openFileViaInputFallback();
}

/**
 * Writes the raw SQLite binary directly to an already-bound FileSystemFileHandle on disk.
 */
export async function writeBytesToDiskHandle(
  handle: FileSystemFileHandleLike,
  bytes: Uint8Array
): Promise<boolean> {
  try {
    if (handle.queryPermission && handle.requestPermission) {
      const currentPerm = await handle.queryPermission({ mode: 'readwrite' });
      if (currentPerm !== 'granted') {
        const requested = await handle.requestPermission({ mode: 'readwrite' });
        if (requested !== 'granted') return false;
      }
    }

    const writable = await handle.createWritable();
    const bufferCopy = new Uint8Array(bytes.byteLength);
    bufferCopy.set(bytes);
    await writable.write(bufferCopy);
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

/**
 * Prompts the user to save/create a `.dbbudget` file on disk via `showSaveFilePicker`
 * (returning the new live FileSystemFileHandle), or downloads the file as fallback.
 */
export async function saveAsLocalDbBudgetFile(
  bytes: Uint8Array,
  suggestedName: string = 'workspace.dbbudget'
): Promise<{ fileName: string; fileHandle: FileSystemFileHandleLike | null } | null> {
  const normalizedName = suggestedName.endsWith('.dbbudget')
    ? suggestedName
    : `${suggestedName.replace(/\.(sqlite|db)$/i, '')}.dbbudget`;

  if (isFileSystemAccessSupported()) {
    try {
      const savePickerFn = (window as unknown as {
        showSaveFilePicker: (options?: unknown) => Promise<FileSystemFileHandleLike>;
      }).showSaveFilePicker;

      const handle = await savePickerFn({
        id: 'dailybudget_workspace',
        suggestedName: normalizedName,
        types: [
          {
            description: 'DailyBudget SQLite Workspace (.dbbudget)',
            accept: {
              'application/vnd.sqlite3': ['.dbbudget'],
            },
          },
        ],
      });

      await writeBytesToDiskHandle(handle, bytes);
      return {
        fileName: handle.name || normalizedName,
        fileHandle: handle,
      };
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return null;
      }
      // Fall through to standard download if picker blocked by iframe sandbox
    }
  }

  triggerBrowserDownload(bytes, normalizedName);
  return {
    fileName: normalizedName,
    fileHandle: null,
  };
}

export function triggerBrowserDownload(bytes: Uint8Array, fileName: string): void {
  if (typeof document === 'undefined') return;
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: 'application/vnd.sqlite3' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.dbbudget') ? fileName : `${fileName}.dbbudget`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---------------------------------------------------------
// Internal Fallbacks (IndexedDB & <input type="file">)
// ---------------------------------------------------------

function openFileViaInputFallback(): Promise<OpenedDbBudgetFile | null> {
  return new Promise((resolve, reject) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.dbbudget,.sqlite,.db';
    input.style.display = 'none';

    input.onchange = async () => {
      try {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (!isValidSqliteBinary(bytes)) {
          reject(
            new Error(
              `Il file "${file.name}" non è un database SQLite3 valido (.dbbudget).`
            )
          );
          return;
        }
        resolve({
          fileName: file.name,
          bytes,
          fileHandle: null,
          source: 'file_input_fallback',
        });
      } catch (err) {
        reject(err);
      } finally {
        input.remove();
      }
    };

    input.oncancel = () => {
      input.remove();
      resolve(null);
    };

    document.body.appendChild(input);
    input.click();
  });
}

function openIdb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(IDB_DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function saveBytesToIndexedDb(key: string, bytes: Uint8Array): Promise<boolean> {
  const db = await openIdb();
  if (!db) return false;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = tx.objectStore(IDB_STORE_NAME);
      const copy = new Uint8Array(bytes.byteLength);
      copy.set(bytes);
      store.put(copy, key);
      tx.oncomplete = () => {
        db.close();
        resolve(true);
      };
      tx.onerror = () => {
        db.close();
        resolve(false);
      };
    } catch {
      db.close();
      resolve(false);
    }
  });
}

async function loadBytesFromIndexedDb(key: string): Promise<Uint8Array | null> {
  const db = await openIdb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readonly');
      const store = tx.objectStore(IDB_STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => {
        db.close();
        const result = req.result;
        if (result instanceof Uint8Array) {
          resolve(result);
        } else if (result instanceof ArrayBuffer) {
          resolve(new Uint8Array(result));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => {
        db.close();
        resolve(null);
      };
    } catch {
      db.close();
      resolve(null);
    }
  });
}

async function deleteFromIndexedDb(key: string): Promise<void> {
  const db = await openIdb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(IDB_STORE_NAME, 'readwrite');
      tx.objectStore(IDB_STORE_NAME).delete(key);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        resolve();
      };
    } catch {
      db.close();
      resolve();
    }
  });
}
