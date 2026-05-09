import { type RefObject } from "react";

type Props = {
  targetRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  onChange: (val: string) => void;
  className?: string;
};

const SYMBOLS: { label: string; insert: string; title: string }[] = [
  { label: "أ/ب", insert: "[a/b]", title: "كسر — اكتب البسط/المقام داخل القوسين" },
  { label: "√", insert: "√(  )", title: "جذر تربيعي" },
  { label: "س²", insert: "²", title: "أس 2" },
  { label: "س³", insert: "³", title: "أس 3" },
  { label: "÷", insert: " ÷ ", title: "قسمة" },
  { label: "×", insert: " × ", title: "ضرب" },
  { label: "±", insert: "±", title: "موجب/سالب" },
  { label: "≥", insert: " ≥ ", title: "أكبر أو يساوي" },
  { label: "≤", insert: " ≤ ", title: "أصغر أو يساوي" },
  { label: "≠", insert: " ≠ ", title: "لا يساوي" },
  { label: "π", insert: "π", title: "باي" },
  { label: "°", insert: "°", title: "درجة" },
  { label: "∞", insert: "∞", title: "ما لا نهاية" },
  { label: "( )", insert: "(  )", title: "أقواس" },
];

const ARABIC_DIGITS = ["٠","١","٢","٣","٤","٥","٦","٧","٨","٩"];

export function MathToolbar({ targetRef, onChange, className = "" }: Props) {
  const insert = (snippet: string) => {
    const el = targetRef.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    const before = el.value.slice(0, start);
    const after = el.value.slice(end);
    const next = before + snippet + after;
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const caret = start + snippet.length;
      el.setSelectionRange(caret, caret);
    });
  };

  return (
    <div className={`flex flex-wrap gap-1 p-2 rounded-xl bg-secondary/40 border border-border ${className}`}>
      {SYMBOLS.map((s) => (
        <button key={s.label} type="button" title={s.title} onClick={() => insert(s.insert)}
          className="px-2.5 py-1 rounded-lg bg-card hover:bg-[var(--brand)]/10 text-sm font-bold border border-border min-w-[36px]">
          {s.label}
        </button>
      ))}
      <div className="w-full" />
      {ARABIC_DIGITS.map((d) => (
        <button key={d} type="button" onClick={() => insert(d)}
          className="px-2 py-1 rounded-lg bg-card hover:bg-[var(--brand)]/10 text-sm font-bold border border-border min-w-[32px]">
          {d}
        </button>
      ))}
    </div>
  );
}
