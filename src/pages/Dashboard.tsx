import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useScanner } from '@/contexts/ScannerContext';
import { Play, Square, FileDown, Upload, List, AlertTriangle, LogOut, FileText, RefreshCw } from 'lucide-react';
import { ScanProgress } from '@/components/ScanProgress';
import { Switch } from '@/components/ui/switch';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { ScannerStatus } from '@/components/ScannerStatus';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';
import { AnimatedTableCell } from '@/components/AnimatedTableCell';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SessionMode } from '@/lib/rfidScanner';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

interface CategoryStats {
  category: string;
  total: number;
  totalWithRfid: number;
  totalWithoutRfid: number;
  scanned: number;
  missing: number;
}

interface CycleInfo {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
}

const Dashboard = () => {
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [batteryWarningShown, setBatteryWarningShown] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const {
    scanning, scannerStatus, sessionMode, smartMode, uniqueTagsCount, categoryCount, missingItems, batteryPercentage, pendingCount,,uniqueTagsCount, categoryCount, missingItems, batteryPercentage,
      connectScanner, toggleScan, clearScanAttempts, setSessionMode, setSmartMode
  } = useScanner();
  const navigate = useNavigate();
  const { toast } = useToast();
  const isOnline = useOnlineStatus();

  useEffect(() => {
    if (!sessionStorage.getItem('authenticated')) {
      navigate('/');
      return;
    }

    const savedSyncTime = localStorage.getItem('lastInventorySyncTime');
    if (savedSyncTime) setLastSyncTime(savedSyncTime);

    const lastSyncDate = localStorage.getItem('lastInventorySync');
    const today = new Date().toDateString();

    console.log('=== DASHBOARD INITIALIZATION ===');
    console.log(`Today: ${today}`);
    console.log(`Last sync: ${lastSyncDate || 'never'}`);
    console.log(`Sync needed: ${lastSyncDate !== today}`);

    if (lastSyncDate !== today) {
      console.log('→ Will run auto-sync on first load...');
      setIsSyncing(true);
      autoSyncInventory()
        .then(() => {
          const now = new Date().toISOString();
          localStorage.setItem('lastInventorySync', today);
          localStorage.setItem('lastInventorySyncTime', now);
          setLastSyncTime(now);
          console.log('=== AUTO-SYNC SUCCESS ===');
        })
        .catch((error) => {
          console.error('=== AUTO-SYNC FAILED ===', error);
          toast({ title: 'Sync Failed', description: 'Failed to sync inventory from API', variant: 'destructive' });
        })
        .finally(() => {
          setIsSyncing(false);
          fetchStats();
        });
    } else {
      console.log('→ Already synced today, loading existing data');
      fetchStats();
    }

    let lastFetchTime = 0;
    let pendingFetch: ReturnType<typeof setTimeout> | null = null;

    const channel = supabase
      .channel('scan-updates')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'scans' }, () => {
        const now = Date.now();
        const timeSinceLastFetch = now - lastFetchTime;
        if (timeSinceLastFetch >= 2000) {
          lastFetchTime = now;
          fetchStats();
        } else if (!pendingFetch) {
          const delay = 2000 - timeSinceLastFetch;
          pendingFetch = setTimeout(() => {
            lastFetchTime = Date.now();
            pendingFetch = null;
            fetchStats();
          }, delay);
        }
      })
      .subscribe();

    return () => {
      if (pendingFetch) clearTimeout(pendingFetch);
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (batteryPercentage !== null && batteryPercentage <= 20 && !batteryWarningShown) {
      setBatteryWarningShown(true);
      toast({
        title: '🔋 Low Battery Warning',
        description: `Scanner battery at ${batteryPercentage}%. Please charge soon.`,
        variant: 'destructive',
        duration: 6000
      });
    }
    if (batteryPercentage !== null && batteryPercentage > 20) {
      setBatteryWarningShown(false);
    }
  }, [batteryPercentage, batteryWarningShown, toast]);

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const autoSyncInventory = async () => {
    try {
      console.log('=== AUTO-SYNC START (server-side) ===');
      const { data, error } = await supabase.functions.invoke('sync-inventory');
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Sync failed');
      console.log('=== AUTO-SYNC COMPLETE ===', data);
      toast({
        title: 'Inventory Synced',
        description: `${data.count} items loaded (${data.withRfid} with RFID, ${data.withoutRfid} without)`,
      });
    } catch (error: any) {
      console.error('Auto-sync failed:', error);
    }
  };

  const fetchStats = async () => {
    try {
      const data = await api.getStats();
      setStats(data.stats || []);
      setCycleInfo(data.cycle || null);
    } catch (error) {
      console.error('Failed to fetch stats:', error);
    }
  };

  const handleStartCycle = async () => {
    try {
      await api.startCycle();
      clearScanAttempts();
      localStorage.setItem('cycleStartTime', Date.now().toString());
      toast({ title: 'Success', description: 'New cycle started' });
      fetchStats();

      // Send WhatsApp notification
      fetch('https://evolution-api-n8n.xblns2.easypanel.host/webhook/bd117572-2308-40a7-90d0-323670b97709', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cycle_start',
          date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        })
      }).catch(err => console.error('WhatsApp notification failed:', err));

    } catch (error) {
      toast({ title: 'Error', description: 'Failed to start cycle', variant: 'destructive' });
    }
  };

  const handleFinishCycle = async () => {
    try {
      await api.finishCycle();
      toast({ title: 'Success', description: 'Cycle finished' });
      fetchStats();

      // Calculate duration
      const cycleStartTime = localStorage.getItem('cycleStartTime');
      let duration = 'N/A';
      if (cycleStartTime) {
        const mins = Math.round((Date.now() - parseInt(cycleStartTime)) / 60000);
        duration = mins < 60 ? `${mins} mins` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
        localStorage.removeItem('cycleStartTime');
      }

      const total = stats.reduce((sum, s) => sum + s.totalWithRfid, 0);
      const scanned = stats.reduce((sum, s) => sum + s.scanned, 0);
      const totalMissing = stats.reduce((sum, s) => sum + s.missing, 0);
      const accuracy = total > 0 ? ((scanned / total) * 100).toFixed(1) : '0';

      // Send WhatsApp report
      fetch('https://evolution-api-n8n.xblns2.easypanel.host/webhook/bd117572-2308-40a7-90d0-323670b97709', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'cycle_end',
          date: new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
          duration,
          scanned,
          total,
          accuracy,
          totalMissing,
          categories: stats.map(s => ({
            name: s.category,
            scanned: s.scanned,
            total: s.totalWithRfid,
            missing: s.missing
          }))
        })
      }).catch(err => console.error('WhatsApp report failed:', err));

    } catch (error) {
      toast({ title: 'Error', description: 'Failed to finish cycle', variant: 'destructive' });
    }
  };

  const handleExport = async () => {
    try {
      const blob = await api.exportReport();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `inventory-report-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: 'Success', description: 'Report exported' });
    } catch (error) {
      toast({ title: 'Error', description: 'Export failed', variant: 'destructive' });
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem('authenticated');
    navigate('/');
  };

  const handleForceSync = async () => {
    setIsSyncing(true);
    try {
      await autoSyncInventory();
      const now = new Date().toISOString();
      const today = new Date().toDateString();
      localStorage.setItem('lastInventorySync', today);
      localStorage.setItem('lastInventorySyncTime', now);
      setLastSyncTime(now);
      toast({ title: 'Sync Complete', description: 'Inventory has been refreshed from CK API' });
      await fetchStats();
    } catch (error) {
      toast({ title: 'Sync Failed', description: 'Failed to sync inventory from API', variant: 'destructive' });
    } finally {
      setIsSyncing(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
  };

  const totalScanned = stats.reduce((sum, s) => sum + s.scanned, 0);
  const totalItems = stats.reduce((sum, s) => sum + s.total, 0);
  const totalMissing = stats.reduce((sum, s) => sum + s.missing, 0);
  const totalWithRfid = stats.reduce((sum, s) => sum + (s.totalWithRfid || 0), 0);
  const totalWithoutRfid = stats.reduce((sum, s) => sum + (s.totalWithoutRfid || 0), 0);

  const animatedTotalItems = useAnimatedCounter(totalItems);
  const animatedTotalScanned = useAnimatedCounter(totalScanned);
  const animatedTotalMissing = useAnimatedCounter(totalMissing);
  const animatedTotalWithRfid = useAnimatedCounter(totalWithRfid);
  const animatedTotalWithoutRfid = useAnimatedCounter(totalWithoutRfid);

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 pb-6">

      {isSyncing && (
        <div className="fixed inset-0 bg-background/90 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="p-8 max-w-md mx-4">
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
              <h3 className="text-xl font-semibold">Syncing Inventory</h3>
              <p className="text-muted-foreground">Fetching all items from CK Inventory API...</p>
            </div>
          </Card>
        </div>
      )}

      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">

        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">Inventory Dashboard</h1>
            <ConnectionStatus />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleForceSync} disabled={isSyncing} size="sm" className="h-10">
              <RefreshCw className={`h-4 w-4 sm:mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </Button>
            <Button variant="outline" onClick={handleLogout} size="sm" className="h-10 px-3">
              <LogOut className="h-4 w-4 sm:mr-2" />
              <span className="hidden sm:inline">Logout</span>
            </Button>
          </div>
        </div>

        {lastSyncTime && (
          <div className="text-sm text-muted-foreground">
            Last synced: {new Date(lastSyncTime).toLocaleString('en-IN')}
          </div>
        )}

        {/* Offline pending sync banner */}
        {pendingCount > 0 && (
          <Card className="border-amber-500 bg-amber-500/10">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">📶</span>
                <div>
                  <p className="font-semibold text-amber-600 text-sm">
                    {pendingCount} scans pending sync
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {isOnline ? 'Syncing now...' : 'Will sync when internet is available'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {batteryPercentage !== null && batteryPercentage <= 20 && (
          <Card className="border-destructive bg-destructive/10">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔋</span>
                <div>
                  <p className="font-semibold text-destructive text-sm">Low Battery: {batteryPercentage}%</p>
                  <p className="text-xs text-muted-foreground">Please charge your scanner soon</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {cycleInfo && (
          <Card className="bg-muted/50 border-2">
            <CardContent className="p-4 sm:p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm sm:text-base">Current Cycle: #{cycleInfo.id}</h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      cycleInfo.status === 'active'
                        ? 'bg-secondary text-secondary-foreground'
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      {cycleInfo.status === 'active' ? '● Active' : '● Finished'}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-muted-foreground">Started: {formatDate(cycleInfo.started_at)}</p>
                  {cycleInfo.finished_at && (
                    <p className="text-xs sm:text-sm text-muted-foreground">Finished: {formatDate(cycleInfo.finished_at)}</p>
                  )}
                </div>
                {cycleInfo.status === 'finished' && (
                  <div className="text-xs sm:text-sm text-amber-600 dark:text-amber-500 font-medium">
                    📊 Viewing finished cycle data
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-3 gap-2 sm:gap-4">
          <Card className="border-primary">
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-lg">Total Items</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <p className="text-2xl sm:text-4xl font-bold text-primary tabular-nums">{animatedTotalItems}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {animatedTotalWithRfid} with RFID • {animatedTotalWithoutRfid} without
              </p>
            </CardContent>
          </Card>
          <Card className="border-secondary">
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-lg">Scanned</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <p className="text-2xl sm:text-4xl font-bold text-secondary tabular-nums">
                {scanning ? uniqueTagsCount : animatedTotalScanned}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                {scanning ? 'Live count' : 'RFID tags found'}
              </p>
            </CardContent>
          </Card>
          <Card className="border-destructive">
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-lg">Missing</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <p className="text-2xl sm:text-4xl font-bold text-destructive tabular-nums">{animatedTotalMissing}</p>
              <p className="text-xs text-muted-foreground mt-1">With RFID, not scanned</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">Latest Cycle Results</CardTitle>
            {cycleInfo && (
              <p className="text-sm text-muted-foreground mt-1">
                Cycle #{cycleInfo.id.slice(0, 8)} • Started {formatDate(cycleInfo.started_at)}
              </p>
            )}
          </CardHeader>
          <CardContent className="p-4 sm:p-6 pt-0">
            {!cycleInfo ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No cycle data available</p>
                <p className="text-xs mt-2">Click "New Cycle" to start tracking inventory</p>
              </div>
            ) : stats.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p className="text-sm">No inventory data found</p>
                <p className="text-xs mt-2">Import inventory first to see results</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">With RFID</TableHead>
                      <TableHead className="text-right">Without RFID</TableHead>
                      <TableHead className="text-right">Scanned</TableHead>
                      <TableHead className="text-right">Missing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.map((stat) => {
                      const liveScanned = scanning && categoryCount[stat.category] !== undefined
                        ? categoryCount[stat.category]
                        : stat.scanned;
                      const liveMissing = scanning && categoryCount[stat.category] !== undefined
                        ? Math.max(0, stat.totalWithRfid - (categoryCount[stat.category] || 0))
                        : stat.missing;
                      const progressPct = stat.totalWithRfid > 0
                        ? Math.min(100, Math.round((liveScanned / stat.totalWithRfid) * 100))
                        : 0;
                      return (
                        <TableRow key={stat.category}>
                          <TableCell className="font-medium">
                            <div>{stat.category}</div>
                            <div className="w-full bg-muted rounded-full h-1.5 mt-1">
                              <div
                                className="bg-secondary h-1.5 rounded-full transition-all duration-300"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">{progressPct}%</div>
                          </TableCell>
                          <AnimatedTableCell value={stat.total} className="font-semibold" />
                          <AnimatedTableCell value={stat.totalWithRfid} className="text-primary" />
                          <AnimatedTableCell value={stat.totalWithoutRfid} className="text-muted-foreground" />
                          <TableCell className="text-right font-semibold text-secondary tabular-nums">
                            {liveScanned}
                          </TableCell>
                          <TableCell className="text-right font-semibold text-destructive tabular-nums">
                            {liveMissing}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {scanning && (
          <Card>
            <CardHeader className="p-4 sm:p-6 pb-2">
              <CardTitle className="text-lg sm:text-xl">
                Missing Items
                <span className="ml-2 text-sm font-normal text-muted-foreground">
                  (Live — updates as you scan)
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 sm:p-6 pt-2 space-y-2">
              {['Brass', 'Iron', 'Wood', 'Tanjore Paintings'].map(category => {
                const items = missingItems[category] || [];
                const isExpanded = expandedCategories[category];
                return (
                  <div key={category} className="border rounded-lg overflow-hidden">
                    <button
                      className="w-full flex items-center justify-between p-3 bg-muted/50 hover:bg-muted transition-colors"
                      onClick={() => toggleCategory(category)}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{category}</span>
                        {items.length === 0 ? (
                          <span className="text-xs text-green-500 font-medium">✓ All found</span>
                        ) : (
                          <span className="text-xs bg-destructive/20 text-destructive px-2 py-0.5 rounded-full font-medium">
                            {items.length} missing
                          </span>
                        )}
                      </div>
                      <span className="text-muted-foreground text-sm">{isExpanded ? '▼' : '▶'}</span>
                    </button>
                    {isExpanded && (
                      <div className="divide-y">
                        {items.length === 0 ? (
                          <div className="p-3 text-center text-sm text-green-500">
                            🎉 All {category} items scanned!
                          </div>
                        ) : (
                          items.map(item => (
                            <div key={item.tagId} className="flex items-center justify-between p-3 text-sm">
                              <span className="text-foreground">{item.particulars || 'Unknown Item'}</span>
                              <span className="text-xs text-muted-foreground ml-2">{item.itemCode}</span>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </CardContent>
          </Card>
        )}

        <ScanProgress />

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">Scanner Control</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between p-3 sm:p-4 bg-muted rounded-lg">
              <span className="font-medium text-sm sm:text-base">Status:</span>
              <ScannerStatus />
            </div>
            <div className="flex items-center justify-between p-3 sm:p-4 bg-muted rounded-lg">
              <div className="flex flex-col">
                <span className="font-medium text-sm sm:text-base">Smart Mode</span>
                <span className="text-xs text-muted-foreground mt-0.5">Auto-switches S1→S0 when discovery slows</span>
              </div>
              <Switch checked={smartMode} onCheckedChange={setSmartMode} disabled={scannerStatus === 'Not connected'} />
            </div>
            <div className="flex items-center justify-between p-3 sm:p-4 bg-muted rounded-lg">
              <div className="flex flex-col">
                <span className="font-medium text-sm sm:text-base">Session Mode:</span>
                <span className="text-xs text-muted-foreground mt-0.5">
                  {sessionMode === 'S0' && 'Fast scan, most duplicates'}
                  {sessionMode === 'S1' && 'Balanced for dense areas'}
                  {sessionMode === 'S2' && 'Fewer duplicates'}
                  {sessionMode === 'S3' && 'Minimal duplicates'}
                </span>
              </div>
              <Select
                value={sessionMode}
                onValueChange={(value) => setSessionMode(value as SessionMode)}
                disabled={scannerStatus === 'Not connected' || smartMode}
              >
                <SelectTrigger className="w-20 sm:w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="S0">S0</SelectItem>
                  <SelectItem value="S1">S1</SelectItem>
                  <SelectItem value="S2">S2</SelectItem>
                  <SelectItem value="S3">S3</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:gap-3">
              <Button onClick={connectScanner} variant="outline" className="h-12 sm:h-10 text-xs sm:text-sm">
                Connect Scanner
              </Button>
              <Button onClick={toggleScan} disabled={scannerStatus === 'Not connected'} className="h-12 sm:h-10 text-xs sm:text-sm">
                {scanning
                  ? <><Square className="h-4 w-4 mr-2" /><span>Stop Scan</span></>
                  : <><Play className="h-4 w-4 mr-2" /><span>Start Scan</span></>}
              </Button>
              <Button onClick={handleStartCycle} variant="secondary" className="h-12 sm:h-10 text-xs sm:text-sm">
                <Play className="h-4 w-4 sm:mr-2" />New Cycle
              </Button>
              <Button onClick={handleFinishCycle} variant="destructive" className="h-12 sm:h-10 text-xs sm:text-sm">
                <Square className="h-4 w-4 sm:mr-2" />Finish Cycle
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {stats.map((stat) => (
            <Card key={stat.category}>
              <CardHeader>
                <CardTitle>{stat.category}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Total:</span><span className="font-bold">{stat.total}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">With RFID:</span>
                    <span className="font-semibold text-primary">{stat.totalWithRfid}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">Without RFID:</span>
                    <span className="font-semibold text-muted-foreground">{stat.totalWithoutRfid}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Scanned:</span><span className="font-bold text-secondary">{stat.scanned}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Missing:</span><span className="font-bold text-destructive">{stat.missing}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 mt-2">
                    <div
                      className="bg-secondary h-2 rounded-full transition-all"
                      style={{ width: `${stat.totalWithRfid > 0 ? (stat.scanned / stat.totalWithRfid * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Button onClick={() => navigate('/import')} variant="outline" className="h-16 sm:h-20 text-sm sm:text-base">
            <Upload className="h-5 w-5 sm:mr-2" /><span className="ml-2 sm:ml-0">Import Inventory</span>
          </Button>
          <Button onClick={() => navigate('/live-scans')} variant="outline" className="h-16 sm:h-20 text-sm sm:text-base">
            <List className="h-5 w-5 sm:mr-2" /><span className="ml-2 sm:ml-0">Live Scans</span>
          </Button>
          <Button onClick={() => navigate('/missing')} variant="outline" className="h-16 sm:h-20 text-sm sm:text-base">
            <AlertTriangle className="h-5 w-5 sm:mr-2" /><span className="ml-2 sm:ml-0">Missing Items</span>
          </Button>
          <Button onClick={() => navigate('/reports')} variant="outline" className="h-16 sm:h-20 text-sm sm:text-base">
            <FileText className="h-5 w-5 sm:mr-2" /><span className="ml-2 sm:ml-0">PDF Reports</span>
          </Button>
        </div>

        <Button onClick={handleExport} className="w-full h-14 sm:h-16 text-sm sm:text-base" variant="secondary">
          <FileDown className="h-5 w-5 mr-2" />Export CSV Report
        </Button>

      </div>
    </div>
  );
};

export default Dashboard;