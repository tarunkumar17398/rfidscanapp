import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { RFIDScanner } from '@/lib/rfidScanner';
import { api } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface ScannerContextType {
  scanner: RFIDScanner;
  scanning: boolean;
  scannerStatus: string;
  lastScannedTag: string | null;
  connectScanner: () => Promise<boolean>;
  startScan: () => Promise<void>;
  stopScan: () => Promise<void>;
  toggleScan: () => Promise<void>;
}

const ScannerContext = createContext<ScannerContextType | undefined>(undefined);

export const ScannerProvider = ({ children }: { children: ReactNode }) => {
  const [scanner] = useState(() => new RFIDScanner());
  const [scanning, setScanning] = useState(false);
  const [scannerStatus, setScannerStatus] = useState('Not connected');
  const [lastScannedTag, setLastScannedTag] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    scanner.setOnStatusChange(setScannerStatus);
    scanner.setOnTagScanned(async (tagId) => {
      setLastScannedTag(tagId);
      console.log('Tag scanned:', tagId);
      
      try {
        const response = await api.scan(tagId);
        console.log('Scan API response:', response);
        
        if (response.success) {
          toast({ 
            title: '✓ Scanned', 
            description: `Tag: ${tagId.substring(0, 8)}...`,
            duration: 2000
          });
        } else if (response.duplicate) {
          toast({ 
            title: 'Already Scanned', 
            description: `Tag: ${tagId.substring(0, 8)}...`,
            variant: 'default',
            duration: 2000
          });
        }
      } catch (error) {
        console.error('Scan API error:', error);
        toast({ 
          title: 'Scan Error', 
          description: 'Failed to record scan',
          variant: 'destructive',
          duration: 3000
        });
      }
    });

    // Cleanup on app unmount only
    return () => {
      scanner.disconnect();
    };
  }, [scanner, toast]);

  const connectScanner = async () => {
    const connected = await scanner.connect();
    if (connected) {
      toast({ title: 'Scanner Connected', description: 'Ready to scan' });
    }
    return connected;
  };

  const startScan = async () => {
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

  return (
    <ScannerContext.Provider
      value={{
        scanner,
        scanning,
        scannerStatus,
        lastScannedTag,
        connectScanner,
        startScan,
        stopScan,
        toggleScan,
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
