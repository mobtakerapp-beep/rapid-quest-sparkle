import { useEffect, useState } from "react";
import { toast } from "sonner";

const ADHKAR = [
  { text: "سُبْحَانَ اللهِ وَبِحَمْدِهِ، سُبْحَانَ اللهِ الْعَظِيمِ", source: "متفق عليه" },
  { text: "لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ", source: "البخاري" },
  { text: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ", source: "متفق عليه" },
  { text: "أَسْتَغْفِرُ اللهَ الْعَظِيمَ الَّذِي لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ وَأَتُوبُ إِلَيْهِ", source: "الترمذي" },
  { text: "حَسْبِيَ اللهُ لَا إِلَهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ", source: "أبو داود" },
  { text: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللهِ الْعَلِيِّ الْعَظِيمِ", source: "متفق عليه" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ", source: "ابن ماجه" },
  { text: "سُبْحَانَ اللهِ وَالْحَمْدُ لِلهِ وَلَا إِلَهَ إِلَّا اللهُ وَاللهُ أَكْبَرُ", source: "مسلم" },
  { text: "رَضِيتُ بِاللهِ رَبًّا وَبِالْإِسْلَامِ دِينًا وَبِمُحَمَّدٍ ﷺ نَبِيًّا", source: "أبو داود" },
  { text: "اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ", source: "أبو داود" },
  { text: "اللَّهُمَّ اجْعَلِ الْقُرْآنَ رَبِيعَ قَلْبِي وَنُورَ صَدْرِي", source: "أحمد" },
  { text: "بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَأَعُوذُ بِكَ مِنَ الْعَجْزِ وَالْكَسَلِ", source: "البخاري" },
  { text: "يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ", source: "الحاكم" },
  { text: "اللَّهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا وَبِكَ نَحْيَا وَبِكَ نَمُوتُ وَإِلَيْكَ الْمَصِيرُ", source: "الترمذي" },
];

const INTERVAL_MS = 10 * 60 * 1000;
const DISMISS_KEY = "dhikr_last_shown";
const COUNTER_KEY = "dhikr_counter_v1";
const TARGET = 1000;

function toArabicNums(n: number): string {
  return n.toString().replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}

export function DhikrReminder() {
  const [visible, setVisible] = useState(false);
  const [dhikr, setDhikr] = useState(ADHKAR[0]);
  const [progress, setProgress] = useState(100);
  const [count, setCount] = useState(() => {
    try { return Math.min(TARGET, parseInt(localStorage.getItem(COUNTER_KEY) || "0", 10) || 0); } catch { return 0; }
  });

  const increment = () => {
    setCount((c) => {
      const next = c >= TARGET - 1 ? 0 : c + 1;
      try { localStorage.setItem(COUNTER_KEY, String(next)); } catch {}
      if (next === 0) toast.success("أتممت ١٠٠٠ ذكر 🌿 بارك الله فيك وتقبّل منك");
      return next;
    });
  };

  const show = () => {
    const idx = Math.floor(Math.random() * ADHKAR.length);
    setDhikr(ADHKAR[idx]);
    setVisible(true);
    setProgress(100);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  };

  useEffect(() => {
    const last = parseInt(localStorage.getItem(DISMISS_KEY) || "0", 10);
    const elapsed = Date.now() - last;
    const delay = elapsed >= INTERVAL_MS ? 5000 : INTERVAL_MS - elapsed;

    const firstTimer = setTimeout(show, delay);
    const interval = setInterval(show, INTERVAL_MS);

    return () => {
      clearTimeout(firstTimer);
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    const autoDismiss = setTimeout(() => setVisible(false), 30000);
    const tick = setInterval(() => {
      setProgress((p) => Math.max(0, p - (100 / 120)));
    }, 250);
    return () => {
      clearTimeout(autoDismiss);
      clearInterval(tick);
    };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      dir="rtl"
      className="fixed bottom-24 left-4 z-[200] max-w-[300px] animate-in slide-in-from-bottom-4 fade-in duration-500"
    >
      <div className="bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
        <div className="h-1 bg-secondary w-full">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 transition-all duration-250"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5">
              <span className="text-lg">🌿</span>
              <span className="text-xs font-black text-emerald-600">ذكر</span>
            </div>
            <button
              onClick={() => setVisible(false)}
              className="text-muted-foreground hover:text-foreground p-0.5 rounded-lg hover:bg-secondary transition"
            >
              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <p className="text-sm font-bold leading-relaxed text-foreground">{dhikr.text}</p>
          <p className="text-[10px] text-muted-foreground mt-1">— {dhikr.source}</p>

          {/* عداد الذكر */}
          <button
            onClick={increment}
            className="mt-3 w-full rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-200 dark:border-emerald-800 py-2.5 active:scale-95 transition-transform select-none"
            title="اضغط لحساب الذكر"
          >
            <div className="text-2xl font-black text-emerald-700 dark:text-emerald-400 leading-none">
              {toArabicNums(count)}
            </div>
            <div className="text-[10px] text-emerald-600/70 mt-0.5">من {toArabicNums(TARGET)} — اضغط للعد</div>
            <div className="mt-1.5 h-1.5 rounded-full bg-emerald-100 dark:bg-emerald-900 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-teal-500 transition-all duration-300"
                style={{ width: `${(count / TARGET) * 100}%` }}
              />
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
