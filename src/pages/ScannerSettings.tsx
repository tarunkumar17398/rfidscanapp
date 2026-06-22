import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useScanner } from '@/contexts/ScannerContext';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, RefreshCw, Power, Zap } from 'lucide-react';
import { RFIDScanner } from '@/lib/rfidScanner';

const ScannerSettings = () => {
  const navigate = useNavigate();
  const { scanner, scannerStatus, batteryPercentage, uniqueTagsCount } = useScanner();
  const { toast } = useToast();

  const [power, setPower] = useState('26');
  const [qValue, setQValue] = useState('4');
  const [session, setSession] = useState('0');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetched, setIsFetched] = useState(false);

  const isConnected = scannerStatus === 'Connected' || scannerStatus === 'Scanning...';

  // Auto-calculated recommended Q value
  const totalTaggedItems = uniqueTagsCount || 295; // fallback
  const recommendedQ = RFIDScanner.calculateOptimalQValue(totalTaggedItems).toString();

  useEffect(() => {
    scanner.setOnDeviceParams((params) => {
      setPower(params.power.toString());
      setQValue(params.qValue >= 0 ? params.qValue.toString() : qValue);
      setSession(params.session >= 0 ? params.session.toString() : session);
      setIsFetched(true);
      toast({ title: '✅ Settings loaded from scanner', duration: 2000 });
    });
  }, [scanner]);

  const handleGetSettings = async () => {
    if (!isConnected) {
      toast({ title: 'Scanner not connected', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    await scanner.getAllParams();
    setTimeout(() => setIsLoading(false), 2000);
  };

  const handleSetPower = async () => {
    if (!isConnected) return;
    await scanner.setPower(parseInt(power));
    toast({ title: `✅ Power set to ${power} dBm`, duration: 2000 });
  };

  const handleSetQValue = async () => {
    if (!isConnected) return;
    await scanner.setQValue(parseInt(qValue));
    toast({ title: `✅ Q Value set to ${qValue}`, duration: 2000 });
  };

  const handleSetSession = async () => {
    if (!isConnected) return;
    await scanner.setSession(['S0', 'S1', 'S2', 'S3'][parseInt(session)] as any);
    toast({ title: `✅ Session set to S${session}`, duration: 2000 });
  };

  const handleApplyRecommended = async () => {
    if (!isConnected) {
      toast({ title: 'Scanner not connected', variant: 'destructive' });
      return;
    }
    setIsLoading(true);
    try {
      // Set optimal Q value
      const optimalQ = RFIDScanner.calculateOptimalQValue(totalTaggedItems);
      await scanner.setQValue(optimalQ);
      setQValue(optimalQ.toString());
      await new Promise(r => setTimeout(r, 300));

      // Set Session to S1
      await scanner.setSession('S1');
      setSession('1');
      await new Promise(r => setTimeout(r, 300));

      // Set power to max
      await scanner.setPower(26);
      setPower('26');

      toast({
        title: '✅ Recommended settings applied',
        description: `Q Value: ${optimalQ} | Session: S1 | Power: 26dBm`,
        duration: 4000
      });
    } catch (error) {
      toast({ title: 'Failed to apply settings', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleReboot = async () => {
    if (!isConnected) return;
    await scanner.reboot();
    toast({
      title: '🔄 Scanner rebooting...',
      description: 'Reconnect after 5 seconds',
      duration: 5000
    });
  };

  return (
    <div className="min-h-screen bg-background p-3 sm:p-4 pb-6">
      <div className="max-w-lg mx-auto space-y-4">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate('/dashboard')}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-xl font-bold">Scanner Settings</h1>
        </div>

        {/* Device Info */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Device Info</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className={isConnected ? 'text-green-500 font-medium' : 'text-destructive'}>
                {scannerStatus}
              </span>
            </div>
            {batteryPercentage !== null && (
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Battery</span>
                <span className={batteryPercentage <= 20 ? 'text-destructive font-medium' : 'text-foreground'}>
                  {batteryPercentage}%
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total RFID Items</span>
              <span className="font-medium">{totalTaggedItems}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Recommended Q Value</span>
              <span className="font-medium text-primary">{recommendedQ}</span>
            </div>
          </CardContent>
        </Card>

        {/* Recommended Settings */}
        <Card className="border-primary/50 bg-primary/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Zap className="h-5 w-5 text-primary mt-0.5" />
              <div className="flex-1">
                <p className="font-semibold text-sm">Apply Recommended Settings</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Q Value: {recommendedQ} (optimal for {totalTaggedItems} tags) • Session: S1 • Power: 26dBm
                </p>
                <Button
                  className="mt-3 w-full"
                  onClick={handleApplyRecommended}
                  disabled={!isConnected || isLoading}
                >
                  {isLoading ? 'Applying...' : '⚡ Apply Recommended Settings'}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Get Current Settings */}
        <Button
          variant="outline"
          className="w-full"
          onClick={handleGetSettings}
          disabled={!isConnected || isLoading}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
          Get Current Settings from Scanner
        </Button>

        {/* Power */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">RF Power</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground mb-3">
              Higher power = longer read range. Max for H102 is 26 dBm.
            </p>
            <div className="flex gap-2">
              <Select value={power} onValueChange={setPower}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 27 }, (_, i) => i).map(v => (
                    <SelectItem key={v} value={v.toString()}>{v} dBm</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleSetPower} disabled={!isConnected} className="w-20">SET</Button>
            </div>
          </CardContent>
        </Card>

        {/* Q Value */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Q Value</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground mb-3">
              Controls anti-collision slots. Should match your inventory size.
              For {totalTaggedItems} items, use <span className="font-bold text-primary">{recommendedQ}</span>.
            </p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[
                { label: '~16 items', q: 4 },
                { label: '~64 items', q: 6 },
                { label: '~256 items', q: 8 },
                { label: '~512 items', q: 9 },
                { label: '~1024 items', q: 10 },
                { label: '~2048 items', q: 11 },
              ].map(({ label, q }) => (
                <button
                  key={q}
                  onClick={() => setQValue(q.toString())}
                  className={`p-2 rounded-lg text-xs border transition-colors ${
                    qValue === q.toString()
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted border-border hover:bg-muted/80'
                  } ${q.toString() === recommendedQ ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                >
                  <div className="font-bold">Q={q}</div>
                  <div className="text-[10px] opacity-70">{label}</div>
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <Select value={qValue} onValueChange={setQValue}>
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 16 }, (_, i) => i).map(v => (
                    <SelectItem key={v} value={v.toString()}>
                      Q={v} (~{Math.pow(2, v)} tags) {v.toString() === recommendedQ ? '← Recommended' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleSetQValue} disabled={!isConnected} className="w-20">SET</Button>
            </div>
          </CardContent>
        </Card>

        {/* Session */}
        <Card>
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-base">Session Mode</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <p className="text-xs text-muted-foreground mb-3">
              S1 is recommended for inventory counting — each tag responds once per round.
            </p>
            <div className="grid grid-cols-2 gap-2 mb-3">
              {[
                { s: 0, label: 'S0', desc: 'Continuous re-reads, fast but noisy' },
                { s: 1, label: 'S1', desc: 'One read per tag ← Recommended' },
                { s: 2, label: 'S2', desc: 'Fewer duplicates, slower' },
                { s: 3, label: 'S3', desc: 'Minimal duplicates' },
              ].map(({ s, label, desc }) => (
                <button
                  key={s}
                  onClick={() => setSession(s.toString())}
                  className={`p-3 rounded-lg text-left border transition-colors ${
                    session === s.toString()
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted border-border hover:bg-muted/80'
                  }`}
                >
                  <div className="font-bold text-sm">{label}</div>
                  <div className="text-[10px] opacity-70 mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
            <Button onClick={handleSetSession} disabled={!isConnected} className="w-full">
              Set Session to S{session}
            </Button>
          </CardContent>
        </Card>

        {/* Reboot */}
        <Card className="border-destructive/30">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Power className="h-5 w-5 text-destructive" />
              <div className="flex-1">
                <p className="font-semibold text-sm">Reboot Scanner</p>
                <p className="text-xs text-muted-foreground">
                  Required after changing settings. Reconnect after 5 seconds.
                </p>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleReboot}
                disabled={!isConnected}
              >
                Reboot
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
};

export default ScannerSettings;