import { useEffect, useRef, useState } from "react";

const COUNT_DURATION_MS = 320;

/**
 * Counts towards `target` over 320ms (ease-out). `null` clears the value so
 * the KPI can render an em dash.
 *
 * The animation starts only when the target actually changes: polling the
 * same number, re-rendering, or refreshing the page state leaves the DOM
 * untouched. Pass `animateOnMount = false` for values that should appear
 * immediately on first load (e.g. "2 小时 13 分" must not sweep up from 0).
 */
export function useCountUp(
  target: number | null,
  animateOnMount = true,
): number | null {
  const [value, setValue] = useState<number | null>(target);
  const valueRef = useRef<number | null>(target);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    if (target === null) {
      setValue(null);
      valueRef.current = null;
      return;
    }

    const from = valueRef.current;
    if (from === target) return;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    if (reduceMotion || (from === null && !animateOnMount)) {
      setValue(target);
      valueRef.current = target;
      return;
    }

    const startValue = from ?? 0;
    const startedAt = performance.now();
    let frame = 0;

    const tick = (time: number) => {
      const progress = Math.min(1, (time - startedAt) / COUNT_DURATION_MS);
      const eased = 1 - Math.pow(1 - progress, 3);

      if (progress >= 1) {
        setValue(target);
        valueRef.current = target;
        return;
      }

      const next = startValue + (target - startValue) * eased;
      setValue(next);
      valueRef.current = next;
      frame = window.requestAnimationFrame(tick);
    };

    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [target, animateOnMount]);

  return value;
}
