import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Shield, Users, BookOpen, Trophy, AlertTriangle, Ban, CheckCircle2, Trash2, Star, Bell } from "lucide-react";
import { FullPageLoader } from "@/components/LoadingSpinner";

export const Route = createFileRoute("/admin")({ component: AdminPage });

type Profile = { id: string; display_name: string | null; role_type: string | null; points: number; warning_count: number; is_banned: boolean; class_code: string | null; is_admin?: boolean; is_teacher?: boolean };
type Counts = { users: number; teachers: number; activities: number; quizzes: number; competitions: number; reports: number };

function AdminPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [counts, setCounts] = useState<Counts>({ users: 0, teachers: 0, activities: 0, quizzes: 0, competitions: 0, reports: 0 });
  const [users, setUsers] = useState<Profile[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [tab, setTab] = useState<"overview" | "users" | "reports">("overview");
  const [q, setQ] = useState("");
  const [warningTarget, setWarningTarget] = useState<Profile | null>(null);
  const [warningReason, setWarningReason] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id);
      const ok = !!roles?.some(r => r.role === "admin");
      setAllowed(ok);
      if (ok) await loadAll();
      setLoading(false);
    });
  }, [navigate]);

  const loadAll = async () => {
    const [u, t, a, q, c, r, allUsers, rep] = await Promise.all([
      supabase.from("profiles").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("*", { count: "exact", head: true }).in("role_type", ["teacher","supervisor"]),
      supabase.from("activities").select("*", { count: "exact", head: true }),
      supabase.from("quizzes").select("*", { count: "exact", head: true }),
      supabase.from("competitions").select("*", { count: "exact", head: true }),
      supabase.from("reports").select("*", { count: "exact", head: true }),
      supabase.from("profiles").select("id, display_name, role_type, points, warning_count, is_banned, class_code").order("points", { ascending: false }).limit(200),
      supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(50),
    ]);
    setCounts({ users: u.count || 0, teachers: t.count || 0, activities: a.count || 0, quizzes: q.count || 0, competitions: c.count || 0, reports: r.count || 0 });
    const ids = (allUsers.data || []).map((x: any) => x.id);
    const { data: roleRows } = ids.length
      ? await supabase.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as any[] };
    const adminSet = new Set<string>(); const teacherSet = new Set<string>();
    (roleRows || []).forEach((r: any) => {
      if (r.role === "admin") adminSet.add(r.user_id);
      if (r.role === "teacher" || r.role === "supervisor") teacherSet.add(r.user_id);
    });
    setUsers(((allUsers.data || []) as any[]).map((p) => ({ ...p, is_admin: adminSet.has(p.id), is_teacher: teacherSet.has(p.id) })));
    setReports(rep.data || []);
  };

  const toggleBan = async (p: Profile) => {
    const { error } = await supabase.from("profiles").update({ is_banned: !p.is_banned }).eq("id", p.id);
    if (error) return toast.error(error.message);
    // Send notification for ban
    if (!p.is_banned) {
      await supabase.from("notifications").insert({
        user_id: p.id, title: "⛔ تم حظر حسابك",
        body: "تم حظر حسابك من قِبل الإدارة. للاستفسار تواصل مع المشرف.",
        type: "ban", link: "/",
      });
    }
    toast.success(p.is_banned ? "تم رفع الحظر" : "تم الحظر");
    setUsers(list => list.map(x => x.id === p.id ? { ...x, is_banned: !p.is_banned } : x));
  };

  const sendWarning = async () => {
    if (!warningTarget || !warningReason.trim()) return;
    const newCount = (warningTarget.warning_count || 0) + 1;
    const [r1] = await Promise.all([
      supabase.from("profiles").update({ warning_count: newCount }).eq("id", warningTarget.id),
      supabase.from("notifications").insert({
        user_id: warningTarget.id,
        title: `⚠️ إنذار رسمي (${newCount})`,
        body: warningReason.trim(),
        type: "warning",
        link: "/",
      }),
    ]);
    if (r1.error) return toast.error(r1.error.message);
    toast.success(`تم إرسال الإنذار إلى ${warningTarget.display_name}`);
    setUsers(list => list.map(x => x.id === warningTarget.id ? { ...x, warning_count: newCount } : x));
    setWarningTarget(null);
    setWarningReason("");
  };

  const runWeekly = async () => {
    const { error } = await supabase.rpc("award_weekly_top" as any);
    if (error) return toast.error(error.message);
    toast.success("تم تنفيذ منح أوسمة الأسبوع");
  };

  if (loading) return <FullPageLoader />;
  if (!allowed) return (
    <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
      <p className="text-muted-foreground">هذه الصفحة للمشرف العام فقط</p>
      <Link to="/" className="text-[var(--brand)] font-bold">العودة</Link>
    </div>
  );

  /* ── Warning modal ── */
  const WarningModal = warningTarget ? (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setWarningTarget(null)}>
      <div dir="rtl" className="bg-card rounded-3xl border border-border p-6 max-w-sm w-full shadow-2xl space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 font-black text-lg">
          <AlertTriangle className="h-5 w-5 text-amber-500" />
          إرسال إنذار رسمي
        </div>
        <div className="text-sm text-muted-foreground">المستخدم: <b>{warningTarget.display_name}</b></div>
        <textarea
          value={warningReason}
          onChange={(e) => setWarningReason(e.target.value)}
          placeholder="اكتب سبب الإنذار..."
          rows={3}
          className="w-full px-4 py-3 rounded-xl border border-border bg-background resize-none text-sm"
          autoFocus
        />
        <div className="flex gap-2">
          <button onClick={sendWarning} disabled={!warningReason.trim()}
            className="flex-1 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-bold text-sm disabled:opacity-50">
            <Bell className="h-4 w-4 inline me-1" /> إرسال الإنذار
          </button>
          <button onClick={() => { setWarningTarget(null); setWarningReason(""); }}
            className="px-4 py-2 rounded-xl bg-secondary font-bold text-sm">
            إلغاء
          </button>
        </div>
      </div>
    </div>
  ) : null;

  const filtered = users.filter(u => !q || (u.display_name || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      {WarningModal}
      <header className="bg-card border-b border-border sticky top-0 z-10 backdrop-blur bg-card/90">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> الرئيسية
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-600 to-orange-700 flex items-center justify-center text-white">
              <Shield className="h-5 w-5" />
            </div>
            <h1 className="font-bold">لوحة الإدارة</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex gap-2 mb-5 flex-wrap">
          {([["overview","نظرة عامة"],["users","المستخدمون"],["reports","البلاغات"]] as const).map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === k ? "bg-[image:var(--gradient-hero)] text-white" : "bg-secondary"}`}>
              {l}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-5">
              {[
                { l: "المستخدمون", v: counts.users, i: Users, c: "from-blue-500 to-cyan-500" },
                { l: "المعلمون والمشرفون", v: counts.teachers, i: BookOpen, c: "from-emerald-500 to-teal-500" },
                { l: "الأنشطة", v: counts.activities, i: BookOpen, c: "from-violet-500 to-pink-500" },
                { l: "الاختبارات", v: counts.quizzes, i: Trophy, c: "from-rose-500 to-pink-500" },
                { l: "المسابقات", v: counts.competitions, i: Trophy, c: "from-amber-500 to-orange-500" },
                { l: "البلاغات", v: counts.reports, i: AlertTriangle, c: "from-red-500 to-rose-600" },
              ].map((s) => (
                <div key={s.l} className="bg-card border border-border rounded-2xl p-4 shadow-[var(--shadow-card)]">
                  <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${s.c} flex items-center justify-center text-white mb-2`}>
                    <s.i className="h-5 w-5" />
                  </div>
                  <div className="text-2xl font-black">{s.v}</div>
                  <div className="text-xs text-muted-foreground">{s.l}</div>
                </div>
              ))}
            </div>
            <button onClick={runWeekly} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[image:var(--gradient-warm)] text-white font-bold">
              <Star className="h-4 w-4" /> تنفيذ منح أوسمة الأسبوع الآن
            </button>
          </>
        )}

        {tab === "users" && (
          <div className="bg-card border border-border rounded-2xl overflow-hidden">
            <div className="p-3 border-b border-border">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="بحث بالاسم..."
                className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-secondary/50">
                  <tr><th className="p-2 text-right">الاسم</th><th className="p-2">الدور</th><th className="p-2">النقاط</th><th className="p-2">تحذيرات</th><th className="p-2">إجراء</th></tr>
                </thead>
                <tbody>
                  {filtered.map(u => (
                    <tr key={u.id} className="border-t border-border">
                      <td className="p-2 font-bold">
                        {u.display_name || "—"}
                        {u.is_admin && <span className="text-amber-600 text-xs ms-1">🛡️</span>}
                        {u.is_banned && <span className="text-red-500 text-xs"> (محظور)</span>}
                      </td>
                      <td className="p-2 text-center text-xs">{u.is_admin ? "مشرف عام" : u.role_type || "طالب"}</td>
                      <td className="p-2 text-center font-bold">{u.points}</td>
                      <td className="p-2 text-center">{u.warning_count}</td>
                      <td className="p-2 text-center">
                        {u.is_admin ? (
                          <span className="text-xs text-muted-foreground">محمي</span>
                        ) : (
                          <div className="flex items-center justify-center gap-1 flex-wrap">
                            <button onClick={() => { setWarningTarget(u); setWarningReason(""); }}
                              className="px-2 py-1 rounded-lg text-xs font-bold bg-amber-500 text-white">
                              <AlertTriangle className="h-3 w-3 inline me-0.5" /> إنذار
                            </button>
                            <button onClick={() => toggleBan(u)} className={`px-2 py-1 rounded-lg text-xs font-bold ${u.is_banned ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
                              {u.is_banned ? <CheckCircle2 className="h-3 w-3 inline" /> : <Ban className="h-3 w-3 inline" />}
                              {" "}{u.is_banned ? "رفع" : "حظر"}
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === "reports" && (
          <div className="space-y-2">
            {reports.length === 0 ? <div className="text-center py-10 text-sm text-muted-foreground">لا بلاغات</div> :
              reports.map(r => (
                <div key={r.id} className="bg-card border border-border rounded-2xl p-3">
                  <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("ar-EG")}</div>
                  <div className="font-bold text-sm mt-1">{r.reason}</div>
                  {r.content && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{r.content}</div>}
                  <button onClick={async () => { await supabase.from("reports").delete().eq("id", r.id); setReports(p => p.filter(x => x.id !== r.id)); }}
                    className="mt-2 text-xs text-destructive inline-flex items-center gap-1">
                    <Trash2 className="h-3 w-3" /> حذف
                  </button>
                </div>
              ))
            }
          </div>
        )}
      </main>
    </div>
  );
}
