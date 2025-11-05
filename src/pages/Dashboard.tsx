import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { api } from '@/lib/api';
import { useScanner } from '@/contexts/ScannerContext';
import { Play, Square, FileDown, Upload, List, AlertTriangle, LogOut } from 'lucide-react';

interface CategoryStats {
  category: string;
  total: number;
  scanned: number;
  missing: number;
}

const Dashboard = () => {
  const [stats, setStats] = useState<CategoryStats[]>([]);
  const { scanning, scannerStatus, connectScanner, toggleScan, clearScanAttempts } = useScanner();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (!sessionStorage.getItem('authenticated')) {
      navigate('/');
      return;
    }

    fetchStats();
    const interval = setInterval(fetchStats, 2000);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const fetchStats = async () => {
    try {
      const data = await api.getStats();
      setStats(data.stats || []);
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

  return (
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold">Inventory Dashboard</h1>
          <Button variant="outline" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="border-primary">
            <CardHeader>
              <CardTitle className="text-lg">Total Items</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-primary">{totalItems}</p>
            </CardContent>
          </Card>
          <Card className="border-secondary">
            <CardHeader>
              <CardTitle className="text-lg">Scanned</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-secondary">{totalScanned}</p>
            </CardContent>
          </Card>
          <Card className="border-destructive">
            <CardHeader>
              <CardTitle className="text-lg">Missing</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-4xl font-bold text-destructive">{totalMissing}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Scanner Control</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
              <span className="font-medium">Status:</span>
              <span className={scanning ? 'text-secondary font-bold' : 'text-muted-foreground'}>{scannerStatus}</span>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Button onClick={connectScanner} variant="outline">
                Connect Scanner
              </Button>
              <Button onClick={toggleScan} disabled={scannerStatus === 'Not connected'}>
                {scanning ? <><Square className="mr-2 h-4 w-4" />Stop Scan</> : <><Play className="mr-2 h-4 w-4" />Start Scan</>}
              </Button>
              <Button onClick={handleStartCycle} variant="secondary">
                <Play className="mr-2 h-4 w-4" />
                New Cycle
              </Button>
              <Button onClick={handleFinishCycle} variant="destructive">
                <Square className="mr-2 h-4 w-4" />
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button onClick={() => navigate('/import')} variant="outline" className="h-20">
            <Upload className="mr-2 h-5 w-5" />
            Import Inventory
          </Button>
          <Button onClick={() => navigate('/live-scans')} variant="outline" className="h-20">
            <List className="mr-2 h-5 w-5" />
            Live Scans
          </Button>
          <Button onClick={() => navigate('/missing')} variant="outline" className="h-20">
            <AlertTriangle className="mr-2 h-5 w-5" />
            Missing Items
          </Button>
        </div>

        <Button onClick={handleExport} className="w-full h-14" variant="secondary">
          <FileDown className="mr-2 h-5 w-5" />
          Export CSV Report
        </Button>
      </div>
    </div>
  );
};

export default Dashboard;
