import { offlineDb } from './offlineDb';
import { api } from './api';

export class SyncManager {
  private syncing = false;
  private listeners: Array<(count: number) => void> = [];

  onPendingCountChange(callback: (count: number) => void) {
    this.listeners.push(callback);
  }

  private notifyListeners(count: number) {
    this.listeners.forEach(cb => cb(count));
  }

  async syncPendingScans(): Promise<{ synced: number; failed: number }> {
    if (this.syncing) {
      return { synced: 0, failed: 0 };
    }

    this.syncing = true;
    let synced = 0;
    let failed = 0;

    try {
      const pendingScans = await offlineDb.getPendingScans();
      
      for (const scan of pendingScans) {
        try {
          await api.scan(scan.tagId);
          await offlineDb.markAsSynced(scan.id!);
          synced++;
        } catch (error) {
          console.error('Failed to sync scan:', scan.tagId, error);
          failed++;
        }
      }

      // Clean up synced records
      await offlineDb.deleteSynced();
      
      // Notify listeners of updated count
      const remainingCount = await offlineDb.getPendingCount();
      this.notifyListeners(remainingCount);
      
    } finally {
      this.syncing = false;
    }

    return { synced, failed };
  }

  async addPendingScan(tagId: string): Promise<void> {
    await offlineDb.addScan(tagId);
    const count = await offlineDb.getPendingCount();
    this.notifyListeners(count);
  }

  async getPendingCount(): Promise<number> {
    return await offlineDb.getPendingCount();
  }
}

export const syncManager = new SyncManager();
