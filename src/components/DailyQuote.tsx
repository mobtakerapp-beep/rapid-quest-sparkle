import { useMemo } from "react";
import { Sparkles, BookOpen } from "lucide-react";

const QUOTES = [
  { text: "الرياضيات هي لغة يتحدث بها الكون.", author: "غاليليو" },
  { text: "لا تخف من الأخطاء — هي درجات السلّم نحو الإتقان.", author: "حكمة" },
  { text: "كل مسألة صعبة هي فرصة لتصبح أذكى.", author: "حكمة" },
  { text: "العقل الذي ينفتح على فكرة جديدة لا يعود إلى حجمه الأصلي.", author: "أينشتاين" },
  { text: "الرياضيات ليست حفظاً — إنها فهم وتفكير.", author: "حكمة" },
  { text: "كن فضولياً ولا تتوقف عن التساؤل.", author: "أينشتاين" },
  { text: "من طلب العلا سهر الليالي.", author: "مثل عربي" },
  { text: "الممارسة اليومية تصنع العبقري.", author: "حكمة" },
  { text: "الأرقام لا تكذب — كلما تدربت تحسّنت.", author: "حكمة" },
  { text: "الخطأ لا يُعيب — العيب هو الاستسلام.", author: "حكمة" },
  { text: "اطلب العلم من المهد إلى اللحد.", author: "حكمة إسلامية" },
  { text: "الرياضيات هي شعر العقل.", author: "حكمة" },
  { text: "تفاؤلك بالنجاح نصف النجاح.", author: "حكمة عربية" },
  { text: "العلم في الصغر كالنقش على الحجر.", author: "مثل عربي" },
  { text: "من أحب شيئاً أحسنه — أحبّ الرياضيات.", author: "حكمة" },
  { text: "الإصرار هو الفرق بين من ينجح ومن يستسلم.", author: "حكمة" },
  { text: "اسأل حتى تفهم — السؤال شجرة ثمارها المعرفة.", author: "حكمة" },
  { text: "دقيقة تفكير تساوي ساعة عمل.", author: "حكمة" },
  { text: "من جدّ وجد.", author: "مثل عربي" },
  { text: "النجاح ليس مصادفة — هو نتاج الإصرار والعمل.", author: "حكمة" },
  { text: "كل يوم تتعلم فيه شيئاً جديداً هو يوم لم يضع.", author: "حكمة" },
  { text: "المعلم الجيد يُضيء شمعة لا يملأ إناءً.", author: "ييتس" },
  { text: "البساطة هي قمة التطور.", author: "دا فينشي" },
  { text: "ليس الذكاء أن تعرف الجواب — بل أن تعرف كيف تجده.", author: "حكمة" },
  { text: "كل طالب مجتهد يستحق أن يحتفل بنفسه.", author: "حكمة" },
  { text: "التعليم هو أقوى سلاح لتغيير العالم.", author: "مانديلا" },
  { text: "رب زدني علماً.", author: "القرآن الكريم" },
  { text: "حل مسألة رياضية يومياً يجعل عقلك أقوى.", author: "حكمة" },
  { text: "أنت أذكى مما تظن — فقط حاول.", author: "حكمة" },
  { text: "الفهم الكامل يأتي بالممارسة.", author: "حكمة" },
];

const MATH_FACTS = [
  { fact: "مجموع زوايا أي مثلث = ١٨٠°", detail: "مهما كان شكل المثلث!" },
  { fact: "π ≈ ٣٫١٤١٥٩", detail: "نسبة محيط الدائرة إلى قطرها" },
  { fact: "أي عدد مضروب في صفر = صفر", detail: "٩٩٩ × ٠ = ٠" },
  { fact: "مجموع أعداد ١ إلى ١٠٠ = ٥٠٥٠", detail: "اكتشفها غاوس وهو طفل!" },
  { fact: "المربع الذي طوله ١ وعرضه ١ مساحته = ١", detail: "أبسط مساحة في الهندسة" },
  { fact: "٢ هو العدد الأولي الزوجي الوحيد", detail: "كل الأعداد الأولية الأخرى فردية" },
  { fact: "محيط الدائرة = ٢ × π × نق", detail: "نق = النصف قطر" },
  { fact: "الكسر ½ = ٠٫٥ = ٥٠٪", detail: "ثلاثة أشكال لنفس القيمة" },
  { fact: "مساحة المثلث = (القاعدة × الارتفاع) ÷ ٢", detail: "القاعدة والارتفاع عموديان" },
  { fact: "العدد ١ ليس أولياً ولا مركّباً", detail: "فئة خاصة به وحده" },
  { fact: "٩ × أي عدد: مجموع أرقام النتيجة يساوي ٩", detail: "٩ × ٧ = ٦٣، و٦+٣=٩ ✓" },
  { fact: "مساحة المربع = الضلع²", detail: "ضلع ٥ → مساحة = ٢٥" },
  { fact: "الأعداد الأولية تحت ١٠: ٢،٣،٥،٧", detail: "٤ أعداد فقط" },
  { fact: "مجموع أرقام أي مضاعف لـ٩ يساوي ٩", detail: "١٨، ٢٧، ٣٦، ٤٥..." },
  { fact: "الكيلومتر = ١٠٠٠ متر = ١٠٠٠٠٠ سم", detail: "وحدات القياس مترابطة" },
  { fact: "الزاوية المستقيمة = ١٨٠°", detail: "نصف الزاوية الكاملة" },
  { fact: "مساحة المستطيل = الطول × العرض", detail: "أبسط قانون للمساحة" },
  { fact: "١ كيلوغرام = ١٠٠٠ غرام", detail: "الكيلو يعني ألف" },
  { fact: "الزاوية القائمة = ٩٠°", detail: "ركن المربع والمستطيل" },
  { fact: "أي عدد ÷ نفسه = ١", detail: "١٥ ÷ ١٥ = ١" },
  { fact: "الصفر ليس موجباً ولا سالباً", detail: "يقع في منتصف خط الأعداد" },
  { fact: "١ لتر = ١٠٠٠ مليلتر", detail: "مثل الكيلو مع الغرام" },
  { fact: "مضاعفات ٥ تنتهي بـ ٥ أو ٠ دائماً", detail: "٥، ١٠، ١٥، ٢٠، ٢٥..." },
  { fact: "حجم المكعب = الضلع × الضلع × الضلع", detail: "مكعب ضلعه ٣ = ٢٧ وحدة" },
  { fact: "مضاعفات ٢ كلها أعداد زوجية", detail: "٢، ٤، ٦، ٨، ١٠..." },
  { fact: "الكسور المتكافئة لها نفس القيمة", detail: "½ = ٢/٤ = ٤/٨" },
  { fact: "مجموع زوايا المربع = ٣٦٠°", detail: "٤ زوايا × ٩٠° = ٣٦٠°" },
  { fact: "العدد الزوجي يقبل القسمة على ٢", detail: "٢، ٤، ٦، ٨، ١٠..." },
  { fact: "ترتيب العمليات: ضرب ÷ ثم جمع طرح", detail: "الضرب والقسمة أولاً" },
  { fact: "الكسر الأكبر من ١ يُسمى كسراً عاماً", detail: "مثل ٧/٣ أو ٥/٢" },
  { fact: "مساحة الدائرة = π × نق²", detail: "نق = نصف القطر" },
  { fact: "أي عدد + صفر = نفس العدد", detail: "الصفر عنصر محايد للجمع" },
  { fact: "أي عدد × ١ = نفس العدد", detail: "الواحد عنصر محايد للضرب" },
  { fact: "عدد وجوه المكعب = ٦", detail: "وجوه متساوية كلها مربعات" },
  { fact: "المئوية تعني من كل مئة", detail: "٧٥٪ = ٧٥ من كل ١٠٠" },
];

function dayIndex() {
  return Math.floor(
    (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
  );
}

export function DailyQuote() {
  const { quote, mathFact } = useMemo(() => {
    const d = dayIndex();
    return {
      quote:    QUOTES[d % QUOTES.length],
      mathFact: MATH_FACTS[d % MATH_FACTS.length],
    };
  }, []);

  return (
    <section className="container mx-auto px-6 pb-8" dir="rtl">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

        {/* فكرة اليوم */}
        <div className="relative rounded-xl overflow-hidden border border-violet-100 dark:border-violet-900/40 bg-gradient-to-l from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 px-4 py-3.5 shadow-sm">
          <div className="absolute top-0 left-0 h-full w-1 bg-gradient-to-b from-violet-500 to-indigo-500" />
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 mb-1 tracking-wide">فكرة اليوم</p>
              <p className="text-[0.82rem] font-bold text-foreground leading-relaxed">
                "{quote.text}"
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">— {quote.author}</p>
            </div>
          </div>
        </div>

        {/* معلومة رياضيات اليوم */}
        <div className="relative rounded-xl overflow-hidden border border-amber-100 dark:border-amber-900/40 bg-gradient-to-l from-amber-50 to-orange-50 dark:from-amber-950/20 dark:to-orange-950/20 px-4 py-3.5 shadow-sm">
          <div className="absolute top-0 left-0 h-full w-1 bg-gradient-to-b from-amber-400 to-orange-500" />
          <div className="flex items-start gap-2.5">
            <div className="mt-0.5 h-7 w-7 shrink-0 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-sm">
              <BookOpen className="h-3.5 w-3.5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 mb-1 tracking-wide">معلومة رياضيات اليوم</p>
              <p className="text-[0.82rem] font-black text-foreground leading-snug" style={{ fontFamily: "'Tajawal', monospace" }}>
                {mathFact.fact}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">{mathFact.detail}</p>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
