import { useEffect, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";

export function PageProgressBar() {
  const status = useRouterState({ select: (s) => s.status });
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (status === "pending") {
      setVisible(true);
      setWidth(0);
      let w = 0;
      const grow = () => {
        w = w < 70 ? w + 1.5 : w < 90 ? w + 0.4 : w;
        setWidth(Math.min(w, 92));
        if (w < 92) timerRef.current = setTimeout(() => { rafRef.current = requestAnimationFrame(grow); }, 60);
      };
      timerRef.current = setTimeout(() => { rafRef.current = requestAnimationFrame(grow); }, 30);
    } else if (status === "idle") {
      setWidth(100);
      timerRef.current = setTimeout(() => { setVisible(false); setWidth(0); }, 400);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [status]);

  if (!visible) return null;
  return (
    <div className="fixed top-0 left-0 right-0 z-[999] h-[3px] pointer-events-none">
      <div
        className="h-full bg-gradient-to-r from-[var(--brand)] via-amber-400 to-[var(--brand-2)] transition-all duration-300 ease-out shadow-[0_0_8px_var(--brand)]"
        style={{ width: `${width}%` }}
      />
    </div>
  );
}
