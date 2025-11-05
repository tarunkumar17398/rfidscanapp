import { useEffect, useState } from 'react';
import { Wifi, WifiOff, Cloud } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { syncManager } from '@/lib/syncManager';
import { useToast } from '@/hooks/use-toast';

export const ConnectionStatus = () => {
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    // Initialize pending count
    syncManager.getPendingCount().then(setPendingCount);
    
    // Listen for changes
    syncManager.onPendingCountChange(setPendingCount);
  }, []);

  useEffect(() => {
    // Auto-sync when coming online
    if (isOnline && pendingCount > 0 && !syncing) {
      setSyncing(true);
      
      syncManager.syncPendingScans().then(({ synced, failed }) => {
        if (synced > 0) {
          toast({
            title: '✅ Synced',
            description: `${synced} scan${synced > 1 ? 's' : ''} uploaded to server`,
            duration: 3000,
          });
        }
        if (failed > 0) {
          toast({
            title: 'Sync Failed',
            description: `${failed} scan${failed > 1 ? 's' : ''} failed to sync`,
            variant: 'destructive',
            duration: 3000,
          });
        }
        setSyncing(false);
      });
    }
  }, [isOnline, pendingCount, syncing, toast]);

  if (isOnline && pendingCount === 0) {
    return (
      <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
        <Wifi className="h-4 w-4 text-green-500" />
        <span className="hidden sm:inline">Online</span>
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 text-xs sm:text-sm bg-orange-500/10 text-orange-600 dark:text-orange-400 px-2 py-1 rounded">
        <WifiOff className="h-4 w-4" />
        <span>Offline</span>
        {pendingCount > 0 && (
          <span className="font-semibold">• {pendingCount} pending</span>
        )}
      </div>
    );
  }

  if (syncing) {
    return (
      <div className="flex items-center gap-2 text-xs sm:text-sm bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-1 rounded animate-pulse">
        <Cloud className="h-4 w-4" />
        <span>Syncing {pendingCount}...</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 text-xs sm:text-sm bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 px-2 py-1 rounded">
      <Cloud className="h-4 w-4" />
      <span>{pendingCount} pending</span>
    </div>
  );
};
