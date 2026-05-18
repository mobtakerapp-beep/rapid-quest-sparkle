import { useEffect, useRef, useState, useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Search, X, BookOpen, ClipboardList, Zap, Users, Trophy, Image, Calendar } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type ResultItem = {
  id: string;
  title: string;
  subtitle?: string;
  route: string;
  category: string;
  icon: React.ReactNode;
};

const CATEGORY_ORDER = ["الأنشطة", "الواجبات", "الاختبارات", "المسابقات", "الأعضاء"];

const CAT_COLORS: Record<string, string> = {
  "الأنشطة":    "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  "الواجبات":   "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-400",
  "الاختبارات": "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400",
  "المسابقات":  "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  "الأعضاء":    "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400",
};

async function runSearch(q: string): Promise<ResultItem[]> {
  if (!q.trim()) return [];
  const like = `%${q.trim()}%`;

  const [
    { data: acts },
    { data: asgns },
    { data: quizzes },
    { data: comps },
    { data: profiles },
  ] = await Promise.all([
    supabase.from("activities").select("id, title, subject").ilike("title", like).limit(5),
    supabase.from("assignments").select("id, title, subject").ilike("title", like).limit(5),
    supabase.from("quizzes").select("id, title, subject").ilike("title", like).limit(5),
    supabase.from("competitions").select("id, title").ilike("title", like).limit(5),
    supabase.from("profiles").select("id, display_name, role_type").ilike("display_name", like).limit(6),
  ]);

  const results: ResultItem[] = [];

  (acts || []).forEach((a: any) => results.push({
    id: `act-${a.id}`, title: a.title || "—",
    subtitle: a.subject || "نشاط",
    route: "/activities",
    category: "الأنشطة",
    icon: <BookOpen className="h-4 w-4" />,
  }));

  (asgns || []).forEach((a: any) => results.push({
    id: `asgn-${a.id}`, title: a.title || "—",
    subtitle: a.subject || "واجب",
    route: "/assignments",
    category: "الواجبات",
    icon: <ClipboardList className="h-4 w-4" />,
  }));

  (quizzes || []).forEach((q: any) => results.push({
    id: `quiz-${q.id}`, title: q.title || "—",
    subtitle: q.subject || "اختبار",
    route: "/quizzes",
    category: "الاختبارات",
    icon: <Zap className="h-4 w-4" />,
  }));

  (comps || []).forEach((c: any) => results.push({
    id: `comp-${c.id}`, title: c.title || "—",
    route: "/competitions",
    category: "المسابقات",
    icon: <Trophy className="h-4 w-4" />,
  }));

  (profiles || []).forEach((p: any) => results.push({
    id: `prof-${p.id}`, title: p.display_name || "—",
    subtitle: p.role_type === "teacher" ? "معلم" : p.role_type === "student" ? "طالب" : p.role_type || "",
    route: "/leaderboard",
    category: "الأعضاء",
    icon: <Users className="h-4 w-4" />,
  }));

  return results;
}

const QUICK_LINKS = [
  { label: "الأنشطة",    route: "/activities",    icon: <BookOpen className="h-4 w-4" /> },
  { label: "الواجبات",   route: "/assignments",   icon: <ClipboardList className="h-4 w-4" /> },
  { label: "الاختبارات", route: "/quizzes",       icon: <Zap className="h-4 w-4" /> },
  { label: "المسابقات",  route: "/competitions",  icon: <Trophy className="h-4 w-4" /> },
  { label: "المعرض",     route: "/gallery",       icon: <Image className="h-4 w-4" /> },
  { label: "التقويم",    route: "/calendar",      icon: <Calendar className="h-4 w-4" /> },
  { label: "المتصدرون",  route: "/leaderboard",   icon: <Users className="h-4 w-4" /> },
];

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ResultItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const close = useCallback(() => {
    setOpen(false);
    setQuery("");
    setResults([]);
    setCursor(0);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
  }, [open]);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(async () => {
      const r = await runSearch(query);
      setResults(r);
      setCursor(0);
      setLoading(false);
    }, 280);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const allItems = query.trim() ? results : [];

  const go = useCallback((route: string) => {
    close();
    navigate({ to: route as any });
  }, [close, navigate]);

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, allItems.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter" && allItems[cursor]) go(allItems[cursor].route);
  };

  // Listen for custom event from GlobalNav button
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("open-global-search", handler);
    return () => window.removeEventListener("open-global-search", handler);
  }, []);

  if (!open) return null;

  const grouped = CATEGORY_ORDER.reduce<Record<string, ResultItem[]>>((acc, cat) => {
    const items = results.filter((r) => r.category === cat);
    if (items.length) acc[cat] = items;
    return acc;
  }, {});

  let flatIdx = 0;

  return (
    <div className="fixed inset-0 z-[500] flex items-start justify-center pt-16 px-4" dir="rtl">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={close} />
      <div className="relative w-full max-w-xl bg-card rounded-2xl border border-border shadow-2xl overflow-hidden">
        {/* حقل البحث */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-5 w-5 text-muted-foreground shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKey}
            placeholder="ابحث في الأنشطة، الواجبات، الاختبارات، الأعضاء..."
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            autoComplete="off"
          />
          <div className="flex items-center gap-2">
            {loading && <div className="h-4 w-4 rounded-full border-2 border-[var(--brand)] border-t-transparent animate-spin" />}
            <kbd className="hidden sm:inline-flex text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-mono">Esc</kbd>
            <button onClick={close} className="p-1 rounded-lg hover:bg-secondary transition">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto">
          {/* نتائج البحث */}
          {query.trim() && results.length > 0 && (
            <div className="p-2">
              {Object.entries(grouped).map(([cat, items]) => (
                <div key={cat} className="mb-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-muted-foreground uppercase tracking-wide">{cat}</div>
                  {items.map((item) => {
                    const idx = flatIdx++;
                    const active = idx === cursor;
                    return (
                      <button
                        key={item.id}
                        onClick={() => go(item.route)}
                        onMouseEnter={() => setCursor(idx)}
                        className={`w-full text-right flex items-center gap-3 px-3 py-2.5 rounded-xl transition ${active ? "bg-[var(--brand)]/10 text-[var(--brand)]" : "hover:bg-secondary"}`}
                      >
                        <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${CAT_COLORS[cat] || "bg-secondary"}`}>
                          {item.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{item.title}</p>
                          {item.subtitle && <p className="text-[11px] text-muted-foreground truncate">{item.subtitle}</p>}
                        </div>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full shrink-0 ${CAT_COLORS[cat] || "bg-secondary"}`}>{cat}</span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {/* لا نتائج */}
          {query.trim() && !loading && results.length === 0 && (
            <div className="py-12 text-center">
              <Search className="h-10 w-10 text-muted-foreground mx-auto mb-3 opacity-40" />
              <p className="text-sm text-muted-foreground">لا نتائج لـ "{query}"</p>
            </div>
          )}

          {/* روابط سريعة */}
          {!query.trim() && (
            <div className="p-4">
              <p className="text-[11px] font-bold text-muted-foreground mb-3 px-1">الأقسام الرئيسية</p>
              <div className="grid grid-cols-2 gap-2">
                {QUICK_LINKS.map((link) => (
                  <button
                    key={link.route}
                    onClick={() => go(link.route)}
                    className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border hover:border-[var(--brand)]/40 hover:bg-[var(--brand)]/5 transition text-right group"
                  >
                    <span className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center shrink-0 group-hover:bg-[var(--brand)]/10 group-hover:text-[var(--brand)] transition">
                      {link.icon}
                    </span>
                    <span className="text-sm font-bold">{link.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-[10px] text-muted-foreground">
          <span>↑↓ للتنقل · Enter للفتح · Esc للإغلاق</span>
          <span className="flex items-center gap-1">
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono">Ctrl</kbd>
            <span>+</span>
            <kbd className="px-1.5 py-0.5 rounded bg-secondary font-mono">K</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
