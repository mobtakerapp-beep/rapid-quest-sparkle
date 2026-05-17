import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toAr } from "@/lib/utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, ShieldCheck, Ban, CheckCircle2, AlertTriangle, Trash2 } from "lucide-react";
import { FullPageLoader } from "@/components/LoadingSpinner";

export const Route = createFileRoute("/supervisor")({ component: SupervisorPage });

type Profile = {
  id: string; display_name: string | null; role_type: string | null;
  points: number; warning_count: number; is_banned: boolean;
  is_admin?: boolean; is_teacher_role?: boolean;
};

function SupervisorPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<Profile[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [tab, setTab] = useState<"users" | "reports">("users");
  const [q, setQ] = useState("");
  const [code, setCode] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id);
      const ok = !!roles?.some(r => r.role === "supervisor" || r.role === "admin");
      setAllowed(ok);
      if (ok) await loadAll();
      setLoading(false);
    });
  }, [navigate]);

  const loadAll = async () => {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, display_name, role_type, points, warning_count, is_banned")
      .order("points", { ascending: false }).limit(300);
    const ids = (profs || []).map((p: any) => p.id);
    const { data: roleRows } = ids.length
      ? await supabase.from("user_roles").select("user_id, role").in("user_id", ids)
      : { data: [] as any[] };
    const adminSet = new Set<string>(); const teacherSet = new Set<string>();
    (roleRows || []).forEach((r: any) => {
      if (r.role === "admin") adminSet.add(r.user_id);
      if (r.role === "teacher" || r.role === "supervisor") teacherSet.add(r.user_id);
    });
    setUsers(((profs || []) as any[]).map((p) => ({
      ...p, is_admin: adminSet.has(p.id), is_teacher_role: teacherSet.has(p.id),
    })));
    const { data: rep } = await supabase.from("reports").select("*").order("created_at", { ascending: false }).limit(50);
    setReports(rep || []);
  };

  const claimSupervisor = async () => {
    if (!code.trim()) return;
    const { data, error } = await supabase.rpc("claim_supervisor_role" as any, { _code: code.trim() });
    if (error || !data) return toast.error("الكود غير صحيح");
    toast.success("تم تفعيل صلاحيات المشرف");
    setCode("");
    location.reload();
  };

  const toggleBan = async (p: Profile) => {
    if (p.is_admin || p.is_teacher_role) {
      return toast.error("لا يمكنك حظر مشرف عام أو معلم");
    }
    const { error } = await supabase.from("profiles").update({ is_banned: !p.is_banned }).eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(p.is_banned ? "تم رفع الحظر" : "تم الحظر");
    setUsers(list => list.map(x => x.id === p.id ? { ...x, is_banned: !p.is_banned } : x));
  };

  if (loading) return <FullPageLoader />;

  if (!allowed) {
    return (
      <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
        <ShieldCheck className="h-12 w-12 text-[var(--brand)]" />
        <h2 className="font-bold text-lg">تفعيل صلاحيات المشرف</h2>
        <p className="text-sm text-muted-foreground">أدخل كود المشرف للوصول إلى لوحة المراقبة</p>
        <input value={code} onChange={(e) => setCode(e.target.value.replace(/[^\x20-\x7E]/g, ""))} placeholder="كود المشرف"
          dir="ltr" lang="en" autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
          className="w-72 px-4 py-2.5 rounded-xl border border-border bg-background text-center" />
        <button onClick={claimSupervisor} className="px-6 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold">تفعيل</button>
        <Link to="/" className="text-[var(--brand)] font-bold mt-2">العودة</Link>
      </div>
    );
  }

  // Only show students and parents (filter out admins, teachers, supervisors)
  const targets = users.filter(u => !u.is_admin && !u.is_teacher_role);
  const filtered = targets.filter(u => !q || (u.display_name || "").toLowerCase().includes(q.toLowerCase()));

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10 backdrop-blur bg-card/90">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <h1 className="font-bold">لوحة المشرف</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-6xl">
        <div className="flex gap-2 mb-5 flex-wrap">
          {([["users","الطلاب وأولياء الأمور"],["reports","البلاغات"]] as const).map(([k,l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`px-4 py-2 rounded-xl text-sm font-bold ${tab === k ? "bg-[image:var(--gradient-hero)] text-white" : "bg-secondary"}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex gap-2 items-start">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
          <div>صلاحيتك تشمل حظر/رفع حظر <b>الطلاب وأولياء الأمور فقط</b>. لا يمكنك حظر المعلمين أو المشرفين. الحذف الكامل من اختصاص المشرف العام.</div>
        </div>

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
                        {u.is_banned && <span className="text-red-500 text-xs"> (محظور)</span>}
                      </td>
                      <td className="p-2 text-center text-xs">{u.role_type || "طالب"}</td>
                      <td className="p-2 text-center font-bold">{toAr(u.points)}</td>
                      <td className="p-2 text-center">{toAr(u.warning_count)}</td>
                      <td className="p-2 text-center">
                        <button onClick={() => toggleBan(u)} className={`px-3 py-1 rounded-lg text-xs font-bold ${u.is_banned ? "bg-emerald-500 text-white" : "bg-red-500 text-white"}`}>
                          {u.is_banned ? <CheckCircle2 className="h-3 w-3 inline" /> : <Ban className="h-3 w-3 inline" />}
                          {" "}{u.is_banned ? "رفع الحظر" : "حظر"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filtered.length === 0 && (
                    <tr><td colSpan={5} className="p-6 text-center text-muted-foreground text-sm">لا يوجد مستخدمون</td></tr>
                  )}
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
