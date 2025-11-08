import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { RFIDScanner } from '@/lib/rfidScanner';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { syncManager } from '@/lib/syncManager';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface ScanAttempt {
  tagId: string;
  time: string;
  success: boolean;
  duplicate: boolean;
}

interface ScannerContextType {
  scanner: RFIDScanner;
  scanning: boolean;
  scannerStatus: string;
  lastScannedTag: string | null;
  scanAttempts: ScanAttempt[];
  clearScanAttempts: () => void;
  connectScanner: () => Promise<boolean>;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  toggleScan: () => Promise<void>;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

export const ScannerProvider = ({ children }: { children: ReactNode }) => {
  const [scanner] = useState(() => new RFIDScanner());
  const [scanning, setScanning] = useState(false);
  const [scannerStatus, setScannerStatus] = useState('Not connected');
  const [lastScannedTag, setLastScannedTag] = useState<string | null>(null);
  const [scanAttempts, setScanAttempts] = useState<ScanAttempt[]>([]);
  const { toast } = useToast();
  const isOnline = useOnlineStatus();
  
  // Cooldown map to prevent duplicate scans (4 second cooldown)
  const recentScansRef = useState<Map<string, number>>(() => new Map())[0];
  const COOLDOWN_MS = 4000;

  useEffect(() => {
    scanner.setOnStatusChange(setScannerStatus);
    scanner.setOnTagScanned(async (tagId) => {
      // Check cooldown - ignore if scanned within last 4 seconds
      const now = Date.now();
      const lastScanTime = recentScansRef.get(tagId);
      
      if (lastScanTime && (now - lastScanTime) < COOLDOWN_MS) {
        console.log(`Tag ${tagId} ignored - within cooldown period`);
        return; // Ignore this scan completely
      }
      
      // Update cooldown timestamp
      recentScansRef.set(tagId, now);
      
      // Clean up old entries (older than 10 seconds)
      for (const [key, time] of recentScansRef.entries()) {
        if (now - time > 10000) {
          recentScansRef.delete(key);
        }
      }
      
      setLastScannedTag(tagId);
      console.log('Tag scanned:', tagId);
      
      const scanTime = new Date().toLocaleString();
      
      // If offline, save to local storage
      if (!isOnline) {
        await syncManager.addPendingScan(tagId);
        
        setScanAttempts(prev => [{
          tagId,
          time: scanTime,
          success: true,
          duplicate: false
        }, ...prev]);
        
        toast({ 
          title: '📴 Saved Offline', 
          description: `Tag: ${tagId.substring(0, 8)}... (will sync later)`,
          duration: 2000
        });
        return;
      }
      
      // Online - try to send to server
      try {
        const response = await api.scan(tagId);
        console.log('Scan API response:', response);
        
        // Record ALL scan attempts locally
        setScanAttempts(prev => [{
          tagId,
          time: scanTime,
          success: response.success || false,
          duplicate: response.duplicate || false
        }, ...prev]);
        
        if (response.success) {
          toast({ 
            title: '✓ Scanned', 
            description: `Tag: ${tagId.substring(0, 8)}...`,
            duration: 2000
          });
        } else if (response.duplicate) {
          toast({ 
            title: 'Already Scanned', 
            description: `Tag: ${tagId.substring(0, 8)}...`,
            variant: 'default',
            duration: 2000
          });
        }
      } catch (error) {
        console.error('Scan API error:', error);
        
        // Save to offline storage as fallback
        await syncManager.addPendingScan(tagId);
        
        setScanAttempts(prev => [{
          tagId,
          time: scanTime,
          success: true,
          duplicate: false
        }, ...prev]);
        
        toast({ 
          title: '📴 Saved Offline', 
          description: 'Server unreachable, saved locally',
          duration: 3000
        });
      }
    });

    // Cleanup on app unmount only
    return () => {
      scanner.disconnect();
    };
  }, [scanner, toast, isOnline]);

  const connectScanner = async () => {
    const connected = await scanner.connect();
    if (connected) {
      toast({ title: 'Scanner Connected', description: 'Ready to scan' });
    }
    return connected;
  };

  const startScan = async () => {
    await scanner.startScan();
    setScanning(true);
  };

  const stopScan = async () => {
    await scanner.stopScan();
    setScanning(false);
  };

  const toggleScan = async () => {
    if (scanning) {
      await stopScan();
    } else {
      await startScan();
    }
  };

  const clearScanAttempts = () => {
    setScanAttempts([]);
  };

  return (
    <ScannerContext.Provider
      value={{
        scanner,
        scanning,
        scannerStatus,
        lastScannedTag,
        scanAttempts,
        clearScanAttempts,
        connectScanner,
        startScan,
        stopScan,
        toggleScan,
      }}
    >
      {children}
    </ScannerContext.Provider>
  );
};

export const useScanner = () => {
  const context = useContext(ScannerContext);
  if (context === undefined) {
    throw new Error('useScanner must be used within a ScannerProvider');
  }
  return context;
};
