import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { RFIDScanner, SessionMode } from '@/lib/rfidScanner';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';
import { syncManager } from '@/lib/syncManager';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface ScanAttempt {
  tagId: string;
  time: string;
  success: boolean;
  duplicate: boolean;
  count: number;
}

interface ScannerContextType {
  scanner: RFIDScanner;
  scanning: boolean;
  scannerStatus: string;
  batteryPercentage: number | null;
  lastScannedTag: string | null;
  scanAttempts: ScanAttempt[];
  totalScans: number;
  scanRate: number;
  pulseTrigger: number;
  sessionMode: SessionMode;
  clearScanAttempts: () => void;
  connectScanner: () => Promise<boolean>;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  toggleScan: () => Promise<void>;
  setSessionMode: (mode: SessionMode) => Promise<void>;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

export const ScannerProvider = ({ children }: { children: ReactNode }) => {
  const [scanner] = useState(() => new RFIDScanner());
  const [scanning, setScanning] = useState(false);
  const [scannerStatus, setScannerStatus] = useState('Not connected');
  const [batteryPercentage, setBatteryPercentage] = useState<number | null>(null);
  const [lastScannedTag, setLastScannedTag] = useState<string | null>(null);
  const [scanAttempts, setScanAttempts] = useState<ScanAttempt[]>([]);
  const [totalScans, setTotalScans] = useState(0);
  const totalScansRef = useRef(0);
  const [scanRate, setScanRate] = useState(0);
  const [pulseTrigger, setPulseTrigger] = useState(0);
  const [sessionMode, setSessionModeState] = useState<SessionMode>('S1');
  const { toast } = useToast();
  const isOnline = useOnlineStatus();
  
  // Session-based duplicate tracking (no cooldown, just track scanned tags per session)
  const sessionScansRef = useState<Set<string>>(() => new Set())[0];
  const tagCountsRef = useState<Map<string, number>>(() => new Map())[0];
  
  // Batching for API calls (10 tags or 100ms, whichever comes first)
  const scanBufferRef = useState<Array<{ tagId: string; time: string }>>(() => [])[0];
  const lastBatchTimeRef = useRef(Date.now());
  const scanCountInLastSecondRef = useRef<number[]>([]);
  const lastMilestoneRef = useRef(0);

  // Batched UI updates every 500ms for smooth performance
  useEffect(() => {
    const batchInterval = setInterval(() => {
      if (scanBufferRef.length === 0) return;

      const now = Date.now();
      const timeSinceLastBatch = now - lastBatchTimeRef.current;
      
      // Calculate scan rate (tags per second)
      const scansInBatch = scanBufferRef.length;
      scanCountInLastSecondRef.current.push(scansInBatch);
      
      // Keep only last 2 seconds of data for rate calculation
      if (scanCountInLastSecondRef.current.length > 4) {
        scanCountInLastSecondRef.current.shift();
      }
      
      const avgRate = Math.round(
        (scanCountInLastSecondRef.current.reduce((a, b) => a + b, 0) / 
        scanCountInLastSecondRef.current.length) * 2 // Convert to per-second rate
      );
      
      setScanRate(avgRate);

      // Update total scan count
      const newTotal = totalScans + scansInBatch;
      setTotalScans(newTotal);

      // Check for milestones (10, 50, 100, 500, 1000, etc.)
      const milestones = [10, 50, 100, 500, 1000, 2000, 5000];
      const reachedMilestone = milestones.find(
        m => newTotal >= m && lastMilestoneRef.current < m
      );
      
      if (reachedMilestone) {
        lastMilestoneRef.current = reachedMilestone;
        toast({
          title: `🎯 Milestone: ${reachedMilestone} scans!`,
          description: `Scan rate: ${avgRate} tags/sec`,
          duration: 3000
        });
      }

      // Trigger pulse feedback for batch
      setPulseTrigger(prev => prev + 1);

      // Add to scan attempts with counts (limit to last 100 for performance)
      setScanAttempts(prev => [
        ...scanBufferRef.map(scan => {
          const count = tagCountsRef.get(scan.tagId) || 1;
          const isDuplicate = count > 1;
          return {
            tagId: scan.tagId,
            time: scan.time,
            success: true,
            duplicate: isDuplicate,
            count
          };
        }),
        ...prev
      ].slice(0, 100));

      // Process scans to server using batch API (background, non-blocking)
      (async () => {
        if (scanBufferRef.length > 0) {
          const tagIds = scanBufferRef.map(scan => scan.tagId);
          
          if (isOnline) {
            try {
              await api.batchScan(tagIds);
            } catch (error) {
              console.error('Batch scan failed, falling back to offline storage:', error);
              // Fallback to offline storage
              for (const tagId of tagIds) {
                await syncManager.addPendingScan(tagId);
              }
            }
          } else {
            // Offline: store all for later sync
            for (const tagId of tagIds) {
              await syncManager.addPendingScan(tagId);
            }
          }
        }
      })();

      // Clear buffer
      scanBufferRef.length = 0;
      lastBatchTimeRef.current = now;
    }, 500);

    return () => clearInterval(batchInterval);
  }, [totalScans, isOnline, toast]);

  // Reset scan rate when no scans for 2 seconds
  useEffect(() => {
    const rateResetInterval = setInterval(() => {
      if (scanBufferRef.length === 0 && Date.now() - lastBatchTimeRef.current > 2000) {
        setScanRate(0);
        scanCountInLastSecondRef.current = [];
      }
    }, 2000);

    return () => clearInterval(rateResetInterval);
  }, []);

  useEffect(() => {
    scanner.setOnStatusChange(setScannerStatus);
    scanner.setOnBatteryUpdate(setBatteryPercentage);
    scanner.setOnTagScanned(async (tagId) => {
      // Immediate processing - no cooldown!
      setLastScannedTag(tagId);
      
      // Track duplicate status
      const isDuplicate = sessionScansRef.has(tagId);
      const currentCount = (tagCountsRef.get(tagId) || 0) + 1;
      
      if (!isDuplicate) {
        sessionScansRef.add(tagId);
        console.log(`✓ New tag: ${tagId}`);
      } else {
        console.log(`↻ Duplicate: ${tagId} (count: ${currentCount})`);
      }
      
      // Update count
      tagCountsRef.set(tagId, currentCount);
      
      const scanTime = new Date().toLocaleString();
      
      // Add to buffer for immediate processing
      scanBufferRef.push({ tagId, time: scanTime });
    });

    // Cleanup on app unmount only
    return () => {
      scanner.disconnect();
    };
  }, [scanner]);

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
    setTotalScans(0);
    setScanRate(0);
    lastMilestoneRef.current = 0;
    scanCountInLastSecondRef.current = [];
    sessionScansRef.clear();
    tagCountsRef.clear();
  };

  const setSessionMode = async (mode: SessionMode) => {
    await scanner.setSession(mode);
    setSessionModeState(mode);
    toast({
      title: `Session Mode: ${mode}`,
      description: mode === 'S0' ? 'Max speed, most duplicates' :
                   mode === 'S1' ? 'Balanced (recommended for dense areas)' :
                   mode === 'S2' ? 'Fewer duplicates, slower discovery' :
                   'Minimal duplicates, one-time reads',
      duration: 3000
    });
  };

  return (
    <ScannerContext.Provider
      value={{
        scanner,
        scanning,
        scannerStatus,
        batteryPercentage,
        lastScannedTag,
        scanAttempts,
        totalScans,
        scanRate,
        pulseTrigger,
        sessionMode,
        clearScanAttempts,
        connectScanner,
        startScan,
        stopScan,
        toggleScan,
        setSessionMode,
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
