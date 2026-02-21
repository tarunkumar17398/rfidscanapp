import { useScanner } from '@/contexts/ScannerContext';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';
import { Activity, CheckCircle2, Radio, Zap } from 'lucide-react';

export function ScanProgress() {
  const { smartScanStats, scanning, smartMode } = useScanner();
  const { uniqueTagsFound, expectedTotal, discoveryRate, scanComplete, elapsedSeconds, currentPhase, rssiAvg } = smartScanStats;

  const animatedUnique = useAnimatedCounter(uniqueTagsFound, 200);
  const animatedExpected = useAnimatedCounter(expectedTotal, 200);
  const progressPercent = expectedTotal > 0 ? Math.round((uniqueTagsFound / expectedTotal) * 100) : 0;
  const animatedProgress = useAnimatedCounter(progressPercent, 300);

  if (!scanning && uniqueTagsFound === 0) return null;

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const phaseConfig = {
    discovery: { label: 'Discovery', icon: Zap, colorClass: 'bg-primary text-primary-foreground' },
    sweep: { label: 'Sweep', icon: Radio, colorClass: 'bg-accent text-accent-foreground' },
    complete: { label: 'Complete', icon: CheckCircle2, colorClass: 'bg-secondary text-secondary-foreground' },
  };

  const phase = phaseConfig[currentPhase];
  const PhaseIcon = phase.icon;

  return (
    <Card className="border-2 border-primary/20">
      <CardContent className="p-4 space-y-3">
        {/* Header row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-sm">Scan Progress</h3>
            {smartMode && (
              <Badge variant="outline" className={`text-[10px] ${phase.colorClass} border-0`}>
                <PhaseIcon className="h-3 w-3 mr-1" />
                {phase.label}
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            {formatTime(elapsedSeconds)}
          </span>
        </div>

        {/* Progress bar */}
        <div className="space-y-1">
          <Progress value={animatedProgress} className="h-3" />
          <div className="flex justify-between text-xs text-muted-foreground">
            <span className="font-semibold tabular-nums">
              {animatedUnique} / {animatedExpected} tags
            </span>
            <span className="tabular-nums font-bold text-primary">{animatedProgress}%</span>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1">
            <Activity className={`h-3 w-3 ${discoveryRate > 0 ? 'text-secondary animate-pulse' : 'text-muted-foreground'}`} />
            <span className="tabular-nums">
              {discoveryRate} <span className="text-muted-foreground">new/sec</span>
            </span>
          </div>
          {rssiAvg !== 0 && (
            <div className="flex items-center gap-1">
              <Radio className="h-3 w-3 text-muted-foreground" />
              <span className="tabular-nums text-muted-foreground">
                {rssiAvg} dBm
              </span>
            </div>
          )}
          {scanComplete && (
            <Badge variant="secondary" className="text-[10px]">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Scan Likely Complete
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
