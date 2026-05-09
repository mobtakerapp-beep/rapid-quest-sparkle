import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy, Crown, Medal, GraduationCap, BookOpen } from "lucide-react";

export const Route = createFileRoute("/leaderboard")({
  component: LeaderboardPage,
});

type Row = { id: string; display_name: string | null; role_type: string | null; points: number };

function LeaderboardPage() {
  const [students, setStudents] = useState<Row[]>([]);
  const [teachers, setTeachers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"student" | "teacher">("student");

  useEffect(() => {
    (async () => {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, role_type, points").order("points", { ascending: false }).limit(200);
      const all = (profs || []) as any as Row[];
      setStudents(all.filter((p) => p.role_type === "student").slice(0, 50));
      setTeachers(all.filter((p) => p.role_type === "teacher" || p.role_type === "supervisor").slice(0, 50));
      setLoading(false);
    })();
  }, []);

  const rows = tab === "student" ? students : teachers;
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10 backdrop-blur bg-card/90">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> الرئيسية
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <h1 className="font-bold">لوحة المتصدرين</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="text-center mb-8">
          <h2 className="text-2xl md:text-3xl font-black mb-2">أبطال المجتمع 🏆</h2>
          <p className="text-muted-foreground text-sm">النقاط تُمنح تلقائياً على كل مشاركة (تعليق، نشاط، مسابقة)</p>
        </div>

        <div className="flex gap-2 justify-center mb-6">
          <button onClick={() => setTab("student")} className={`px-5 py-2 rounded-xl font-bold inline-flex items-center gap-2 ${tab === "student" ? "bg-[image:var(--gradient-hero)] text-white" : "bg-secondary"}`}>
            <BookOpen className="h-4 w-4" /> أعلى طالب
          </button>
          <button onClick={() => setTab("teacher")} className={`px-5 py-2 rounded-xl font-bold inline-flex items-center gap-2 ${tab === "teacher" ? "bg-[image:var(--gradient-hero)] text-white" : "bg-secondary"}`}>
            <GraduationCap className="h-4 w-4" /> أعلى معلم
          </button>
        </div>

        {loading ? (
          <div className="text-center text-muted-foreground py-20 text-sm">جاري الحساب...</div>
        ) : rows.length === 0 ? (
          <div className="text-center text-muted-foreground py-20 text-sm">لا توجد بيانات بعد. شارك في المجتمع لتظهر هنا!</div>
        ) : (
          <>
            {/* Podium */}
            {top3.length > 0 && (
              <div className="grid grid-cols-3 gap-3 mb-8 items-end">
                {[1, 0, 2].map((idx) => {
                  const r = top3[idx];
                  if (!r) return <div key={idx} />;
                  const heights = ["h-32", "h-40", "h-28"];
                  const colors = ["from-slate-300 to-slate-400", "from-amber-400 to-amber-500", "from-orange-400 to-orange-500"];
                  const labels = ["🥈", "🥇", "🥉"];
                  return (
                    <div key={r.id} className="flex flex-col items-center">
                      <div className="text-3xl mb-1">{labels[idx]}</div>
                      <div className="font-bold text-sm text-center mb-2 line-clamp-1">{r.display_name || "—"}</div>
                      <div className={`w-full ${heights[idx]} rounded-t-2xl bg-gradient-to-b ${colors[idx]} flex flex-col items-center justify-center text-white shadow-lg`}>
                        <Crown className="h-6 w-6 mb-1" />
                        <div className="text-2xl font-black">{r.points}</div>
                        <div className="text-xs opacity-90">نقطة</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* List */}
            <div className="bg-card rounded-3xl border border-border overflow-hidden shadow-[var(--shadow-card)]">
              {rest.map((r, i) => (
                <div key={r.id} className="flex items-center gap-3 p-4 border-b border-border last:border-0">
                  <div className="w-8 text-center font-bold text-muted-foreground">#{i + 4}</div>
                  <div className="h-10 w-10 rounded-full bg-[image:var(--gradient-warm)] flex items-center justify-center text-white font-bold">
                    {(r.display_name || "؟").charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm">{r.display_name || "—"}</div>
                    <div className="text-xs text-muted-foreground">{r.role_type === "teacher" ? "معلم" : r.role_type === "supervisor" ? "مشرف" : "طالب"}</div>
                  </div>
                  <div className="flex items-center gap-1 font-black text-[var(--brand)]">
                    <Medal className="h-4 w-4" /> {r.points}
                  </div>
                </div>
              ))}
              {rest.length === 0 && rows.length > 0 && (
                <div className="text-center text-sm text-muted-foreground p-6">شارك أكثر لتدخل قائمة الأبطال!</div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
