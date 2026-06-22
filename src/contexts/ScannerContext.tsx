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
  discoveryRate: number;
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
  lastScannedTagInfo: { particulars: string; category: string } | null;
  scanAttempts: ScanAttempt[];
  totalScans: number;
  uniqueTagsCount: number;
  categoryCount: Record<string, number>;
  missingItems: Record<string, { tagId: string; particulars: string; itemCode: string }[]>;
  pendingCount: number;
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
  const [uniqueTagsCount, setUniqueTagsCount] = useState(0); // ← NEW: instant local unique count
  const [lastScannedTagInfo, setLastScannedTagInfo] = useState<{ particulars: string; category: string } | null>(null);
  const [categoryCount, setCategoryCount] = useState<Record<string, number>>({});
  const [missingItems, setMissingItems] = useState<Record<string, { tagId: string; particulars: string; itemCode: string }[]>>({});
  const tagMapRef = useRef<Record<string, { category: string; particulars: string; itemCode: string }>>({});
  const totalScansRef = useRef(0);
  const [scanRate, setScanRate] = useState(0);
  const [pulseTrigger, setPulseTrigger] = useState(0);
  const [sessionMode, setSessionModeState] = useState<SessionMode>('S1');
  const [smartMode, setSmartModeState] = useState(false);
  const [minRssiThreshold, setMinRssiThreshold] = useState(-90); // raised from -80 to -90
  const { toast } = useToast();
  const isOnline = useOnlineStatus();
  const [pendingCount, setPendingCount] = useState(0);

  // Build missing items grouped by category
  const buildMissingItems = (
    map: Record<string, { category: string; particulars: string; itemCode: string }>,
    scannedSet: Set<string>
  ) => {
    const missing: Record<string, { tagId: string; particulars: string; itemCode: string }[]> = {};
    for (const [tagId, item] of Object.entries(map)) {
      if (!scannedSet.has(tagId)) {
        if (!missing[item.category]) missing[item.category] = [];
        missing[item.category].push({
          tagId,
          particulars: item.particulars,
          itemCode: item.itemCode,
        });
      }
    }
    setMissingItems(missing);
  };

  // Session-based duplicate tracking
  const sessionScansRef = useRef<Set<string>>(new Set());
  const tagCountsRef = useRef<Map<string, number>>(new Map());

  // Server-confirmed tags (only send new unique tags to API)
  const serverConfirmedTagsRef = useRef<Set<string>>(new Set());

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

  // Discovery rate tracking
  const scanStartTimeRef = useRef<number | null>(null);
  const discoveryTimestampsRef = useRef<number[]>([]);
  const lastSessionSwitchRef = useRef(0);
  const noNewTagsStartRef = useRef<number | null>(null);
  const rssiValuesRef = useRef<number[]>([]);

  // API batch buffer (200ms — only for Supabase, not UI)
  const apiBatchBufferRef = useRef<string[]>([]);
  const lastBatchTimeRef = useRef(Date.now());
  const scanCountInLastSecondRef = useRef<number[]>([]);
  const lastMilestoneRef = useRef(0);

  // Fetch expected inventory count
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        // Load expected count
        const stats = await api.getStats();
        const totalWithRfid = stats.stats?.reduce((sum: number, s: any) => sum + (s.totalWithRfid || 0), 0) || 0;
        setSmartScanStats(prev => ({ ...prev, expectedTotal: totalWithRfid }));

        // Load full tag map into memory
       const map = await api.getTagMap();
        tagMapRef.current = map;
        console.log(`🗺️ Tag map ready: ${Object.keys(map).length} tags`);

        // Don't build missing items on load — only during active scan
        // buildMissingItems(map, new Set());
      } catch (e) {
        console.error('Failed to fetch initial data:', e);
      }
    };
    fetchInitialData();
  }, []);

  // Smart mode: monitor discovery rate and auto-switch sessions
  useEffect(() => {
    if (!smartMode || !scanning) return;

    const smartInterval = setInterval(() => {
      const now = Date.now();
      const startTime = scanStartTimeRef.current || now;
      const elapsedSeconds = Math.floor((now - startTime) / 1000);

      const recentDiscoveries = discoveryTimestampsRef.current.filter(t => now - t < 5000);
      const discoveryRate = recentDiscoveries.length / 5;

      const rssiVals = rssiValuesRef.current;
      const rssiMin = rssiVals.length > 0 ? Math.min(...rssiVals.slice(-100)) : 0;
      const rssiMax = rssiVals.length > 0 ? Math.max(...rssiVals.slice(-100)) : 0;
      const rssiAvg = rssiVals.length > 0 ? Math.round(rssiVals.slice(-100).reduce((a, b) => a + b, 0) / Math.min(rssiVals.length, 100)) : 0;

      const uniqueCount = sessionScansRef.current.size;
      let currentPhase: 'discovery' | 'sweep' | 'complete' = 'discovery';

      if (discoveryRate < 0.4 && uniqueCount > 10 && elapsedSeconds > 10) {
        if (sessionMode === 'S1' && now - lastSessionSwitchRef.current > 15000) {
          console.log('🔄 Smart Mode: switching to S0 for sweep...');
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

      setSmartScanStats(prev => ({
        uniqueTagsFound: uniqueCount,
        expectedTotal: prev.expectedTotal,
        discoveryRate: Math.round(discoveryRate * 10) / 10,
        scanComplete: currentPhase === 'complete',
        elapsedSeconds,
        currentPhase,
        rssiMin,
        rssiMax,
        rssiAvg,
      }));
    }, 1000);

    return () => clearInterval(smartInterval);
  }, [smartMode, scanning, sessionMode, scanner, toast]);

  // API batch — fires every 200ms, only sends to Supabase
  useEffect(() => {
    const batchInterval = setInterval(() => {
      if (apiBatchBufferRef.current.length === 0) return;

      const batchCopy = [...apiBatchBufferRef.current];
      apiBatchBufferRef.current = [];

      // Reload tag map fresh on new cycle
    api.getTagMap().then(map => {
      tagMapRef.current = map;
      console.log(`🗺️ Tag map reloaded: ${Object.keys(map).length} tags`);
      setMissingItems({});
    });

      // Scan rate calculation
      scanCountInLastSecondRef.current.push(batchCopy.length);
      if (scanCountInLastSecondRef.current.length > 4) {
        scanCountInLastSecondRef.current.shift();
      }
      const avgRate = Math.round(
        (scanCountInLastSecondRef.current.reduce((a, b) => a + b, 0) /
          scanCountInLastSecondRef.current.length) * 5
      );
      setScanRate(avgRate);

      // Only send new unique tags to server
      const newTagIds = batchCopy.filter(tagId => !serverConfirmedTagsRef.current.has(tagId));
      const uniqueNewTagIds = [...new Set(newTagIds)];

      if (uniqueNewTagIds.length > 0) {
        (async () => {
          if (isOnline) {
            try {
              const result = await api.batchScan(uniqueNewTagIds);
              if (result?.results) {
                for (const r of result.results) {
                  if (r.success) serverConfirmedTagsRef.current.add(r.tagId);
                }
              }
            } catch (error) {
              console.error('Batch scan failed, saving offline:', error);
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
    }, 200);

    return () => clearInterval(batchInterval);
  }, [isOnline]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline) {
      syncManager.syncPendingScans().then(({ synced, failed }) => {
        if (synced > 0) {
          toast({
            title: `✅ Synced ${synced} offline scans`,
            description: failed > 0 ? `${failed} failed` : 'All scans uploaded successfully',
            duration: 4000
          });
        }
      });
      syncManager.getPendingCount().then(setPendingCount);
    }
  }, [isOnline]);

  // Track pending count
  useEffect(() => {
    syncManager.onPendingCountChange(setPendingCount);
    syncManager.getPendingCount().then(setPendingCount);
  }, []);

  // Reset scan rate when idle
  useEffect(() => {
    const rateResetInterval = setInterval(() => {
      if (apiBatchBufferRef.current.length === 0 && Date.now() - lastBatchTimeRef.current > 2000) {
        setScanRate(0);
        scanCountInLastSecondRef.current = [];
      }
    }, 2000);
    return () => clearInterval(rateResetInterval);
  }, []);

  // Tag scanned callback — UI updates immediately, API batched separately
  useEffect(() => {
    scanner.setOnStatusChange(setScannerStatus);
    scanner.setOnBatteryUpdate(setBatteryPercentage);
    scanner.setOnTagScanned((data: TagReadData) => {
      const { tagId, rssi } = data;

      // RSSI filter
      if (rssi < minRssiThreshold) {
        console.log(`📶 Filtered weak tag: ${tagId} (RSSI: ${rssi} < ${minRssiThreshold})`);
        return;
      }

      rssiValuesRef.current.push(rssi);
      setLastScannedTag(tagId);
      setPulseTrigger(prev => prev + 1);

      const isDuplicate = sessionScansRef.current.has(tagId);
      const currentCount = (tagCountsRef.current.get(tagId) || 0) + 1;
      tagCountsRef.current.set(tagId, currentCount);

      if (!isDuplicate) {
        sessionScansRef.current.add(tagId);
        discoveryTimestampsRef.current.push(Date.now());

        // Look up category from local tag map
        const itemInfo = tagMapRef.current[tagId];
        const category = itemInfo?.category || 'Unknown';

        // Skip tags not in inventory — don't count them or update missing
        if (!itemInfo) {
          console.log(`⚠️ Unknown tag: ${tagId} — not in inventory, skipping`);
          return;
        }
        // Update last scanned item info immediately
        setLastScannedTagInfo({
          particulars: itemInfo?.particulars || 'Unknown Item',
          category: itemInfo?.category || 'Unknown'
        });
        console.log(`✓ New unique tag: ${tagId} | Category: ${category} (RSSI: ${rssi})`);

        // ── Update UI counters immediately ──
        const newUniqueCount = sessionScansRef.current.size;
        setUniqueTagsCount(newUniqueCount);

        // ── Update category count immediately ──
        setCategoryCount(prev => ({
          ...prev,
          [category]: (prev[category] || 0) + 1
        }));

        // ── Auto-stop when all items found ──
        const totalTagged = Object.keys(tagMapRef.current).length;
        if (totalTagged > 0 && sessionScansRef.current.size >= totalTagged) {
          console.log('🎉 All items found! Auto-stopping scan...');
          scanner.stopScan();
          setScanning(false);
          toast({
            title: '🎉 All Items Found!',
            description: `All ${totalTagged} RFID tagged items scanned successfully.`,
            duration: 5000
          });
        }

        // Milestones
        const milestones = [10, 50, 100, 500, 1000, 2000, 5000];
        const reached = milestones.find(m => newUniqueCount === m);
        if (reached) {
          lastMilestoneRef.current = reached;
          toast({
            title: `🎯 ${reached} unique tags scanned!`,
            duration: 3000
          });
        }

        // Queue for API batch
        apiBatchBufferRef.current.push(tagId);
      } else {
        console.log(`↻ Duplicate: ${tagId} (count: ${currentCount}, RSSI: ${rssi})`);
      }

      // ── Update scan attempts list immediately (for LiveScans page) ──
      const scanTime = new Date().toLocaleString();
      setScanAttempts(prev => [{
        tagId,
        time: scanTime,
        success: true,
        duplicate: isDuplicate,
        count: currentCount,
        rssi
      }, ...prev].slice(0, 200));
    });

    return () => {
      scanner.disconnect();
    };
  }, [scanner, minRssiThreshold, toast]);

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
    // Build full missing items list at scan start — everything is missing initially
    buildMissingItems(tagMapRef.current, new Set());
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
    setUniqueTagsCount(0);
    setCategoryCount({});
    setMissingItems({});
    totalScansRef.current = 0;
    setScanRate(0);
    lastMilestoneRef.current = 0;
    scanCountInLastSecondRef.current = [];
    sessionScansRef.current.clear();
    tagCountsRef.current.clear();
    serverConfirmedTagsRef.current.clear();
    apiBatchBufferRef.current = [];
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
                   mode === 'S1' ? 'Balanced (recommended)' :
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
        uniqueTagsCount,
        categoryCount,
        missingItems,
        pendingCount,
        lastScannedTagInfo,
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