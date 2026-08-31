import { useEffect, useRef, useState } from 'react';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Animated integer counter: eases from the previous value to `to`. */
export default function CountUp({ to, duration = 850 }) {
  const [val, setVal] = useState(() => (prefersReducedMotion() ? to : 0));
  const fromRef = useRef(prefersReducedMotion() ? to : 0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setVal(to);
      fromRef.current = to;
      return;
    }
    const from = fromRef.current;
    if (from === to) return undefined;
    let raf;
    const t0 = performance.now();
    const tick = (t) => {
      const p = Math.min(1, (t - t0) / duration);
      const eased = 1 - Math.pow(1 - p, 3); // ease-out cubic
      setVal(Math.round(from + (to - from) * eased));
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration]);

  return <span>{val}</span>;
}
