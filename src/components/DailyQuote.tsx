import { useMemo } from "react";
import { Sparkles } from "lucide-react";

const QUOTES = [
  { text: "الرياضيات هي لغة يتحدث بها الله.", author: "غاليليو غاليلي" },
  { text: "لا تخف من الأخطاء — هي درجات السلّم نحو الإتقان.", author: "حكمة تربوية" },
  { text: "كل مسألة صعبة هي فرصة لتصبح أذكى.", author: "حكمة تربوية" },
  { text: "العقل الذي ينفتح على فكرة جديدة لا يعود إلى حجمه الأصلي أبداً.", author: "ألبرت أينشتاين" },
  { text: "النجاح ليس مصادفة — هو نتاج الإصرار والتعلم والعمل الدؤوب.", author: "حكمة تربوية" },
  { text: "التعليم هو أقوى سلاح يمكنك استخدامه لتغيير العالم.", author: "نيلسون مانديلا" },
  { text: "الرياضيات ليست حفظاً — إنها فهم وتفكير.", author: "حكمة تربوية" },
  { text: "كن فضولياً ولا تتوقف عن التساؤل.", author: "ألبرت أينشتاين" },
  { text: "اقرأ باسم ربك الذي خلق — العلم نور والجهل ظلام.", author: "من وحي القرآن الكريم" },
  { text: "من طلب العلا سهر الليالي.", author: "مثل عربي" },
  { text: "الممارسة اليومية تصنع العبقري — حل مسألة كل يوم.", author: "حكمة تربوية" },
  { text: "الأرقام لا تكذب — كلما تدربت كلما تحسّنت.", author: "حكمة تربوية" },
  { text: "الخطأ لا يُعيب — العيب هو الاستسلام.", author: "حكمة تربوية" },
  { text: "اطلب العلم من المهد إلى اللحد.", author: "حكمة إسلامية" },
  { text: "كل يوم تتعلم فيه شيئاً جديداً هو يوم لم يضع.", author: "حكمة تربوية" },
  { text: "الرياضيات هي شعر العقل.", author: "حكمة تربوية" },
  { text: "ليس المهم أن تكون الأسرع — المهم أن تكون الأفضل فهماً.", author: "حكمة تربوية" },
  { text: "تفاؤلك بالنجاح نصف النجاح.", author: "حكمة عربية" },
  { text: "العلم في الصغر كالنقش على الحجر.", author: "مثل عربي" },
  { text: "من أحب شيئاً أحسنه — أحبّ الرياضيات وستُحبّك.", author: "حكمة تربوية" },
  { text: "تذكّر: كل عالم كان يوماً طالباً لا يعرف الجواب.", author: "حكمة تربوية" },
  { text: "الإصرار هو الفرق بين من ينجح ومن يستسلم.", author: "حكمة تربوية" },
  { text: "اسأل حتى تفهم — السؤال شجرة ثمارها المعرفة.", author: "حكمة تربوية" },
  { text: "كن المعلم الذي تمنّيت أن يكون لديك.", author: "حكمة تربوية" },
  { text: "كل طالب موهوب — المهم إيجاد المفتاح الصحيح.", author: "حكمة تربوية" },
  { text: "المعلم الجيد يُضيء شمعة لا يملأ إناءً.", author: "وليام باتلر ييتس" },
  { text: "البساطة هي قمة التطور — أبسط الحلول أجمل الحلول.", author: "ليوناردو دا فينشي" },
  { text: "دقيقة تفكير تساوي ساعة عمل.", author: "حكمة تربوية" },
  { text: "ليس الذكاء أن تعرف الجواب — بل أن تعرف كيف تجده.", author: "حكمة تربوية" },
  { text: "اليوم الذي تتعلم فيه شيئاً لم تكن تعرفه أمس هو يوم ناجح.", author: "حكمة تربوية" },
];

export function DailyQuote() {
  const quote = useMemo(() => {
    const dayOfYear = Math.floor(
      (Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000
    );
    return QUOTES[dayOfYear % QUOTES.length];
  }, []);

  return (
    <section className="container mx-auto px-6 pb-8" dir="rtl">
      <div className="relative rounded-2xl overflow-hidden border border-border bg-gradient-to-l from-violet-50 to-indigo-50 dark:from-violet-950/20 dark:to-indigo-950/20 px-6 py-5 shadow-sm">
        <div className="absolute top-0 left-0 h-full w-1 bg-gradient-to-b from-violet-500 to-indigo-600" />
        <div className="flex items-start gap-3">
          <div className="mt-0.5 h-8 w-8 shrink-0 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-sm">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-violet-500 dark:text-violet-400 mb-1 tracking-wide uppercase">فكرة اليوم</p>
            <p className="text-base font-bold text-foreground leading-relaxed">
              "{quote.text}"
            </p>
            <p className="mt-1.5 text-xs text-muted-foreground">— {quote.author}</p>
          </div>
        </div>
      </div>
    </section>
  );
}
