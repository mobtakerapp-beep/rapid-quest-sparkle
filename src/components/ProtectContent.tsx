import { useEffect } from "react";

export function ProtectContent() {
  useEffect(() => {
    // Skip protection inside Lovable preview iframe so editor stays usable
    const inIframe = (() => { try { return window.self !== window.top; } catch { return true; } })();
    if (inIframe) return;

    const onContext = (e: MouseEvent) => { e.preventDefault(); };
    const onKey = (e: KeyboardEvent) => {
      const k = e.key.toLowerCase();
      if (e.key === "F12") { e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && ["i", "j", "c"].includes(k)) { e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && ["u", "s"].includes(k)) { e.preventDefault(); return; }
    };
    const onDrag = (e: DragEvent) => {
      const t = e.target as HTMLElement;
      if (t && t.tagName === "IMG") e.preventDefault();
    };
    document.addEventListener("contextmenu", onContext);
    document.addEventListener("keydown", onKey);
    document.addEventListener("dragstart", onDrag);
    return () => {
      document.removeEventListener("contextmenu", onContext);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("dragstart", onDrag);
    };
  }, []);
  return null;
}
