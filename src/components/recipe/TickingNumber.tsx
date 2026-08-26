import { useEffect, useRef, useState } from 'react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { formatQuantity } from '@/utils/format';

const DURATION = 260;

/**
 * The only number in the app that moves. Scaling servings ticks the quantity
 * from its old value to its new one; because the figures are tabular the column
 * does not shift a pixel while it happens.
 *
 * Under prefers-reduced-motion this is an instant swap.
 */
export function TickingNumber({ value }: { value: number | null }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(value);
  const fromRef = useRef(value);
  const frameRef = useRef<number>(0);

  useEffect(() => {
    if (value == null || fromRef.current == null || reduced) {
      fromRef.current = value;
      setShown(value);
      return;
    }

    const from = fromRef.current;
    const to = value;
    if (from === to) return;

    const started = performance.now();
    const step = (now: number) => {
      const t = Math.min((now - started) / DURATION, 1);
      // easeOutCubic — fast to settle, no bounce.
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(from + (to - from) * eased);
      if (t < 1) frameRef.current = requestAnimationFrame(step);
      else fromRef.current = to;
    };

    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [value, reduced]);

  if (shown == null) return null;
  return <span className="tabular-nums">{formatQuantity(shown)}</span>;
}
