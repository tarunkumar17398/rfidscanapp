import { useEffect, useState } from 'react';
import { CheckCircle } from 'lucide-react';

interface ScanPulseFeedbackProps {
  trigger: number; // Increment this to trigger animation
}

export function ScanPulseFeedback({ trigger }: ScanPulseFeedbackProps) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (trigger > 0) {
      setShow(true);
      const timer = setTimeout(() => setShow(false), 600);
      return () => clearTimeout(timer);
    }
  }, [trigger]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">
      <div className="animate-scale-in">
        <CheckCircle className="h-20 w-20 text-green-500 drop-shadow-lg animate-pulse" />
      </div>
    </div>
  );
}
