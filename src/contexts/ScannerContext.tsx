import { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { RFIDScanner, SessionMode, TagReadData } from '@/lib/rfidScanner';
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
  rssi: number;
}

export interface SmartScanStats {
  uniqueTagsFound: number;
  expectedTotal: number;
  discoveryRate: number; // new unique tags per second
  scanComplete: boolean;
  elapsedSeconds: number;
  currentPhase: 'discovery' | 'sweep' | 'complete';
  rssiMin: number;
  rssiMax: number;
  rssiAvg: number;
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
  smartMode: boolean;
  smartScanStats: SmartScanStats;
  minRssiThreshold: number;
  clearScanAttempts: () => void;
  connectScanner: () => Promise<boolean>;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  toggleScan: () => Promise<void>;
  setSessionMode: (mode: SessionMode) => Promise<void>;
  setSmartMode: (enabled: boolean) => void;
  setMinRssiThreshold: (rssi: number) => void;
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
  const [smartMode, setSmartModeState] = useState(false);
  const [minRssiThreshold, setMinRssiThreshold] = useState(-80); // dBm, filter weak reads
  const { toast } = useToast();
  const isOnline = useOnlineStatus();
  
  // Session-based duplicate tracking
  const sessionScansRef = useState<Set<string>>(() => new Set())[0];
  const tagCountsRef = useState<Map<string, number>>(() => new Map())[0];
  
  // Server-confirmed tags tracking (Feature 5: only send new tags to API)
  const serverConfirmedTagsRef = useState<Set<string>>(() => new Set())[0];
  
  // Smart scan stats
  const [smartScanStats, setSmartScanStats] = useState<SmartScanStats>({
    uniqueTagsFound: 0,
    expectedTotal: 0,
    discoveryRate: 0,
    scanComplete: false,
    elapsedSeconds: 0,
    currentPhase: 'discovery',
    rssiMin: 0,
    rssiMax: 0,
    rssiAvg: 0,
  });
  
  // Discovery rate tracking for auto-session switching
  const scanStartTimeRef = useRef<number | null>(null);
  const discoveryTimestampsRef = useRef<number[]>([]); // timestamps of unique tag discoveries
  const lastSessionSwitchRef = useRef(0);
  const noNewTagsStartRef = useRef<number | null>(null);
  const rssiValuesRef = useRef<number[]>([]);
  
  // Batching for API calls
  const scanBufferRef = useState<Array<{ tagId: string; time: string; rssi: number }>>(() => [])[0];
  const lastBatchTimeRef = useRef(Date.now());
  const scanCountInLastSecondRef = useRef<number[]>([]);
  const lastMilestoneRef = useRef(0);

  // Fetch expected inventory count for progress tracking
  useEffect(() => {
    const fetchExpectedCount = async () => {
      try {
        const stats = await api.getStats();
        const totalWithRfid = stats.stats?.reduce((sum: number, s: any) => sum + (s.totalWithRfid || 0), 0) || 0;
        setSmartScanStats(prev => ({ ...prev, expectedTotal: totalWithRfid }));
      } catch (e) {
        console.error('Failed to fetch expected inventory count:', e);
      }
    };
    fetchExpectedCount();
  }, []);

  // Smart mode: monitor discovery rate and auto-switch sessions
  useEffect(() => {
    if (!smartMode || !scanning) return;

    const smartInterval = setInterval(() => {
      const now = Date.now();
      const startTime = scanStartTimeRef.current || now;
      const elapsedSeconds = Math.floor((now - startTime) / 1000);

      // Calculate discovery rate (unique tags in last 5 seconds)
      const recentDiscoveries = discoveryTimestampsRef.current.filter(t => now - t < 5000);
      const discoveryRate = recentDiscoveries.length / 5;

      // RSSI stats
      const rssiVals = rssiValuesRef.current;
      const rssiMin = rssiVals.length > 0 ? Math.min(...rssiVals.slice(-100)) : 0;
      const rssiMax = rssiVals.length > 0 ? Math.max(...rssiVals.slice(-100)) : 0;
      const rssiAvg = rssiVals.length > 0 ? Math.round(rssiVals.slice(-100).reduce((a, b) => a + b, 0) / Math.min(rssiVals.length, 100)) : 0;

      const uniqueCount = sessionScansRef.size;
      
      // Auto-session switching logic
      let currentPhase: 'discovery' | 'sweep' | 'complete' = 'discovery';
      
      if (discoveryRate < 0.4 && uniqueCount > 10 && elapsedSeconds > 10) {
        // Discovery rate dropped - switch to S0 for sweep
        if (sessionMode === 'S1' && now - lastSessionSwitchRef.current > 15000) {
          console.log('🔄 Smart Mode: Discovery rate low, switching to S0 for sweep...');
          scanner.setSession('S0');
          setSessionModeState('S0');
          lastSessionSwitchRef.current = now;
          toast({
            title: '🔄 Smart Switch: S0 Sweep Mode',
            description: 'Discovery slowed, switching to thorough re-read mode',
            duration: 3000
          });
        }
        currentPhase = 'sweep';

        // Check if scan is complete (no new tags for 15 seconds in sweep mode)
        if (discoveryRate === 0) {
          if (!noNewTagsStartRef.current) {
            noNewTagsStartRef.current = now;
          } else if (now - noNewTagsStartRef.current > 15000) {
            currentPhase = 'complete';
          }
        } else {
          noNewTagsStartRef.current = null;
        }
      } else {
        noNewTagsStartRef.current = null;
      }

      setSmartScanStats({
        uniqueTagsFound: uniqueCount,
        expectedTotal: smartScanStats.expectedTotal,
        discoveryRate: Math.round(discoveryRate * 10) / 10,
        scanComplete: currentPhase === 'complete',
        elapsedSeconds,
        currentPhase,
        rssiMin,
        rssiMax,
        rssiAvg,
      });
    }, 1000);

    return () => clearInterval(smartInterval);
  }, [smartMode, scanning, sessionMode, scanner, toast, smartScanStats.expectedTotal]);

  // Batched UI updates every 500ms
  useEffect(() => {
    const batchInterval = setInterval(() => {
      if (scanBufferRef.length === 0) return;

      const batchCopy = [...scanBufferRef];
      scanBufferRef.length = 0;

      // Calculate scan rate
      const scansInBatch = batchCopy.length;
      scanCountInLastSecondRef.current.push(scansInBatch);
      
      if (scanCountInLastSecondRef.current.length > 4) {
        scanCountInLastSecondRef.current.shift();
      }
      
      const avgRate = Math.round(
        (scanCountInLastSecondRef.current.reduce((a, b) => a + b, 0) / 
        scanCountInLastSecondRef.current.length) * 2
      );
      
      setScanRate(avgRate);

      totalScansRef.current += scansInBatch;
      const newTotal = totalScansRef.current;
      setTotalScans(newTotal);

      // Milestones
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

      setPulseTrigger(prev => prev + 1);

      // Add to scan attempts with RSSI
      setScanAttempts(prev => [
        ...batchCopy.map(scan => {
          const count = tagCountsRef.get(scan.tagId) || 1;
          const isDuplicate = count > 1;
          return {
            tagId: scan.tagId,
            time: scan.time,
            success: true,
            duplicate: isDuplicate,
            count,
            rssi: scan.rssi
          };
        }),
        ...prev
      ].slice(0, 100));

      // Feature 1 & 5: Only send NEW unique tags to the server
      const newTagIds = batchCopy
        .map(scan => scan.tagId)
        .filter(tagId => !serverConfirmedTagsRef.has(tagId));
      
      // Deduplicate within this batch
      const uniqueNewTagIds = [...new Set(newTagIds)];

      if (uniqueNewTagIds.length > 0) {
        (async () => {
          if (isOnline) {
            try {
              const result = await api.batchScan(uniqueNewTagIds);
              // Mark successfully processed tags as server-confirmed
              if (result?.results) {
                for (const r of result.results) {
                  if (r.success) {
                    serverConfirmedTagsRef.add(r.tagId);
                  }
                }
              }
            } catch (error) {
              console.error('Batch scan failed, falling back to offline storage:', error);
              for (const tagId of uniqueNewTagIds) {
                await syncManager.addPendingScan(tagId);
              }
            }
          } else {
            for (const tagId of uniqueNewTagIds) {
              await syncManager.addPendingScan(tagId);
            }
          }
        })();
      }

      lastBatchTimeRef.current = Date.now();
    }, 500);

    return () => clearInterval(batchInterval);
  }, [isOnline, toast]);

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
    scanner.setOnTagScanned(async (data: TagReadData) => {
      const { tagId, rssi } = data;
      
      // Feature 4: RSSI filtering - skip weak signals
      if (rssi < minRssiThreshold) {
        console.log(`📶 Filtered weak tag: ${tagId} (RSSI: ${rssi} < threshold: ${minRssiThreshold})`);
        return;
      }

      // Track RSSI values for stats
      rssiValuesRef.current.push(rssi);
      
      setLastScannedTag(tagId);
      
      const isDuplicate = sessionScansRef.has(tagId);
      const currentCount = (tagCountsRef.get(tagId) || 0) + 1;
      
      if (!isDuplicate) {
        sessionScansRef.add(tagId);
        // Track discovery timestamp for rate calculation
        discoveryTimestampsRef.current.push(Date.now());
        console.log(`✓ New tag: ${tagId} (RSSI: ${rssi})`);
      } else {
        console.log(`↻ Duplicate: ${tagId} (count: ${currentCount}, RSSI: ${rssi})`);
      }
      
      tagCountsRef.set(tagId, currentCount);
      
      const scanTime = new Date().toLocaleString();
      scanBufferRef.push({ tagId, time: scanTime, rssi });
    });

    return () => {
      scanner.disconnect();
    };
  }, [scanner, minRssiThreshold]);

  const connectScanner = async () => {
    const connected = await scanner.connect();
    if (connected) {
      toast({ title: 'Scanner Connected', description: 'Ready to scan' });
    }
    return connected;
  };

  const startScan = async () => {
    scanStartTimeRef.current = Date.now();
    discoveryTimestampsRef.current = [];
    noNewTagsStartRef.current = null;
    rssiValuesRef.current = [];
    
    // Smart mode: always start with S1 for fast discovery
    if (smartMode && sessionMode !== 'S1') {
      await scanner.setSession('S1');
      setSessionModeState('S1');
      lastSessionSwitchRef.current = Date.now();
    }
    
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
    totalScansRef.current = 0;
    setScanRate(0);
    lastMilestoneRef.current = 0;
    scanCountInLastSecondRef.current = [];
    sessionScansRef.clear();
    tagCountsRef.clear();
    serverConfirmedTagsRef.clear();
    discoveryTimestampsRef.current = [];
    rssiValuesRef.current = [];
    noNewTagsStartRef.current = null;
    setSmartScanStats(prev => ({
      ...prev,
      uniqueTagsFound: 0,
      discoveryRate: 0,
      scanComplete: false,
      elapsedSeconds: 0,
      currentPhase: 'discovery',
      rssiMin: 0,
      rssiMax: 0,
      rssiAvg: 0,
    }));
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

  const setSmartMode = (enabled: boolean) => {
    setSmartModeState(enabled);
    if (enabled) {
      toast({
        title: '🧠 Smart Mode Enabled',
        description: 'Auto-switches S1→S0 when discovery slows down',
        duration: 4000
      });
    }
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
        smartMode,
        smartScanStats,
        minRssiThreshold,
        clearScanAttempts,
        connectScanner,
        startScan,
        stopScan,
        toggleScan,
        setSessionMode,
        setSmartMode,
        setMinRssiThreshold,
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
