import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

export function ScrollToTop() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const el = document.querySelector(".app-content-with-nav");
    if (!el) return;
    const onScroll = () => setShow(el.scrollTop > 350);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  if (!show) return null;
  return (
    <button
      onClick={() => document.querySelector(".app-content-with-nav")?.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-6 left-6 z-[180] h-11 w-11 rounded-full bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-soft)] flex items-center justify-center hover:scale-110 transition-all duration-300 animate-fade-in"
      aria-label="العودة للأعلى"
    >
      <ArrowUp className="h-5 w-5" />
    </button>
  );
}
