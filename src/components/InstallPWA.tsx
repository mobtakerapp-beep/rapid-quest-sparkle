import { useEffect, useState } from "react";
import { Download } from "lucide-react";

export function InstallPWA() {
  const [prompt, setPrompt] = useState<any>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const onPrompt = (e: any) => { e.preventDefault(); setPrompt(e); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;

  const handle = async () => {
    if (prompt) { await prompt.prompt(); setPrompt(null); return; }
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const isAndroid = /Android/i.test(navigator.userAgent);
    if (isIOS) {
      alert("لتثبيت التطبيق على آيفون/آيباد:\n1) اضغط على زر المشاركة ⬆️\n2) اختر 'إضافة إلى الشاشة الرئيسية'");
    } else if (isAndroid) {
      alert("لتثبيت التطبيق على Android:\n1) افتح الموقع من Chrome\n2) اضغط القائمة (⋮)\n3) اختر 'تثبيت التطبيق' أو 'إضافة إلى الشاشة الرئيسية'\nإذا ظهر زر التثبيت مباشرة اضغطي عليه.");
    } else {
      alert("لتثبيت التطبيق:\n• على Chrome/Edge: افتح القائمة (⋮) ثم اختر 'تثبيت التطبيق'\n• إذا لم يظهر الخيار فالمتصفح لا يدعم التثبيت");
    }
  };

  return (
    <button onClick={handle}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold text-sm shadow-[var(--shadow-soft)] hover:scale-105 transition">
      <Download className="h-4 w-4" /> تثبيت التطبيق Android / iPhone
    </button>
  );
}
