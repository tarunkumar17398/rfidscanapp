// IndexedDB for offline scan storage
const DB_NAME = 'rfid_offline_db';
const DB_VERSION = 1;
const STORE_NAME = 'pending_scans';

export interface PendingScan {
  id?: number;
  tagId: string;
  timestamp: number;
  synced: boolean;
}

class OfflineDB {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('synced', 'synced', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };
    });
  }

  async addScan(tagId: string): Promise<number> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const scan: PendingScan = {
        tagId,
        timestamp: Date.now(),
        synced: false
      };
      
      const request = store.add(scan);
      request.onsuccess = () => resolve(request.result as number);
      request.onerror = () => reject(request.error);
    });
  }

  async getPendingScans(): Promise<PendingScan[]> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([STORE_NAME], 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        
        // Get all records and filter in JavaScript for better compatibility
        const request = store.getAll();
        request.onsuccess = () => {
          // Filter to only get unsynced items
          const results = request.result.filter(scan => !scan.synced);
          resolve(results);
        };
        request.onerror = () => {
          console.error('Error getting pending scans:', request.error);
          resolve([]); // Return empty array on error
        };
      } catch (error) {
        console.error('Error in getPendingScans:', error);
        resolve([]); // Return empty array on error
      }
    });
  }

  async markAsSynced(id: number): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      
      const getRequest = store.get(id);
      getRequest.onsuccess = () => {
        const scan = getRequest.result;
        if (scan) {
          scan.synced = true;
          const updateRequest = store.put(scan);
          updateRequest.onsuccess = () => resolve();
          updateRequest.onerror = () => reject(updateRequest.error);
        } else {
          resolve();
        }
      };
      getRequest.onerror = () => reject(getRequest.error);
    });
  }

  async deleteSynced(): Promise<void> {
    if (!this.db) await this.init();
    
    return new Promise((resolve, reject) => {
      try {
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        
        // Get all records and delete synced ones
        const request = store.openCursor();
        request.onsuccess = (event) => {
          const cursor = (event.target as IDBRequest).result;
          if (cursor) {
            if (cursor.value.synced === true) {
              store.delete(cursor.primaryKey);
            }
            cursor.continue();
          } else {
            resolve();
          }
        };
        request.onerror = () => {
          console.error('Error deleting synced items:', request.error);
          resolve(); // Resolve anyway to avoid blocking
        };
      } catch (error) {
        console.error('Error in deleteSynced:', error);
        resolve(); // Resolve anyway to avoid blocking
      }
    });
  }

  async getPendingCount(): Promise<number> {
    try {
      const scans = await this.getPendingScans();
      return scans.length;
    } catch (error) {
      console.error('Error getting pending count:', error);
      return 0;
    }
  }
}

export const offlineDb = new OfflineDB();
