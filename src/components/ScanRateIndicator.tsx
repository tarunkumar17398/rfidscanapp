import { useEffect, useState } from 'react';
import { Activity } from 'lucide-react';
import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';

interface ScanRateIndicatorProps {
  scanRate: number;
}

export function ScanRateIndicator({ scanRate }: ScanRateIndicatorProps) {
  const animatedRate = useAnimatedCounter(scanRate, 200);
  const [rateLevel, setRateLevel] = useState<'low' | 'medium' | 'high'>('low');

  useEffect(() => {
    if (scanRate >= 10) setRateLevel('high');
    else if (scanRate >= 5) setRateLevel('medium');
    else setRateLevel('low');
  }, [scanRate]);

  const colorClass = {
    low: 'text-muted-foreground',
    medium: 'text-yellow-500',
    high: 'text-green-500'
  }[rateLevel];

  const bgClass = {
    low: 'bg-muted',
    medium: 'bg-yellow-500/10',
    high: 'bg-green-500/10'
  }[rateLevel];

  return (
    <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${bgClass} transition-all duration-300`}>
      <Activity className={`h-4 w-4 ${colorClass} ${scanRate > 0 ? 'animate-pulse' : ''}`} />
      <div className="flex items-baseline gap-1">
        <span className={`text-lg font-bold tabular-nums ${colorClass}`}>
          {animatedRate}
        </span>
        <span className="text-xs text-muted-foreground">tags/sec</span>
      </div>
    </div>
  );
}
