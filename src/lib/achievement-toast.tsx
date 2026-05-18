import { toast } from "sonner";

export function showAchievement(title: string, desc: string, emoji = "🏆") {
  toast.custom(
    (id) => (
      <div
        dir="rtl"
        className="flex items-center gap-3 bg-card border border-border rounded-2xl shadow-2xl px-4 py-3 w-80 cursor-pointer achievement-toast-enter"
        onClick={() => toast.dismiss(id)}
        style={{ boxShadow: "0 8px 40px -8px oklch(0.62 0.19 265 / 0.35)" }}
      >
        <div
          className="h-14 w-14 rounded-2xl flex items-center justify-center text-3xl flex-shrink-0 shadow-lg"
          style={{ background: "var(--gradient-hero)" }}
        >
          {emoji}
        </div>
        <div className="flex-1 min-w-0">
          <div className="font-black text-sm text-foreground">{title}</div>
          <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); toast.dismiss(id); }}
          className="text-muted-foreground hover:text-foreground text-xl leading-none flex-shrink-0 px-1"
          aria-label="إغلاق"
        >
          ×
        </button>
      </div>
    ),
    { duration: 5500, position: "top-center" }
  );
}
