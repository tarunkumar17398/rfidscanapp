import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { X, Terminal } from 'lucide-react';

interface LogEntry {
  time: string;
  message: string;
  type: 'log' | 'info' | 'warn' | 'error';
}

export const DebugConsole = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Intercept console methods
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;

    const addLog = (message: string, type: LogEntry['type']) => {
      const time = new Date().toLocaleTimeString();
      setLogs(prev => [...prev.slice(-100), { time, message, type }]);
    };

    console.log = (...args) => {
      originalLog(...args);
      addLog(args.join(' '), 'log');
    };

    console.info = (...args) => {
      originalInfo(...args);
      addLog(args.join(' '), 'info');
    };

    console.warn = (...args) => {
      originalWarn(...args);
      addLog(args.join(' '), 'warn');
    };

    console.error = (...args) => {
      originalError(...args);
      addLog(args.join(' '), 'error');
    };

    return () => {
      console.log = originalLog;
      console.info = originalInfo;
      console.warn = originalWarn;
      console.error = originalError;
    };
  }, []);

  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [logs]);

  if (!isOpen) {
    return (
      <Button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 z-50 h-12 w-12 rounded-full"
        size="icon"
      >
        <Terminal className="h-5 w-5" />
      </Button>
    );
  }

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-[90vw] max-w-2xl h-96 flex flex-col shadow-lg">
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4" />
          <span className="font-semibold text-sm">Debug Console</span>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setLogs([])}
            variant="outline"
            size="sm"
          >
            Clear
          </Button>
          <Button
            onClick={() => setIsOpen(false)}
            variant="ghost"
            size="icon"
            className="h-8 w-8"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-3 bg-muted/30 font-mono text-xs">
        {logs.length === 0 ? (
          <div className="text-muted-foreground text-center py-8">
            No logs yet. Connect your scanner to see debug output.
          </div>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              className={`mb-1 ${
                log.type === 'error' ? 'text-red-600' :
                log.type === 'warn' ? 'text-yellow-600' :
                log.type === 'info' ? 'text-blue-600' :
                'text-foreground'
              }`}
            >
              <span className="text-muted-foreground">[{log.time}]</span> {log.message}
            </div>
          ))
        )}
        <div ref={logsEndRef} />
      </div>
    </Card>
  );
};
