import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

const ADHKAR = [
  { text: "سُبْحَانَ اللهِ وَبِحَمْدِهِ، سُبْحَانَ اللهِ الْعَظِيمِ", source: "متفق عليه" },
  { text: "لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ لَا شَرِيكَ لَهُ، لَهُ الْمُلْكُ وَلَهُ الْحَمْدُ وَهُوَ عَلَى كُلِّ شَيْءٍ قَدِيرٌ", source: "البخاري" },
  { text: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ كَمَا صَلَّيْتَ عَلَى إِبْرَاهِيمَ وَعَلَى آلِ إِبْرَاهِيمَ", source: "متفق عليه" },
  { text: "أَسْتَغْفِرُ اللهَ الْعَظِيمَ الَّذِي لَا إِلَهَ إِلَّا هُوَ الْحَيُّ الْقَيُّومُ وَأَتُوبُ إِلَيْهِ", source: "الترمذي" },
  { text: "حَسْبِيَ اللهُ لَا إِلَهَ إِلَّا هُوَ عَلَيْهِ تَوَكَّلْتُ وَهُوَ رَبُّ الْعَرْشِ الْعَظِيمِ", source: "أبو داود" },
  { text: "لَا حَوْلَ وَلَا قُوَّةَ إِلَّا بِاللهِ الْعَلِيِّ الْعَظِيمِ", source: "متفق عليه" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْعَفْوَ وَالْعَافِيَةَ فِي الدُّنْيَا وَالْآخِرَةِ", source: "ابن ماجه" },
  { text: "سُبْحَانَ اللهِ وَالْحَمْدُ لِلهِ وَلَا إِلَهَ إِلَّا اللهُ وَاللهُ أَكْبَرُ", source: "مسلم" },
  { text: "رَضِيتُ بِاللهِ رَبًّا وَبِالْإِسْلَامِ دِينًا وَبِمُحَمَّدٍ ﷺ نَبِيًّا", source: "أبو داود" },
  { text: "اللَّهُمَّ أَعِنِّي عَلَى ذِكْرِكَ وَشُكْرِكَ وَحُسْنِ عِبَادَتِكَ", source: "أبو داود" },
  { text: "اللَّهُمَّ اجْعَلِ الْقُرْآنَ رَبِيعَ قَلْبِي وَنُورَ صَدْرِي وَجَلَاءَ حُزْنِي وَذَهَابَ هَمِّي", source: "أحمد" },
  { text: "بِسْمِ اللهِ الرَّحْمَنِ الرَّحِيمِ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْهَمِّ وَالْحَزَنِ، وَأَعُوذُ بِكَ مِنَ الْعَجْزِ وَالْكَسَلِ", source: "البخاري" },
  { text: "يَا حَيُّ يَا قَيُّومُ بِرَحْمَتِكَ أَسْتَغِيثُ، أَصْلِحْ لِي شَأْنِي كُلَّهُ وَلَا تَكِلْنِي إِلَى نَفْسِي طَرْفَةَ عَيْنٍ", source: "الحاكم" },
  { text: "اللَّهُمَّ بِكَ أَصْبَحْنَا وَبِكَ أَمْسَيْنَا وَبِكَ نَحْيَا وَبِكَ نَمُوتُ وَإِلَيْكَ الْمَصِيرُ", source: "الترمذي" },
  { text: "سُبْحَانَكَ اللَّهُمَّ وَبِحَمْدِكَ، أَشْهَدُ أَنْ لَا إِلَهَ إِلَّا أَنْتَ، أَسْتَغْفِرُكَ وَأَتُوبُ إِلَيْكَ", source: "الترمذي" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ عِلْمًا نَافِعًا وَرِزْقًا طَيِّبًا وَعَمَلًا مُتَقَبَّلًا", source: "ابن ماجه" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْجَنَّةَ وَأَعُوذُ بِكَ مِنَ النَّارِ", source: "أبو داود" },
  { text: "أَعُوذُ بِكَلِمَاتِ اللهِ التَّامَّاتِ مِنْ شَرِّ مَا خَلَقَ", source: "مسلم" },
  { text: "بِسْمِ اللهِ الَّذِي لَا يَضُرُّ مَعَ اسْمِهِ شَيْءٌ فِي الْأَرْضِ وَلَا فِي السَّمَاءِ وَهُوَ السَّمِيعُ الْعَلِيمُ", source: "أبو داود" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الْهُدَى وَالتُّقَى وَالْعَفَافَ وَالْغِنَى", source: "مسلم" },
  { text: "اللَّهُمَّ أَصْلِحْ لِي دِينِي الَّذِي هُوَ عِصْمَةُ أَمْرِي، وَأَصْلِحْ لِي دُنْيَايَ الَّتِي فِيهَا مَعَاشِي", source: "مسلم" },
  { text: "اللَّهُمَّ آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ", source: "البخاري ومسلم" },
  { text: "لَا إِلَهَ إِلَّا أَنْتَ سُبْحَانَكَ إِنِّي كُنْتُ مِنَ الظَّالِمِينَ", source: "الترمذي" },
  { text: "اللَّهُمَّ اغْفِرْ لِي وَارْحَمْنِي وَاهْدِنِي وَعَافِنِي وَارْزُقْنِي", source: "مسلم" },
  { text: "سُبْحَانَ اللهِ وَبِحَمْدِهِ عَدَدَ خَلْقِهِ وَرِضَا نَفْسِهِ وَزِنَةَ عَرْشِهِ وَمِدَادَ كَلِمَاتِهِ", source: "مسلم" },
  { text: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنَ الْكُفْرِ وَالْفَقْرِ وَعَذَابِ الْقَبْرِ", source: "النسائي" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنَ الْخَيْرِ كُلِّهِ، عَاجِلِهِ وَآجِلِهِ، مَا عَلِمْتُ مِنْهُ وَمَا لَمْ أَعْلَمْ", source: "ابن ماجه" },
  { text: "أَعُوذُ بِاللهِ مِنَ الشَّيْطَانِ الرَّجِيمِ", source: "القرآن الكريم" },
  { text: "الْحَمْدُ لِلهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ", source: "البخاري" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ حُبَّكَ وَحُبَّ مَنْ يُحِبُّكَ وَحُبَّ عَمَلٍ يُقَرِّبُنِي إِلَى حُبِّكَ", source: "الترمذي" },
  { text: "رَبِّ اشْرَحْ لِي صَدْرِي وَيَسِّرْ لِي أَمْرِي", source: "القرآن الكريم" },
  { text: "رَبَّنَا تَقَبَّلْ مِنَّا إِنَّكَ أَنْتَ السَّمِيعُ الْعَلِيمُ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ لَكَ الْحَمْدُ أَنْتَ نُورُ السَّمَاوَاتِ وَالْأَرْضِ وَمَنْ فِيهِنَّ", source: "البخاري" },
  { text: "اللَّهُمَّ إِنِّي ظَلَمْتُ نَفْسِي ظُلْمًا كَثِيرًا وَلَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ فَاغْفِرْ لِي مَغْفِرَةً مِنْ عِنْدِكَ", source: "البخاري ومسلم" },
  { text: "رَبِّ زِدْنِي عِلْمًا", source: "القرآن الكريم" },
  { text: "رَبَّنَا آتِنَا مِنْ لَدُنْكَ رَحْمَةً وَهَيِّئْ لَنَا مِنْ أَمْرِنَا رَشَدًا", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ اكْفِنِي بِحَلَالِكَ عَنْ حَرَامِكَ وَأَغْنِنِي بِفَضْلِكَ عَمَّنْ سِوَاكَ", source: "الترمذي" },
  { text: "سُبْحَانَ اللهِ مِلْءَ الْمِيزَانِ وَمُنْتَهَى الْعِلْمِ وَمَبْلَغَ الرِّضَا وَزِنَةَ الْعَرْشِ", source: "مسلم" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ الثَّبَاتَ فِي الْأَمْرِ وَالْعَزِيمَةَ عَلَى الرُّشْدِ", source: "النسائي" },
  { text: "حَسْبُنَا اللهُ وَنِعْمَ الْوَكِيلُ", source: "البخاري" },
  { text: "لَا إِلَهَ إِلَّا اللهُ وَحْدَهُ أَنْجَزَ وَعْدَهُ وَنَصَرَ عَبْدَهُ وَهَزَمَ الْأَحْزَابَ وَحْدَهُ", source: "البخاري ومسلم" },
  { text: "اللَّهُمَّ صَلِّ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ وَبَارِكْ عَلَى مُحَمَّدٍ وَعَلَى آلِ مُحَمَّدٍ", source: "البخاري" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ يَا اللهُ بِأَنَّكَ الْوَاحِدُ الْأَحَدُ الصَّمَدُ الَّذِي لَمْ يَلِدْ وَلَمْ يُولَدْ", source: "أبو داود" },
  { text: "رَبِّ اغْفِرْ لِي وَتُبْ عَلَيَّ إِنَّكَ أَنْتَ التَّوَّابُ الرَّحِيمُ", source: "الترمذي" },
  { text: "اللَّهُمَّ احْفَظْنِي مِنْ بَيْنِ يَدَيَّ وَمِنْ خَلْفِي وَعَنْ يَمِينِي وَعَنْ شِمَالِي وَمِنْ فَوْقِي", source: "أبو داود" },
  { text: "اللَّهُمَّ عَافِنِي فِي بَدَنِي، اللَّهُمَّ عَافِنِي فِي سَمْعِي، اللَّهُمَّ عَافِنِي فِي بَصَرِي", source: "أبو داود" },
  { text: "الْحَمْدُ لِلهِ رَبِّ الْعَالَمِينَ", source: "القرآن الكريم" },
  { text: "اللهُ أَكْبَرُ كَبِيرًا وَالْحَمْدُ لِلهِ كَثِيرًا وَسُبْحَانَ اللهِ بُكْرَةً وَأَصِيلًا", source: "مسلم" },
  { text: "رَبَّنَا لَا تُزِغْ قُلُوبَنَا بَعْدَ إِذْ هَدَيْتَنَا وَهَبْ لَنَا مِنْ لَدُنْكَ رَحْمَةً", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ مُصَرِّفَ الْقُلُوبِ، صَرِّفْ قَلْبِي عَلَى طَاعَتِكَ", source: "مسلم" },
  { text: "اللَّهُمَّ إِنِّي أَعُوذُ بِكَ مِنْ عِلْمٍ لَا يَنْفَعُ وَمِنْ قَلْبٍ لَا يَخْشَعُ وَمِنْ نَفْسٍ لَا تَشْبَعُ وَمِنْ دَعْوَةٍ لَا يُسْتَجَابُ لَهَا", source: "مسلم" },
  { text: "سُبْحَانَ اللهِ وَبِحَمْدِهِ", source: "البخاري ومسلم" },
  { text: "اللهُ أَكْبَرُ", source: "البخاري ومسلم" },
  { text: "الْحَمْدُ لِلهِ", source: "مسلم" },
  { text: "لَا إِلَهَ إِلَّا اللهُ", source: "البخاري ومسلم" },
  { text: "أَسْتَغْفِرُ اللهَ وَأَتُوبُ إِلَيْهِ", source: "البخاري" },
  { text: "رَبِّ أَعِنِّي وَلَا تُعِنْ عَلَيَّ، وَانْصُرْنِي وَلَا تَنْصُرْ عَلَيَّ", source: "أبو داود" },
  { text: "اللَّهُمَّ إِنِّي أَسْأَلُكَ حُسْنَ الْخَاتِمَةِ", source: "الطبراني" },
  { text: "رَبِّ إِنِّي لِمَا أَنْزَلْتَ إِلَيَّ مِنْ خَيْرٍ فَقِيرٌ", source: "القرآن الكريم" },
  { text: "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ", source: "البخاري" },
  { text: "اللَّهُمَّ اغْفِرْ لِي ذَنْبِي كُلَّهُ دِقَّهُ وَجِلَّهُ وَأَوَّلَهُ وَآخِرَهُ وَعَلَانِيَتَهُ وَسِرَّهُ", source: "مسلم" },
];

const INTERVAL_MS = 10 * 60 * 1000;
const COUNTER_KEY = "dhikr_counter_v1";
const ORDER_KEY = "dhikr_order_v1";
const TARGET = 1000;

function toArabicNums(n: number): string {
  return n.toString().replace(/\d/g, (d) => "٠١٢٣٤٥٦٧٨٩"[parseInt(d)]);
}

function getShuffledOrder(): number[] {
  try {
    const raw = sessionStorage.getItem(ORDER_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  const arr = ADHKAR.map((_, i) => i).sort(() => Math.random() - 0.5);
  try { sessionStorage.setItem(ORDER_KEY, JSON.stringify(arr)); } catch {}
  return arr;
}

export function DhikrReminder() {
  const [visible, setVisible] = useState(false);
  const [dhikr, setDhikr] = useState(ADHKAR[0]);
  const [progress, setProgress] = useState(100);
  const [count, setCount] = useState(() => {
    try { return Math.min(TARGET, parseInt(localStorage.getItem(COUNTER_KEY) || "0", 10) || 0); } catch { return 0; }
  });
  const shownCountRef = useRef(0);

  const show = () => {
    const order = getShuffledOrder();
    const idx = order[shownCountRef.current % order.length];
    shownCountRef.current += 1;
    setDhikr(ADHKAR[idx]);
    setVisible(true);
    setProgress(100);
  };

  useEffect(() => {
    const firstTimer = setTimeout(show, 5000);
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

  const increment = () => {
    setCount((c) => {
      const next = c >= TARGET - 1 ? 0 : c + 1;
      try { localStorage.setItem(COUNTER_KEY, String(next)); } catch {}
      if (next === 0) toast.success("أتممت ١٠٠٠ ذكر 🌿 بارك الله فيك وتقبّل منك");
      return next;
    });
  };

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
