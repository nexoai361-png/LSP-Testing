import { FileTab, EditorSettings } from './types';

const DB_NAME = 'CodeEditorDB';
const DB_VERSION = 1;

export class IndexedDBStorage {
  private db: IDBDatabase | null = null;

  public init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event: IDBVersionChangeEvent) => {
        const db = (event.target as IDBOpenDBRequest).result;
        
        // Create store for FileTabs
        if (!db.objectStoreNames.contains('tabs')) {
          db.createObjectStore('tabs', { keyPath: 'id' });
        }
        
        // Create store for settings / active tab id
        if (!db.objectStoreNames.contains('metadata')) {
          db.createObjectStore('metadata');
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };

      request.onerror = (event) => {
        console.error('[IndexedDB] Open failed:', (event.target as IDBOpenDBRequest).error);
        reject((event.target as IDBOpenDBRequest).error);
      };
    });
  }

  // --- TABS / FILES MANAGEMENT ---

  public saveTabs(tabs: FileTab[]): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const transaction = this.db.transaction('tabs', 'readwrite');
      const store = transaction.objectStore(transaction.objectStoreNames[0] || 'tabs');

      // Clear existing records in the store first
      const clearRequest = store.clear();

      clearRequest.onsuccess = () => {
        let errorOccurred = false;
        
        if (tabs.length === 0) {
          resolve();
          return;
        }

        tabs.forEach((tab) => {
          const putRequest = store.put(tab);
          putRequest.onerror = (e) => {
            errorOccurred = true;
            console.error('[IndexedDB] Save tab failed:', tab.id, (e.target as IDBRequest).error);
          };
        });

        transaction.oncomplete = () => {
          if (errorOccurred) {
            reject(new Error('Failed to save some tabs'));
          } else {
            resolve();
          }
        };

        transaction.onerror = (event) => {
          reject((event.target as IDBTransaction).error);
        };
      };

      clearRequest.onerror = (event) => {
        reject((event.target as IDBRequest).error);
      };
    });
  }

  public loadTabs(): Promise<FileTab[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve([]);

      const transaction = this.db.transaction('tabs', 'readonly');
      const store = transaction.objectStore('tabs');
      const request = store.getAll();

      request.onsuccess = () => {
        resolve(request.result || []);
      };

      request.onerror = (event) => {
        console.error('[IndexedDB] Load tabs failed:', request.error);
        reject(request.error);
      };
    });
  }

  // --- METADATA (Settings & ActiveTabId) ---

  public saveActiveTabId(id: string): Promise<void> {
    return this.setMetadata('activeTabId', id);
  }

  public loadActiveTabId(): Promise<string | null> {
    return this.getMetadata<string>('activeTabId');
  }

  public saveSettings(settings: EditorSettings): Promise<void> {
    return this.setMetadata('settings', settings);
  }

  public loadSettings(): Promise<EditorSettings | null> {
    return this.getMetadata<EditorSettings>('settings');
  }

  // --- GENERIC HELPERS ---

  private setMetadata(key: string, value: any): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) return reject(new Error('Database not initialized'));

      const transaction = this.db.transaction('metadata', 'readwrite');
      const store = transaction.objectStore('metadata');
      const request = store.put(value, key);

      request.onsuccess = () => resolve();
      request.onerror = (event) => reject(request.error);
    });
  }

  private getMetadata<T>(key: string): Promise<T | null> {
    return new Promise((resolve, reject) => {
      if (!this.db) return resolve(null);

      const transaction = this.db.transaction('metadata', 'readonly');
      const store = transaction.objectStore('metadata');
      const request = store.get(key);

      request.onsuccess = () => {
        resolve(request.result !== undefined ? request.result as T : null);
      };
      request.onerror = (event) => reject(request.error);
    });
  }
}
