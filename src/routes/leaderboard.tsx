import { createFileRoute } from "@tanstack/react-router";
import { toAr } from "@/lib/utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Star, Crown, Medal } from "lucide-react";
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});

type Row = { id: string; display_name: string | null; role_type: string | null; points: number };

function HonorBadge() {
  return (
    <div className="relative flex items-center justify-center w-24 h-24 mx-auto mb-3">
      <div className="absolute inset-0 rounded-full bg-gradient-to-br from-amber-400 via-yellow-300 to-orange-500 shadow-[0_0_32px_8px_rgba(251,191,36,0.45)] animate-pulse" />
      <div className="absolute inset-2 rounded-full bg-gradient-to-br from-yellow-200 to-amber-400 flex items-center justify-center border-4 border-white shadow-inner">
        <Crown className="h-10 w-10 text-amber-700 drop-shadow" />
      </div>
      <Star className="absolute -top-1 -right-1 h-6 w-6 text-yellow-400 fill-yellow-300 drop-shadow" />
      <Star className="absolute -top-1 -left-1 h-5 w-5 text-amber-500 fill-amber-300 drop-shadow" />
      <Star className="absolute -bottom-1 right-2 h-4 w-4 text-orange-400 fill-orange-300 drop-shadow" />
    </div>
  );
}

function LeaderboardPage() {
  const [students, setStudents] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"student" | "teacher">("student");

  const loadProfiles = async () => {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, role_type, points")
      .order("points", { ascending: false })
      .limit(200);
    const all = (profs || []) as any as Row[];
    setStudents(all.filter((p) => !p.role_type || p.role_type === "student").slice(0, 3));
    setTeachers(all.filter((p) => ["teacher", "supervisor", "admin"].includes(p.role_type || "")).slice(0, 3));
    setLoading(false);
  };

  useEffect(() => {
    loadProfiles();
    const ch = supabase
      .channel("leaderboard-rt")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, () => loadProfiles())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = tab === "student" ? students : teachers;

  const podiumOrder = [1, 0, 2];
  const heights = ["h-28", "h-40", "h-24"];
  const ringColors = ["ring-slate-300", "ring-amber-400", "ring-orange-400"];
  const gradients = ["from-slate-300 to-slate-400", "from-amber-400 to-amber-500", "from-orange-400 to-orange-500"];
  const medals = ["🥈", "🥇", "🥉"];
  const rankLabels = ["الثاني", "الأول", "الثالث"];

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10 backdrop-blur bg-card/90">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="h-9 w-9 rounded-xl bg-secondary flex items-center justify-center hover:bg-secondary/80 transition-colors shrink-0">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center text-white shadow">
              <Crown className="h-5 w-5" />
            </div>
            <h1 className="font-black text-lg">لوحة الشرف</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-10 max-w-2xl">
        <div className="text-center mb-8">
          <HonorBadge />
          <h2 className="text-3xl font-black mb-1 bg-gradient-to-l from-amber-500 via-yellow-400 to-orange-500 bg-clip-text text-transparent drop-shadow-sm">
            لوحة الشرف
          </h2>
          <p className="text-muted-foreground text-sm">أبطال مبادرة كلنا معاً — النجوم الأكثر نشاطاً ✨</p>
        </div>

        <div className="flex gap-3 justify-center mb-8">
          <button
            onClick={() => setTab("student")}
            className={`px-5 py-2.5 rounded-2xl font-bold text-sm inline-flex items-center gap-2 transition-all shadow-sm ${tab === "student" ? "bg-gradient-to-l from-amber-500 to-yellow-400 text-white shadow-amber-200 shadow-md scale-105" : "bg-secondary hover:bg-secondary/80"}`}
          >
            <span className="text-base">🎓</span>
            <span>الطالب المتميز الأكثر نشاطاً</span>
          </button>
          <button
            onClick={() => setTab("teacher")}
            className={`px-5 py-2.5 rounded-2xl font-bold text-sm inline-flex items-center gap-2 transition-all shadow-sm ${tab === "teacher" ? "bg-gradient-to-l from-amber-500 to-yellow-400 text-white shadow-amber-200 shadow-md scale-105" : "bg-secondary hover:bg-secondary/80"}`}
          >
            <span className="text-base">👩‍🏫</span>
            <span>المعلم المتميز الأكثر نشاط</span>
          </button>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-20 text-sm">جاري الحساب...</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-muted-foreground py-20 text-sm">لا توجد بيانات بعد. شارك في المجتمع لتظهر هنا!</div>
        ) : (
          <div className="bg-card rounded-3xl border border-border p-6 shadow-[var(--shadow-card)]">
            <div className="grid grid-cols-3 gap-4 items-end">
              {podiumOrder.map((idx) => {
                const r = rows[idx];
                if (!r) return <div key={idx} />;
                return (
                  <div key={r.id} className="flex flex-col items-center gap-1">
                    <div className="text-4xl">{medals[idx]}</div>
                    <div className={`h-16 w-16 rounded-full bg-gradient-to-br ${gradients[idx]} flex items-center justify-center text-white font-black text-xl ring-4 ${ringColors[idx]} ring-offset-2 shadow-lg`}>
                      {(r.display_name || "؟").charAt(0)}
                    </div>
                    <div className="font-bold text-sm text-center leading-tight mt-1 line-clamp-2">
                      {r.display_name || "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">{rankLabels[idx]}</div>
                    <div className={`w-full ${heights[idx]} mt-2 rounded-t-2xl bg-gradient-to-b ${gradients[idx]} flex flex-col items-center justify-center text-white shadow-lg`}>
                      <Medal className="h-5 w-5 mb-1 opacity-80" />
                      <div className="text-xl font-black">{toAr(r.points)}</div>
                      <div className="text-xs opacity-80">نقطة</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
