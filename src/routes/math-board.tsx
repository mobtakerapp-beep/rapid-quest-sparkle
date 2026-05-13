import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { ArrowLeft, Calculator, Divide, Radical, RotateCcw } from "lucide-react";
import { MathText, toArabicMath } from "@/components/MathText";

export const Route = createFileRoute("/math-board")({ component: MathBoardPage });

const keys = ["٧", "٨", "٩", "÷", "٤", "٥", "٦", "×", "١", "٢", "٣", "-", "٠", ".", "/", "+"];
const fromArabicDigits = (value: string) => value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/×/g, "*").replace(/÷/g, "/");

function MathBoardPage() {
  const [expr, setExpr] = useState("");
  const result = useMemo(() => {
    try {
      if (!expr.trim()) return "";
      const safe = fromArabicDigits(expr).replace(/sqrt\(([^)]*)\)/gi, "Math.sqrt($1)");
      if (!/^[\d+\-*/().\sMathsqrt]+$/.test(safe)) return "";
      const value = Function(`"use strict"; return (${safe})`)();
      return Number.isFinite(value) ? toArabicMath(String(Number(value.toFixed(6)))) : "";
    } catch { return ""; }
  }, [expr]);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-[image:var(--gradient-hero)] flex items-center justify-center text-white"><Calculator className="h-5 w-5" /></div>
            <h1 className="font-bold">لوحة الرياضيات</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl grid lg:grid-cols-[1fr_320px] gap-5">
        <section className="bg-card border border-border rounded-3xl p-5 shadow-[var(--shadow-card)]">
          <div className="min-h-36 rounded-2xl bg-background border border-border p-5 text-3xl font-black leading-loose">
            {expr ? <MathText text={expr} /> : <span className="text-muted-foreground text-lg">اكتب المسألة بالأرقام العربية...</span>}
          </div>
          {result && <div className="mt-3 text-2xl font-black text-[var(--brand)]">= {result}</div>}
          <div className="grid grid-cols-4 gap-2 mt-5">
            {keys.map((k) => <button key={k} onClick={() => setExpr((v) => v + k)} className="h-14 rounded-2xl bg-secondary hover:bg-secondary/80 font-black text-xl">{k}</button>)}
          </div>
          <div className="grid grid-cols-3 gap-2 mt-2">
            <button onClick={() => setExpr((v) => v + "sqrt(")} className="h-12 rounded-2xl bg-secondary hover:bg-secondary/80 font-bold inline-flex items-center justify-center gap-1"><Radical className="h-4 w-4" /> جذر</button>
            <button onClick={() => setExpr((v) => v + ")")} className="h-12 rounded-2xl bg-secondary hover:bg-secondary/80 font-bold">)</button>
            <button onClick={() => setExpr((v) => v.slice(0, -1))} className="h-12 rounded-2xl bg-secondary hover:bg-secondary/80 font-bold">حذف</button>
          </div>
          <button onClick={() => setExpr("")} className="mt-2 w-full h-12 rounded-2xl bg-destructive/10 text-destructive font-bold inline-flex items-center justify-center gap-2"><RotateCcw className="h-4 w-4" /> مسح</button>
        </section>

        <aside className="bg-card border border-border rounded-3xl p-5 shadow-[var(--shadow-card)] space-y-4">
          <h2 className="font-black flex items-center gap-2"><Divide className="h-5 w-5 text-[var(--brand)]" /> أمثلة جاهزة</h2>
          {["١/٢ + ١/٤", "sqrt(٩) + ٢", "١٢ ÷ ٣", "٤ × ٥ - ٣"].map((ex) => (
            <button key={ex} onClick={() => setExpr(ex)} className="w-full text-right rounded-2xl border border-border p-3 hover:bg-secondary">
              <MathText text={ex} />
            </button>
          ))}
        </aside>
      </main>
    </div>
  );
}