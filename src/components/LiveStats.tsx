import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Users, BookOpen, Trophy, Target } from "lucide-react";

type Stats = { students: number; activities: number; competitions: number; quizzes: number };

function useCountUp(target: number | null, duration = 900): number | null {
  const [display, setDisplay] = useState<number | null>(null);
  const rafRef = useRef<number>(0);
  useEffect(() => {
    if (target === null) { setDisplay(null); return; }
    const start = Date.now();
    const from = 0;
    const tick = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (target - from) * eased));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, duration]);
  return display;
}

function RollingNumber({ value }: { value: number | null }) {
  const prevRef = useRef<number | null>(null);
  const [key, setKey] = useState(0);

  useEffect(() => {
    if (value !== null && prevRef.current !== value) {
      if (prevRef.current === null) setKey(k => k + 1);
      prevRef.current = value;
    }
  }, [value]);

  if (value === null) {
    return <span className="inline-block h-6 w-8 rounded-md bg-secondary animate-pulse" />;
  }

  return (
    <span
      key={key}
      className="inline-block tabular-nums"
      style={{ animation: key > 0 ? "num-roll-up 0.55s cubic-bezier(0.22,1,0.36,1)" : "none" }}
    >
      {value.toLocaleString("ar-EG")}
    </span>
  );
}

export function LiveStats() {
  const [stats, setStats] = useState<Stats | null>(null);
  const students    = useCountUp(stats?.students    ?? null);
  const activities  = useCountUp(stats?.activities  ?? null);
  const competitions= useCountUp(stats?.competitions?? null);
  const quizzes     = useCountUp(stats?.quizzes     ?? null);

  useEffect(() => {
    const load = async () => {
      const [
        { count: students },
        { count: activities },
        { count: competitions },
        { count: quizzes },
      ] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }).or("role_type.is.null,role_type.eq.student"),
        supabase.from("activities").select("id", { count: "exact", head: true }).eq("status", "approved"),
        supabase.from("competitions").select("id", { count: "exact", head: true }),
        supabase.from("quizzes").select("id", { count: "exact", head: true }),
      ]);
      setStats({
        students: students ?? 0,
        activities: activities ?? 0,
        competitions: competitions ?? 0,
        quizzes: quizzes ?? 0,
      });
    };
    load();
    const ch = supabase.channel("livestats-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "profiles" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "activities" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "activities" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "competitions" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "competitions" }, load)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quizzes" }, load)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "quizzes" }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const items = [
    { icon: Users,    label: "طالب مشارك",   value: students,     color: "from-emerald-500 to-teal-500",   glow: "shadow-emerald-200 dark:shadow-emerald-900" },
    { icon: BookOpen, label: "نشاط تعليمي",  value: activities,   color: "from-blue-500 to-cyan-500",      glow: "shadow-blue-200 dark:shadow-blue-900" },
    { icon: Trophy,   label: "مسابقة سريعة", value: competitions, color: "from-amber-500 to-orange-500",   glow: "shadow-amber-200 dark:shadow-amber-900" },
    { icon: Target,   label: "اختبار تفاعلي",value: quizzes,      color: "from-rose-500 to-pink-500",      glow: "shadow-rose-200 dark:shadow-rose-900" },
  ];

  return (
    <section className="container mx-auto px-6 pb-10" dir="rtl">
      <div className="grid grid-cols-4 gap-2 sm:gap-3">
        {items.map((item, idx) => (
          <div
            key={item.label}
            className="relative bg-card rounded-xl border border-border shadow-sm p-2.5 sm:p-3 flex flex-col items-center gap-1.5 overflow-hidden group hover:-translate-y-1 hover:shadow-md transition-all duration-300"
            style={{ animationDelay: `${idx * 80}ms` }}
          >
            <div className={`h-8 w-8 sm:h-9 sm:w-9 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center shadow-sm ${item.glow} group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
              <item.icon className="h-4 w-4 text-white" />
            </div>
            <div className="text-base sm:text-lg font-black text-foreground leading-none">
              <RollingNumber value={item.value} />
            </div>
            <div className="text-[10px] sm:text-xs text-muted-foreground font-medium text-center leading-tight">{item.label}</div>
            <div className={`absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r ${item.color}`} />
          </div>
        ))}
      </div>
    </section>
  );
}
