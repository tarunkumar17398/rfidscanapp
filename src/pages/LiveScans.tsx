import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useScanner } from '@/contexts/ScannerContext';
import { ArrowLeft, Radio } from 'lucide-react';
import { ConnectionStatus } from '@/components/ConnectionStatus';
import { ScanProgress } from '@/components/ScanProgress';

interface Scan {
  id: string; // Changed from number to string (UUID)
  time: string;
  tagId: string;
  itemCode: string;
  category: string;
}

const LiveScans = () => {
  const [scans, setScans] = useState<Scan[]>([]);
  const { scannerStatus, scanning, scanAttempts } = useScanner();
  const navigate = useNavigate();

  useEffect(() => {
    fetchScans();
    const interval = setInterval(fetchScans, 2000);
    return () => clearInterval(interval);
  }, []);

  const fetchScans = async () => {
    try {
      const data = await api.getLiveScans();
      setScans(data.scans || []);
    } catch (error) {
      console.error('Failed to fetch scans:', error);
    }
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 pb-6">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <Button variant="outline" size="sm" onClick={() => navigate('/dashboard')} className="h-10">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-xl sm:text-3xl font-bold">Live Scans</h1>
            <ConnectionStatus />
          </div>
          <div className="flex items-center gap-3 ml-0 sm:ml-auto w-full sm:w-auto justify-between sm:justify-end">
            <Badge variant={scanning ? "default" : "secondary"} className="text-xs sm:text-sm whitespace-nowrap">
              {scannerStatus}
            </Badge>
            <span className="inline-flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
              <span className="h-2 w-2 bg-secondary rounded-full animate-pulse"></span>
              <span className="hidden sm:inline">Auto-refreshing every 2 seconds</span>
              <span className="sm:hidden">Auto-refresh</span>
            </span>
          </div>
        </div>

        {/* Scan Progress */}
        <ScanProgress />

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">All Tag Reads ({scanAttempts.length})</CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground">Shows all scanned tags including duplicates</p>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[500px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 sm:p-3 font-semibold text-xs sm:text-sm">Time</th>
                    <th className="text-left p-2 sm:p-3 font-semibold text-xs sm:text-sm">Tag ID</th>
                    <th className="text-left p-2 sm:p-3 font-semibold text-xs sm:text-sm">RSSI</th>
                    <th className="text-left p-2 sm:p-3 font-semibold text-xs sm:text-sm">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {scanAttempts.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center p-6 sm:p-8 text-muted-foreground text-sm">
                        No scans yet. Start scanning to see live data.
                      </td>
                    </tr>
                  ) : (
                    scanAttempts.map((attempt, index) => (
                      <tr key={index} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="p-2 sm:p-3 font-mono text-xs sm:text-sm">{attempt.time}</td>
                        <td className="p-2 sm:p-3 font-mono text-xs sm:text-sm break-all">{attempt.tagId}</td>
                        <td className="p-2 sm:p-3">
                          {attempt.success ? (
                            <Badge variant="default" className="text-[10px] sm:text-xs">New</Badge>
                          ) : attempt.duplicate ? (
                            <Badge variant="secondary" className="text-[10px] sm:text-xs">Duplicate</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px] sm:text-xs">Error</Badge>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-4 sm:p-6">
            <CardTitle className="text-lg sm:text-xl">Unique Scans - Current Cycle ({scans.length})</CardTitle>
            <p className="text-xs sm:text-sm text-muted-foreground">Only unique items saved to database</p>
          </CardHeader>
          <CardContent className="p-0 sm:p-6">
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="w-full min-w-[600px]">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 sm:p-3 font-semibold text-xs sm:text-sm">Time</th>
                    <th className="text-left p-2 sm:p-3 font-semibold text-xs sm:text-sm">Tag ID</th>
                    <th className="text-left p-2 sm:p-3 font-semibold text-xs sm:text-sm">Item Code</th>
                    <th className="text-left p-2 sm:p-3 font-semibold text-xs sm:text-sm">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center p-6 sm:p-8 text-muted-foreground text-sm">
                        No unique scans in current cycle yet.
                      </td>
                    </tr>
                  ) : (
                    scans.map((scan) => (
                      <tr key={scan.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="p-2 sm:p-3 font-mono text-xs sm:text-sm">{scan.time}</td>
                        <td className="p-2 sm:p-3 font-mono text-xs sm:text-sm break-all">{scan.tagId}</td>
                        <td className="p-2 sm:p-3 font-medium text-xs sm:text-sm">{scan.itemCode}</td>
                        <td className="p-2 sm:p-3">
                          <span className="inline-block px-2 py-1 rounded-full text-[10px] sm:text-xs bg-primary/10 text-primary whitespace-nowrap">
                            {scan.category}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default LiveScans;
