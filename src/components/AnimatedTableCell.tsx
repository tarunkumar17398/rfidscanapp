import { useAnimatedCounter } from '@/hooks/useAnimatedCounter';
import { TableCell } from '@/components/ui/table';

interface AnimatedTableCellProps {
  value: number;
  className?: string;
}

export function AnimatedTableCell({ value, className }: AnimatedTableCellProps) {
  const animatedValue = useAnimatedCounter(value);
  
  return (
    <TableCell className={`text-right tabular-nums ${className || ''}`}>
      {animatedValue}
    </TableCell>
  );
}
