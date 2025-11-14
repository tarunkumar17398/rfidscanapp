import { useScanner } from '@/contexts/ScannerContext';
import { Badge } from '@/components/ui/badge';
import { Bluetooth, Battery } from 'lucide-react';

export const ScannerStatus = () => {
  const { scannerStatus, batteryPercentage } = useScanner();
  const isConnected = scannerStatus.toLowerCase().includes('connected') || 
                      scannerStatus.toLowerCase().includes('scanning');
  
  const getBatteryColor = () => {
    if (!batteryPercentage) return 'text-muted-foreground';
    if (batteryPercentage > 50) return 'text-green-500';
    if (batteryPercentage > 20) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="flex items-center gap-2">
      <Badge 
        variant={isConnected ? "default" : "secondary"}
        className="flex items-center gap-1.5 px-2 sm:px-3 py-1 text-xs sm:text-sm"
      >
        <Bluetooth className="h-3 w-3 sm:h-4 sm:w-4" />
        <span>{scannerStatus}</span>
      </Badge>
      
      {isConnected && batteryPercentage !== null && (
        <Badge 
          variant="outline"
          className="flex items-center gap-1.5 px-2 sm:px-3 py-1 text-xs sm:text-sm"
        >
          <Battery className={`h-3 w-3 sm:h-4 sm:w-4 ${getBatteryColor()}`} />
          <span className={getBatteryColor()}>{batteryPercentage}%</span>
        </Badge>
      )}
    </div>
  );
};
