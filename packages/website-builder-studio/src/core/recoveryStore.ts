import type { WebsiteDocument } from '../types';

export interface WebsiteRecoveryRecord {
  projectId: string;
  savedAt: string;
  document: WebsiteDocument;
}

const DATABASE_NAME = 'eventos-website-builder';
const STORE_NAME = 'draft-recovery';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: 'projectId' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const database = await openDatabase();
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, mode);
      const request = operation(transaction.objectStore(STORE_NAME));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      transaction.onerror = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

export async function loadWebsiteRecovery(projectId: string): Promise<WebsiteRecoveryRecord | undefined> {
  if (typeof indexedDB === 'undefined') return undefined;
  return transact<WebsiteRecoveryRecord | undefined>('readonly', store => store.get(projectId));
}

export async function saveWebsiteRecovery(projectId: string, document: WebsiteDocument): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await transact<IDBValidKey>('readwrite', store => store.put({ projectId, savedAt: new Date().toISOString(), document }));
}

export async function deleteWebsiteRecovery(projectId: string): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  await transact<undefined>('readwrite', store => store.delete(projectId));
}
