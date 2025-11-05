import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useScanner } from '@/contexts/ScannerContext';
import { ArrowLeft } from 'lucide-react';

interface Scan {
  id: number;
  time: string;
  tagId: string;
  itemCode: string;
  category: string;
}

const LiveScans = () => {
  const [scans, setScans] = useState<Scan[]>([]);
  const { scannerStatus, scanning } = useScanner();
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
    <div className="min-h-screen bg-background p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center gap-4">
          <Button variant="outline" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">Live Scans</h1>
          <div className="ml-auto flex items-center gap-3">
            <Badge variant={scanning ? "default" : "secondary"} className="text-sm">
              {scannerStatus}
            </Badge>
            <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span className="h-2 w-2 bg-secondary rounded-full animate-pulse"></span>
              Auto-refreshing every 2 seconds
            </span>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent Scans ({scans.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 font-semibold">Time</th>
                    <th className="text-left p-3 font-semibold">Tag ID</th>
                    <th className="text-left p-3 font-semibold">Item Code</th>
                    <th className="text-left p-3 font-semibold">Category</th>
                  </tr>
                </thead>
                <tbody>
                  {scans.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="text-center p-8 text-muted-foreground">
                        No scans yet. Start scanning to see live data.
                      </td>
                    </tr>
                  ) : (
                    scans.map((scan) => (
                      <tr key={scan.id} className="border-b hover:bg-muted/50 transition-colors">
                        <td className="p-3 font-mono text-sm">{scan.time}</td>
                        <td className="p-3 font-mono text-sm">{scan.tagId}</td>
                        <td className="p-3 font-medium">{scan.itemCode}</td>
                        <td className="p-3">
                          <span className="inline-block px-2 py-1 rounded-full text-xs bg-primary/10 text-primary">
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
