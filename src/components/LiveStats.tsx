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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {items.map((item, idx) => (
          <div
            key={item.label}
            className="relative bg-card rounded-2xl border border-border shadow-sm p-5 flex flex-col items-center gap-2 overflow-hidden group hover:-translate-y-1 hover:shadow-lg transition-all duration-300"
            style={{ animationDelay: `${idx * 80}ms` }}
          >
            <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center shadow-md ${item.glow} group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
              <item.icon className="h-5 w-5 text-white" />
            </div>
            <div className="text-2xl font-black text-foreground tabular-nums">
              {item.value === null ? (
                <span className="inline-block h-7 w-10 rounded-lg bg-secondary animate-pulse" />
              ) : (
                item.value.toLocaleString("ar-EG")
              )}
            </div>
            <div className="text-xs text-muted-foreground font-medium text-center leading-tight">{item.label}</div>
            <div className={`absolute bottom-0 left-0 right-0 h-1.5 bg-gradient-to-r ${item.color}`} />
            <div className={`absolute inset-0 bg-gradient-to-br ${item.color} opacity-0 group-hover:opacity-5 transition-opacity duration-300 pointer-events-none`} />
          </div>
        ))}
      </div>
    </section>
  );
}
