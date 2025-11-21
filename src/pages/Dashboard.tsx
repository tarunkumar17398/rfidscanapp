import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useScanner } from '@/contexts/ScannerContext';
import { Play, Square, FileDown, Upload, List, AlertTriangle, LogOut, FileText } from 'lucide-react';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { ScannerStatus } from '@/components/ScannerStatus';
import { DebugConsole } from '@/components/DebugConsole';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { supabase } from '@/integrations/supabase/client';
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';
import { AnimatedTableCell } from '@/components/AnimatedTableCell';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SessionMode } from '@/lib/rfidScanner';
import { fetchInventoryFromAPI, InventoryItem } from '@/services/inventoryApi';

const CATEGORY_CODES: Record<string, string> = {
  'Brass': 'BR',
  'Iron': 'IR',
  'Wood': 'WD',
  'Tanjore Paintings': 'TP',
};

interface CategoryStats {
  category: string;
  total: number;
  scanned: number;
  missing: number;
}

interface CycleInfo {
  id: string; // Changed from number to string (UUID)
  status: string;
  started_at: string;
  finished_at: string | null;
}

const Dashboard = () => {
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const [cycleInfo, setCycleInfo] = useState<CycleInfo | null>(null);
  const { scanning, scannerStatus, sessionMode, connectScanner, toggleScan, clearScanAttempts, setSessionMode } = useScanner();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!sessionStorage.getItem('authenticated')) {
      navigate('/');
      return;
    }

    // Auto-sync inventory on startup
    autoSyncInventory();

    fetchStats();
    const interval = setInterval(fetchStats, 2000);

    // Subscribe to real-time scan updates
    const channel = supabase
      .channel('scan-updates')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'scans'
        },
        () => {
          console.log('New scan detected, refreshing stats...');
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, []);

  const autoSyncInventory = async () => {
    try {
      console.log('Auto-syncing inventory from CK Inventory API...');
      const items = await fetchInventoryFromAPI();
      
      // Group items by category based on ITEM CODE prefix
      const itemsByCategory: Record<string, InventoryItem[]> = {
        'Brass': [],
        'Iron': [],
        'Wood': [],
        'Tanjore Paintings': [],
      };

      items.forEach(item => {
        const code = item['ITEM CODE'].substring(0, 2).toUpperCase();
        for (const [category, prefix] of Object.entries(CATEGORY_CODES)) {
          if (code === prefix) {
            itemsByCategory[category].push(item);
            break;
          }
        }
      });

      // Insert items into database for each category
      let totalInserted = 0;
      for (const [category, categoryItems] of Object.entries(itemsByCategory)) {
        if (categoryItems.length === 0) continue;

        // Clear existing items for this category
        await supabase
          .from('inventory')
          .delete()
          .eq('category', category);

        // Insert new items with has_rfid_tag flag
        const inventoryData = categoryItems.map(item => {
          const hasRfid = item['RFID-EPC'] && item['RFID-EPC'].trim() !== '';
          return {
            category,
            item_code: item['ITEM CODE'],
            particulars: item['PARTICULARS'],
            size: item['SIZE'],
            weight: item['Weight'],
            tag_id: hasRfid ? item['RFID-EPC'] : null,
            has_rfid_tag: hasRfid,
          };
        });

        const { error } = await supabase
          .from('inventory')
          .insert(inventoryData);

        if (error) throw error;
        totalInserted += categoryItems.length;
      }

      // Count items with and without RFID tags
      const itemsWithRfid = items.filter(item => item['RFID-EPC'] && item['RFID-EPC'].trim() !== '').length;
      const itemsWithoutRfid = items.length - itemsWithRfid;

      console.log(`Auto-sync complete: ${totalInserted} items synced (${itemsWithRfid} with RFID, ${itemsWithoutRfid} without)`);
      toast({
        title: 'Inventory Synced',
        description: `${totalInserted} items loaded (${itemsWithRfid} with RFID, ${itemsWithoutRfid} without)`,
      });
    } catch (error: any) {
      console.error('Auto-sync failed:', error);
      // Silent fail - don't show error toast on startup
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
      clearScanAttempts(); // Clear local scan history when starting new cycle
      toast({ title: 'Success', description: 'New cycle started' });
      fetchStats();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to start cycle', variant: 'destructive' });
    }
  };

  const handleFinishCycle = async () => {
    try {
      await api.finishCycle();
      toast({ title: 'Success', description: 'Cycle finished' });
      fetchStats();
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

  const totalScanned = stats.reduce((sum, s) => sum + s.scanned, 0);
  const totalItems = stats.reduce((sum, s) => sum + s.total, 0);
  const totalMissing = stats.reduce((sum, s) => sum + s.missing, 0);
  
  // Animated counters for smooth transitions
  const animatedTotalItems = useAnimatedCounter(totalItems);
  const animatedTotalScanned = useAnimatedCounter(totalScanned);
  const animatedTotalMissing = useAnimatedCounter(totalMissing);

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-IN', { 
      dateStyle: 'medium', 
      timeStyle: 'short' 
    });
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 pb-6">
      <div className="max-w-7xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-bold">Inventory Dashboard</h1>
            <ConnectionStatus />
          </div>
          <Button variant="outline" onClick={handleLogout} size="sm" className="h-10 px-3">
            <LogOut className="h-4 w-4 sm:mr-2" />
            <span className="hidden sm:inline">Logout</span>
          </Button>
        </div>

        {/* Cycle Info Card */}
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
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Started: {formatDate(cycleInfo.started_at)}
                  </p>
                  {cycleInfo.finished_at && (
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      Finished: {formatDate(cycleInfo.finished_at)}
                    </p>
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
              <p className="text-xs text-muted-foreground mt-1">With RFID tags</p>
            </CardContent>
          </Card>
          <Card className="border-secondary">
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-lg">Scanned</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <p className="text-2xl sm:text-4xl font-bold text-secondary tabular-nums">{animatedTotalScanned}</p>
              <p className="text-xs text-muted-foreground mt-1">RFID tags found</p>
            </CardContent>
          </Card>
          <Card className="border-destructive">
            <CardHeader className="p-3 sm:p-6">
              <CardTitle className="text-xs sm:text-lg">Missing</CardTitle>
            </CardHeader>
            <CardContent className="p-3 sm:p-6 pt-0">
              <p className="text-2xl sm:text-4xl font-bold text-destructive tabular-nums">{animatedTotalMissing}</p>
              <p className="text-xs text-muted-foreground mt-1">Not yet scanned</p>
            </CardContent>
          </Card>
        </div>

        {/* Latest Cycle Category Stats */}
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
                      <TableHead className="text-right">Scanned</TableHead>
                      <TableHead className="text-right">Missing</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats.map((stat) => (
                      <TableRow key={stat.category}>
                        <TableCell className="font-medium">{stat.category}</TableCell>
                        <AnimatedTableCell value={stat.total} />
                        <AnimatedTableCell value={stat.scanned} className="text-secondary font-semibold" />
                        <AnimatedTableCell value={stat.missing} className="text-destructive font-semibold" />
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">Scanner Control</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 sm:space-y-4 p-4 sm:p-6">
            <div className="flex items-center justify-between p-3 sm:p-4 bg-muted rounded-lg">
              <span className="font-medium text-sm sm:text-base">Status:</span>
              <ScannerStatus />
            </div>
            
            {/* Session Mode Selector */}
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
                disabled={scannerStatus === 'Not connected'}
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
                {scanning ? <><Square className="h-4 w-4 mr-2" /><span>Stop Scan</span></> : <><Play className="h-4 w-4 mr-2" /><span>Start Scan</span></>}
              </Button>
              <Button onClick={handleStartCycle} variant="secondary" className="h-12 sm:h-10 text-xs sm:text-sm">
                <Play className="h-4 w-4 sm:mr-2" />
                New Cycle
              </Button>
              <Button onClick={handleFinishCycle} variant="destructive" className="h-12 sm:h-10 text-xs sm:text-sm">
                <Square className="h-4 w-4 sm:mr-2" />
                Finish Cycle
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
                    <span>Total:</span>
                    <span className="font-bold">{stat.total}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Scanned:</span>
                    <span className="font-bold text-secondary">{stat.scanned}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Missing:</span>
                    <span className="font-bold text-destructive">{stat.missing}</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2 mt-2">
                    <div 
                      className="bg-secondary h-2 rounded-full transition-all"
                      style={{ width: `${stat.total > 0 ? (stat.scanned / stat.total * 100) : 0}%` }}
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <Button onClick={() => navigate('/import')} variant="outline" className="h-16 sm:h-20 text-sm sm:text-base">
            <Upload className="h-5 w-5 sm:mr-2" />
            <span className="ml-2 sm:ml-0">Import Inventory</span>
          </Button>
          <Button onClick={() => navigate('/live-scans')} variant="outline" className="h-16 sm:h-20 text-sm sm:text-base">
            <List className="h-5 w-5 sm:mr-2" />
            <span className="ml-2 sm:ml-0">Live Scans</span>
          </Button>
          <Button onClick={() => navigate('/missing')} variant="outline" className="h-16 sm:h-20 text-sm sm:text-base">
            <AlertTriangle className="h-5 w-5 sm:mr-2" />
            <span className="ml-2 sm:ml-0">Missing Items</span>
          </Button>
          <Button onClick={() => navigate('/reports')} variant="outline" className="h-16 sm:h-20 text-sm sm:text-base">
            <FileText className="h-5 w-5 sm:mr-2" />
            <span className="ml-2 sm:ml-0">PDF Reports</span>
          </Button>
        </div>

        <Button onClick={handleExport} className="w-full h-14 sm:h-16 text-sm sm:text-base" variant="secondary">
          <FileDown className="h-5 w-5 mr-2" />
          Export CSV Report
        </Button>
      </div>
      
      <DebugConsole />
    </div>
  );
};

export default Dashboard;
