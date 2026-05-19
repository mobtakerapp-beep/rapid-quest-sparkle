import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { toAr } from "@/lib/utils";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, GraduationCap, Users, FileText, MessageSquare, Copy, UserPlus, Award, Search, Palette, Type as TypeIcon, Sticker, Send, Trash2, Image as ImageIcon, X, QrCode, BookOpen, ClipboardList, TrendingUp, CheckCircle2, Clock } from "lucide-react";
import { copyToClipboard } from "@/lib/utils";
import { CERT_THEMES, CERT_FONTS, type CertTheme, type CertFont } from "@/lib/certThemes";
import { FullPageLoader } from "@/components/LoadingSpinner";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";
import { QRCodeSVG } from "qrcode.react";

export const Route = createFileRoute("/teacher")({ component: TeacherDashboard });

function QRModal({ code }: { code: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="p-2 rounded-lg hover:bg-secondary transition"
        title="عرض QR Code"
      >
        <QrCode className="h-4 w-4" />
      </button>
      {open && (
        <div className="fixed inset-0 z-[500] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="relative bg-card rounded-3xl border border-border shadow-2xl p-8 flex flex-col items-center gap-5 max-w-xs w-full">
            <button onClick={() => setOpen(false)} className="absolute top-3 left-3 p-1.5 rounded-lg hover:bg-secondary">
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
            <div className="h-10 w-10 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white">
              <QrCode className="h-5 w-5" />
            </div>
            <div className="text-center">
              <p className="font-black text-lg">QR كود الفصل</p>
              <p className="text-xs text-muted-foreground mt-1">يمسح الطالب الكود للانضمام لفصلك مباشرة</p>
            </div>
            <div className="p-4 rounded-2xl bg-white shadow-inner">
              <QRCodeSVG
                value={`${window.location.origin}/profile?join=${code}`}
                size={200}
                level="H"
                includeMargin={false}
              />
            </div>
            <div className="text-center">
              <code className="px-4 py-2 rounded-xl bg-secondary font-black text-2xl tracking-widest">{code}</code>
              <p className="text-[11px] text-muted-foreground mt-2">أو شارك الكود مباشرة</p>
            </div>
            <button
              onClick={async () => { const ok = await copyToClipboard(`${window.location.origin}/profile?join=${code}`); toast[ok ? "success" : "error"](ok ? "تم نسخ الرابط ✅" : "فشل النسخ"); }}
              className="w-full py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold flex items-center justify-center gap-2"
            >
              <Copy className="h-4 w-4" /> نسخ رابط الانضمام
            </button>
          </div>
        </div>
      )}
    </>
  );
}

type Stat = { id: string; display_name: string | null; grade: string | null; points: number; activities: number; comments: number };

function TeacherDashboard() {
  const [classCode, setClassCode] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [studentResults, setStudentResults] = useState<{ id: string; display_name: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  const [stats, setStats] = useState<Stat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const id = data.session.user.id;
      const [{ data: prof }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("class_code").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
      ]);
      const ok = !!roles?.some((r) => ["admin", "teacher", "supervisor"].includes(String(r.role)));
      setAllowed(ok);
      const code = prof?.class_code || null;
      setClassCode(code);
      setTeacherId(id);
      if (!ok) { setLoading(false); return; }
      await loadStudents(id, code);
      setLoading(false);
    });
  }, [navigate]);

  const loadStudents = async (tid: string, code?: string | null) => {
    // Fetch students linked to this teacher — by teacher_id (set via RPC) OR class_code (if stored on student profile)
    let q = supabase.from("profiles").select("id, display_name, points").eq("teacher_id", tid);
    if (code) {
      q = supabase.from("profiles").select("id, display_name, points").or(`teacher_id.eq.${tid},class_code.eq.${code}`);
    }
    const { data: students } = await q;
    const ids = (students || []).map((s) => s.id);
    // قراءة بيانات الفصل (الصف) من الجدول الخاص profiles_private (يصل المعلم لطلابه فقط لو سمحت السياسة، وإلا يبقى فارغ)
    const { data: privs } = ids.length
      ? await supabase.from("profiles_private" as any).select("user_id, grade").in("user_id", ids)
      : { data: [] as any[] };
    const gradeMap: Record<string, string> = {};
    (privs || []).forEach((p: any) => { gradeMap[p.user_id] = p.grade || ""; });
    const [{ data: msgs }, { data: acmts }] = await Promise.all([
      ids.length ? supabase.from("messages").select("user_id").in("user_id", ids) : Promise.resolve({ data: [] as any[] }),
      ids.length ? supabase.from("activity_comments").select("user_id").in("user_id", ids) : Promise.resolve({ data: [] as any[] }),
    ]);
    const mc: Record<string, number> = {}; const ac: Record<string, number> = {};
    (msgs || []).forEach((m: any) => { mc[m.user_id] = (mc[m.user_id] || 0) + 1; });
    (acmts || []).forEach((m: any) => { ac[m.user_id] = (ac[m.user_id] || 0) + 1; });
    const list: Stat[] = (students || []).map((s: any) => ({
      id: s.id, display_name: s.display_name, grade: gradeMap[s.id] || "", points: s.points || 0,
      activities: 0, comments: (mc[s.id] || 0) + (ac[s.id] || 0),
    })).sort((a, b) => b.points - a.points);
    setStats(list);
  };

  const searchStudentByName = async () => {
    if (!studentSearch.trim()) return;
    setSearching(true);
    const { data } = await supabase
      .from("profiles")
      .select("id, display_name")
      .ilike("display_name", `%${studentSearch.trim()}%`)
      .or("role_type.is.null,role_type.eq.student")
      .limit(15);
    setStudentResults((data || []) as any);
    setSearching(false);
  };

  const addStudentById = async (studentId: string, displayName: string | null) => {
    if (!teacherId) return;
    setAdding(true);
    const { error } = await supabase
      .from("profiles")
      .update({ teacher_id: teacherId })
      .eq("id", studentId);
    setAdding(false);
    if (error) { toast.error("فشل إضافة الطالب"); return; }
    toast.success(`تمت إضافة ${displayName || "الطالب"} لفصلك ✅`);
    setStudentSearch("");
    setStudentResults([]);
    await loadStudents(teacherId, classCode);
  };


  if (loading) return <FullPageLoader />;
  if (!allowed) return (
    <div dir="rtl" className="min-h-screen flex flex-col items-center justify-center gap-3 text-center px-4">
      <p className="text-muted-foreground">هذه الصفحة للمعلم/المشرف فقط</p>
      <Link to="/" className="text-[var(--brand)] font-bold">العودة</Link>
    </div>
  );

  const totalPoints = stats.reduce((s, x) => s + x.points, 0);
  const totalComments = stats.reduce((s, x) => s + x.comments, 0);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white">
              <GraduationCap className="h-5 w-5" />
            </div>
            <h1 className="font-bold">لوحة المعلم</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="bg-card rounded-3xl border border-border p-5 mb-6 grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-muted-foreground mb-1">كود فصلك (شاركيه مع طلابك)</div>
            <div className="flex items-center gap-2">
              <code className="px-4 py-2 rounded-xl bg-secondary font-black text-2xl tracking-widest">{classCode || "—"}</code>
              {classCode && (
                <>
                  <button onClick={async () => { const ok = await copyToClipboard(classCode); toast[ok ? "success" : "error"](ok ? "تم النسخ ✅" : "فشل النسخ، انسخ الكود يدوياً"); }}
                    className="p-2 rounded-lg hover:bg-secondary" title="نسخ الكود"><Copy className="h-4 w-4" /></button>
                  <QRModal code={classCode} />
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">الطالب يدخل هذا الكود في صفحة ملفه ليلتحق بفصلك</p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">إضافة طالب يدوياً بالاسم</div>
            <div className="flex gap-2">
              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && searchStudentByName()}
                placeholder="ابحث باسم الطالب..."
                className="flex-1 px-3 py-2 rounded-xl border border-border bg-background"
              />
              <button onClick={searchStudentByName} disabled={searching}
                className="px-4 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold inline-flex items-center gap-1 disabled:opacity-50">
                <Search className="h-4 w-4" /> بحث
              </button>
            </div>
            {studentResults.length > 0 && (
              <div className="mt-2 space-y-1 max-h-44 overflow-y-auto rounded-xl border border-border bg-background p-1">
                {studentResults.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => addStudentById(s.id, s.display_name)}
                    disabled={adding}
                    className="w-full text-right px-3 py-2 rounded-lg hover:bg-secondary flex items-center gap-2 disabled:opacity-50 transition"
                  >
                    <div className="h-8 w-8 rounded-full bg-[image:var(--gradient-warm)] flex items-center justify-center text-white font-bold text-sm shrink-0">
                      {(s.display_name || "ط").charAt(0)}
                    </div>
                    <span className="text-sm font-bold flex-1">{s.display_name || "بدون اسم"}</span>
                    <UserPlus className="h-4 w-4 text-[var(--brand)] shrink-0" />
                  </button>
                ))}
              </div>
            )}
            {studentSearch && studentResults.length === 0 && !searching && (
              <p className="text-xs text-muted-foreground mt-1">اضغط بحث للعثور على الطالب</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard icon={Users} label="طلاب فصلي" value={toAr(stats.length)} color="from-blue-500 to-cyan-500" />
          <StatCard icon={FileText} label="إجمالي النقاط" value={toAr(totalPoints)} color="from-amber-500 to-orange-500" />
          <StatCard icon={MessageSquare} label="إجمالي التعليقات" value={toAr(totalComments)} color="from-pink-500 to-rose-500" />
        </div>

        {stats.length > 0 && (
          <div className="mb-6 rounded-3xl overflow-hidden border border-border" style={{ background: "linear-gradient(135deg, #1e1b4b 0%, #312e81 40%, #4c1d95 100%)" }}>
            <div className="p-5">
              <div className="font-bold mb-1 text-white text-lg">🏆 أعلى 10 طلاب نشاطاً</div>
              <div className="text-xs text-indigo-200 mb-4">مرتبون حسب عدد النقاط</div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={stats.slice(0, 10).map((s) => ({ name: (s.display_name || "—").slice(0, 8), النقاط: s.points }))} margin={{ top: 4, right: 4, left: -10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a78bfa" />
                      <stop offset="100%" stopColor="#7c3aed" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#c4b5fd" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#c4b5fd" }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{ background: "#1e1b4b", border: "1px solid #4c1d95", borderRadius: 12, color: "#e9d5ff" }}
                    cursor={{ fill: "rgba(167,139,250,0.1)" }}
                  />
                  <Bar dataKey="النقاط" fill="url(#barGrad)" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="bg-card rounded-3xl border border-border overflow-hidden">
          <div className="p-4 font-bold border-b border-border flex items-center gap-2">
            <span>قائمة الطلاب</span>
            <span className="text-xs text-muted-foreground font-normal">({toAr(stats.length)} طالب)</span>
          </div>
          {stats.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground p-8">لا يوجد طلاب مسجلين بعد</div>
          ) : stats.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 p-4 border-b border-border last:border-0 hover:bg-secondary/30 transition">
              <div className="w-7 text-center font-black text-muted-foreground text-sm">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${toAr(i + 1)}`}
              </div>
              <div className="h-11 w-11 rounded-full flex items-center justify-center text-white font-black text-lg shrink-0"
                style={{ background: `hsl(${(i * 47) % 360} 70% 50%)` }}>
                {(s.display_name || "ط").charAt(0)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold text-sm truncate">{s.display_name || "بدون اسم"}</div>
                <div className="text-xs text-muted-foreground">{s.grade || "—"} • {s.comments} تعليق</div>
              </div>
              <div className="flex flex-col items-end gap-0.5">
                <div className="font-black text-[var(--brand)] text-base">{toAr(s.points)}</div>
                <div className="text-[10px] text-muted-foreground">نقطة</div>
              </div>
              <Link to="/messages" search={{ with: s.id }} className="text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 shrink-0">رسالة</Link>
            </div>
          ))}
        </div>

        {teacherId && <TrackingPanel teacherId={teacherId} />}
        {teacherId && <EssayGradingPanel teacherId={teacherId} />}
        {teacherId && <CertificatePanel teacherId={teacherId} />}
        {teacherId && <BadgeSection teacherId={teacherId} />}
        {teacherId && <StickerPanel teacherId={teacherId} students={stats} />}

      </main>
    </div>
  );
}

function BadgeSection({ teacherId }: { teacherId: string }) {
  const [refresh, setRefresh] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  return (
    <>
      <div className="mt-6 flex justify-center">
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold shadow-md hover:opacity-90 transition"
        >
          <Award className="h-4 w-4" />
          {showCreate ? "إخفاء إنشاء شارة" : "إضافة شارة جديدة ✨"}
        </button>
      </div>
      {showCreate && (
        <CreateBadgePanel onCreated={() => { setRefresh((r) => r + 1); setShowCreate(false); }} />
      )}
      <BadgeGrantPanel teacherId={teacherId} reloadKey={refresh} />
    </>
  );
}

// ─────────────────────────────────────────────
// لوحة متابعة إنجاز الطلاب (واجبات + اختبارات)
// ─────────────────────────────────────────────
function TrackingPanel({ teacherId }: { teacherId: string }) {
  const [tab, setTab] = useState<"assignments" | "quizzes">("assignments");
  const [loading, setLoading] = useState(true);
  const [studentCount, setStudentCount] = useState(0);
  const [assignments, setAssignments] = useState<{ id: string; title: string; submitted: number; total: number }[]>([]);
  const [quizzes, setQuizzes] = useState<{ id: string; title: string; completed: number; total: number }[]>([]);

  useEffect(() => {
    (async () => {
      setLoading(true);

      // 1. طلاب المعلم
      const { data: students } = await supabase
        .from("profiles").select("id").eq("teacher_id", teacherId);
      const studentIds = (students || []).map((s: any) => s.id);
      setStudentCount(studentIds.length);

      if (studentIds.length === 0) { setLoading(false); return; }

      // 2. واجبات المعلم مع عدد تسليمات طلابه
      const { data: asgns } = await supabase
        .from("assignments").select("id, title").eq("teacher_id", teacherId);
      if (asgns && asgns.length > 0) {
        const aIds = asgns.map((a: any) => a.id);
        const { data: subs } = await supabase
          .from("assignment_submissions")
          .select("assignment_id, student_id")
          .in("assignment_id", aIds)
          .in("student_id", studentIds);
        const countMap: Record<string, Set<string>> = {};
        (subs || []).forEach((s: any) => {
          if (!countMap[s.assignment_id]) countMap[s.assignment_id] = new Set();
          countMap[s.assignment_id].add(s.student_id);
        });
        setAssignments(asgns.map((a: any) => ({
          id: a.id, title: a.title,
          submitted: countMap[a.id]?.size || 0,
          total: studentIds.length,
        })));
      }

      // 3. اختبارات المعلم مع عدد محاولات طلابه
      const { data: qzs } = await supabase
        .from("quizzes").select("id, title").eq("created_by", teacherId);
      if (qzs && qzs.length > 0) {
        const qIds = qzs.map((q: any) => q.id);
        const { data: attempts } = await supabase
          .from("quiz_attempts")
          .select("quiz_id, user_id")
          .in("quiz_id", qIds)
          .in("user_id", studentIds);
        const qCountMap: Record<string, Set<string>> = {};
        (attempts || []).forEach((a: any) => {
          if (!qCountMap[a.quiz_id]) qCountMap[a.quiz_id] = new Set();
          qCountMap[a.quiz_id].add(a.user_id);
        });
        setQuizzes(qzs.map((q: any) => ({
          id: q.id, title: q.title,
          completed: qCountMap[q.id]?.size || 0,
          total: studentIds.length,
        })));
      }

      setLoading(false);
    })();
  }, [teacherId]);

  const items = tab === "assignments" ? assignments : quizzes;

  return (
    <div className="bg-card rounded-3xl border border-border p-5 mt-6">
      <div className="font-bold mb-4 flex items-center gap-2">
        <TrendingUp className="h-5 w-5 text-emerald-600" />
        متابعة إنجاز الطلاب
        <span className="text-xs font-normal text-muted-foreground mr-auto">{toAr(studentCount)} طالب مرتبط</span>
      </div>

      {/* تبويبات */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setTab("assignments")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition ${tab === "assignments" ? "bg-[image:var(--gradient-hero)] text-white" : "bg-secondary hover:bg-secondary/80"}`}
        >
          <ClipboardList className="h-4 w-4" /> الواجبات
        </button>
        <button
          onClick={() => setTab("quizzes")}
          className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold transition ${tab === "quizzes" ? "bg-[image:var(--gradient-hero)] text-white" : "bg-secondary hover:bg-secondary/80"}`}
        >
          <BookOpen className="h-4 w-4" /> الاختبارات
        </button>
      </div>

      {loading ? (
        <div className="text-sm text-muted-foreground py-4 text-center">جاري التحميل...</div>
      ) : studentCount === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">لا يوجد طلاب مرتبطون بك بعد</div>
      ) : items.length === 0 ? (
        <div className="text-sm text-muted-foreground py-4 text-center">
          {tab === "assignments" ? "لم تنشئ واجبات بعد" : "لم تنشئ اختبارات بعد"}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const pct = item.total > 0 ? Math.round((item.completed ?? item.submitted ?? 0) / item.total * 100) : 0;
            const done = item.completed ?? item.submitted ?? 0;
            const full = pct === 100;
            return (
              <div key={item.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-bold truncate flex-1">{item.title}</span>
                  <span className={`text-xs font-black shrink-0 flex items-center gap-1 ${full ? "text-emerald-600" : "text-amber-600"}`}>
                    {full ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                    {toAr(done)}/{toAr(item.total)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${full ? "bg-emerald-500" : "bg-amber-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-[10px] text-muted-foreground text-left">{toAr(pct)}٪ من الطلاب {tab === "assignments" ? "سلّموا" : "أكملوا"}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function EssayGradingPanel({ teacherId }: { teacherId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [grades, setGrades] = useState<Record<string, Record<number, number>>>({});

  const load = async () => {
    setLoading(true);
    const { data: quizzes } = await supabase.from("quizzes").select("id, title").eq("created_by", teacherId);
    const ids = (quizzes || []).map((q) => q.id);
    if (!ids.length) { setItems([]); setLoading(false); return; }
    const { data: attempts } = await supabase
      .from("quiz_attempts").select("id, quiz_id, user_id, score, total, details, created_at")
      .in("quiz_id", ids).order("created_at", { ascending: false });
    const userIds = Array.from(new Set((attempts || []).map((a: any) => a.user_id)));
    const { data: profs } = userIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
      : { data: [] as any[] };
    const nameMap: Record<string, string> = {};
    (profs || []).forEach((p: any) => { nameMap[p.id] = p.display_name || "—"; });
    const titleMap: Record<string, string> = {};
    (quizzes || []).forEach((q: any) => { titleMap[q.id] = q.title; });
    const list = (attempts || [])
      .map((a: any) => ({ ...a, student: nameMap[a.user_id], quizTitle: titleMap[a.quiz_id] }))
      .filter((a: any) => Array.isArray(a.details)
        && a.details.some((d: any) => d?.type === "essay" && (d.points === null || d.points === undefined)));
    setItems(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, [teacherId]);

  const saveGrade = async (a: any) => {
    const g = grades[a.id] || {};
    const newDetails = (a.details as any[]).map((d: any) => {
      if (d?.type !== "essay") return d;
      const pts = g[d.i];
      if (pts === undefined || isNaN(pts)) return d;
      return { ...d, points: Math.max(0, Math.min(1, Number(pts))) };
    });
    const essayPoints = newDetails.filter((d: any) => d?.type === "essay").reduce((s: number, d: any) => s + (Number(d.points) || 0), 0);
    const mcPoints = newDetails.filter((d: any) => d?.type !== "essay").reduce((s: number, d: any) => s + (Number(d.points) || 0), 0);
    const newScore = mcPoints + essayPoints;
    const newTotal = newDetails.length;
    const { error } = await supabase.from("quiz_attempts")
      .update({ details: newDetails as any, score: Math.round(newScore), total: newTotal })
      .eq("id", a.id);
    if (error) { toast.error("تعذّر حفظ الدرجة"); return; }
    toast.success(`تم الحفظ — الدرجة الجديدة ${Math.round(newScore)}/${newTotal}`);
    // إشعار الطالب بتصحيح إجاباته المقالية
    await supabase.from("notifications").insert({
      user_id: a.user_id,
      title: "تم تصحيح اختبارك 📝",
      body: `تم تصحيح إجاباتك المقالية في اختبار "${a.quizTitle}" — درجتك: ${Math.round(newScore)}/${newTotal}`,
      type: "quiz",
    });
    await load();
  };

  return (
    <div className="bg-card rounded-3xl border border-border p-5 mt-6">
      <div className="font-bold mb-3 flex items-center gap-2"><FileText className="h-5 w-5 text-violet-600" /> تصحيح الأسئلة المقالية</div>
      {loading ? <div className="text-sm text-muted-foreground">جاري التحميل...</div>
        : items.length === 0 ? <div className="text-sm text-muted-foreground">لا توجد محاولات بأسئلة مقالية.</div>
        : (
          <div className="space-y-4">
            {items.map((a) => (
              <div key={a.id} className="border border-border rounded-2xl p-4">
                <div className="flex justify-between items-center mb-2">
                  <div className="font-semibold text-sm">{a.student} — {a.quizTitle}</div>
                  <div className="text-xs text-muted-foreground">الدرجة الحالية: {toAr(a.score)}/{toAr(a.total)}</div>
                </div>
                <div className="space-y-2">
                  {(a.details as any[]).filter((d: any) => d?.type === "essay").map((d: any) => (
                    <div key={d.i} className="bg-secondary/30 rounded-xl p-3">
                      <div className="text-sm font-bold mb-1">{toAr(d.i + 1)}. {d.question}</div>
                      <div className="text-sm bg-background p-2 rounded mb-2 whitespace-pre-wrap">
                        {d.essay ? (() => {
                          const parts = (d.essay as string).split(/\n📎 /);
                          const text = parts[0];
                          const fileUrl = parts[1]?.trim();
                          return (<>
                            {text && <span>{text}</span>}
                            {fileUrl && (
                              <a href={fileUrl} target="_blank" rel="noreferrer"
                                className="mt-1 flex items-center gap-1.5 text-[var(--brand)] font-bold hover:underline text-xs">
                                📎 مرفق الطالب — اضغط للعرض
                              </a>
                            )}
                          </>);
                        })() : <span className="text-muted-foreground">لا توجد إجابة</span>}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">الدرجة (0 أو 1):</span>
                        <input type="number" min={0} max={1} step={1}
                          defaultValue={d.points ?? ""}
                          onChange={(e) => setGrades((g) => ({ ...g, [a.id]: { ...(g[a.id] || {}), [d.i]: Number(e.target.value) } }))}
                          className="w-20 px-2 py-1 rounded-lg border border-border bg-background text-sm" />
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => saveGrade(a)} className="mt-3 px-4 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold text-sm">حفظ الدرجات</button>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

const CERT_TEMPLATES = [
  { label: "🏆 التميز في الرياضيات", title: "شهادة تميز في الرياضيات", body: "نشهد بأن الطالب/ة حقق/ت أداءً متميزاً في مادة الرياضيات خلال هذه الوحدة الدراسية، ونثمّن جهوده/ا المتواصلة وحبه/ا للتعلم." },
  { label: "🌟 المشاركة الفاعلة", title: "شهادة المشاركة الفاعلة", body: "نشهد بأن الطالب/ة أبدى/ت مشاركةً فاعلة وتفاعلاً إيجابياً في الأنشطة التعليمية، مما يدل على روح التعاون والحماس نحو التعلم." },
  { label: "📈 التحسن الملحوظ", title: "شهادة التحسن والتقدم", body: "نشهد بأن الطالب/ة أظهر/ت تحسناً ملحوظاً في مستواه/ا الدراسي، ونُشجعه/ا على مواصلة هذا التقدم المتميز." },
  { label: "💡 الإبداع والتفكير", title: "شهادة الإبداع والتفكير الناقد", body: "نشهد بأن الطالب/ة برز/ت بأفكاره/ا الإبداعية وتميّز/ت في حل المسائل الرياضية بأساليب مبتكرة تدل على عمق التفكير." },
  { label: "✅ الالتزام والانضباط", title: "شهادة الالتزام والمثابرة", body: "نشهد بأن الطالب/ة يتحلى/تتحلى بالالتزام والانضباط في أداء الواجبات والمهام المدرسية، ويُضرب به/ا المثل في الجدية والمثابرة." },
  { label: "🥇 الأول على الفصل", title: "شهادة المركز الأول", body: "نشهد بأن الطالب/ة حقق/ت المركز الأول على فصله/ا في مادة الرياضيات، ونُهنئه/ا على هذا التفوق المستحق ونتمنى له/ا دوام النجاح." },
];

function CertificatePanel({ teacherId }: { teacherId: string }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; display_name: string | null; avatar_url: string | null }[]>([]);
  const [target, setTarget] = useState<{ id: string; display_name: string | null } | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [imgFile, setImgFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [selectedTheme, setSelectedTheme] = useState<CertTheme>(CERT_THEMES[0]);
  const [selectedFont, setSelectedFont] = useState<CertFont>(CERT_FONTS[0]);
  const [showCustomizer, setShowCustomizer] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    const { data } = await supabase.from("profiles")
      .select("id, display_name, avatar_url")
      .ilike("display_name", `%${q.trim()}%`).limit(20);
    setResults((data || []) as any);
  };

  const send = async () => {
    if (!target || !title.trim()) { toast.error("اختر مستخدماً واكتب عنوان الشهادة"); return; }
    setSending(true);
    try {
      let image_url: string | null = null;
      if (imgFile) {
        const ext = imgFile.name.split(".").pop();
        const path = `${teacherId}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("certificates").upload(path, imgFile);
        if (upErr) throw upErr;
        image_url = supabase.storage.from("certificates").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("certificates").insert({
        teacher_id: teacherId, student_id: target.id,
        title: title.trim(), body: body.trim() || null, image_url,
        bg: `theme:${selectedTheme.id}|font:${selectedFont.family}`,
      });
      if (error) throw error;
      toast.success("تم إرسال الشهادة 🎖️");
      setTitle(""); setBody(""); setImgFile(null); setTarget(null); setResults([]); setQ("");
      setSelectedTheme(CERT_THEMES[0]); setSelectedFont(CERT_FONTS[0]);
    } catch (e: any) {
      toast.error(e.message || "فشل الإرسال");
    } finally { setSending(false); }
  };

  return (
    <div className="bg-card rounded-3xl border border-border p-5 mt-6">
      <h3 className="font-bold mb-3 flex items-center gap-2"><Award className="h-5 w-5 text-amber-500" /> إرسال شهادة تقدير</h3>
      {!target ? (
        <>
          <div className="flex gap-2 mb-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="ابحث باسم المستخدم (طالب/معلم)..." className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background" />
            <button onClick={search} className="px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 inline-flex items-center gap-1">
              <Search className="h-4 w-4" /> بحث
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
            {results.map((r) => (
              <button key={r.id} onClick={() => setTarget(r)} className="text-right p-3 rounded-xl border border-border hover:bg-secondary flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-[image:var(--gradient-warm)] flex items-center justify-center text-white font-bold">
                  {(r.display_name || "؟").charAt(0)}
                </div>
                <div className="font-semibold text-sm">{r.display_name || "بدون اسم"}</div>
              </button>
            ))}
            {q && results.length === 0 && <div className="text-sm text-muted-foreground text-center py-3 col-span-2">لا توجد نتائج</div>}
          </div>
        </>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-2 rounded-xl bg-secondary">
            <div className="text-sm">إلى: <b>{target.display_name}</b></div>
            <button onClick={() => setTarget(null)} className="text-xs text-destructive">تغيير</button>
          </div>

          {/* قوالب جاهزة */}
          <div>
            <div className="text-xs text-muted-foreground mb-2 font-bold">اختر قالباً جاهزاً (يمكنك التعديل بعد الاختيار):</div>
            <div className="flex flex-wrap gap-2">
              {CERT_TEMPLATES.map((t) => (
                <button key={t.title} type="button"
                  onClick={() => { setTitle(t.title); setBody(t.body); }}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${title === t.title ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]" : "border-border bg-background hover:bg-secondary"}`}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الشهادة (مثال: التميز في الرياضيات)"
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-background" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="نص الشهادة (اختياري)" rows={3}
            className="w-full px-4 py-2.5 rounded-xl border border-border bg-background resize-none" />

          {/* ── زر تعديل الشهادة (toggle) ── */}
          <div className="flex justify-start">
            <button
              type="button"
              onClick={() => setShowCustomizer((v) => !v)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${showCustomizer ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]" : "border-border hover:bg-secondary"}`}
            >
              <Palette className="h-3.5 w-3.5" /> {showCustomizer ? "إخفاء تخصيص الشهادة" : "تعديل الشهادة (اللون والخط)"}
            </button>
          </div>

          {showCustomizer && (
            <>
              {/* ── منتقي الثيم ── */}
              <div>
                <div className="text-xs font-bold mb-2 flex items-center gap-1.5"><Palette className="h-3.5 w-3.5 text-[var(--brand)]" /> لون الشهادة</div>
                <div className="grid grid-cols-6 gap-2">
                  {CERT_THEMES.map((t) => (
                    <button key={t.id} type="button" onClick={() => setSelectedTheme(t)}
                      title={t.label}
                      className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition ${selectedTheme.id === t.id ? "border-[var(--brand)] shadow-md" : "border-border hover:border-[var(--brand)]/50"}`}>
                      <div className="w-8 h-8 rounded-lg shadow-sm border border-white/20"
                        style={{ background: `linear-gradient(135deg, ${t.bg1}, ${t.border1})` }} />
                      <span className="text-[9px] font-bold text-center leading-tight line-clamp-2">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* ── منتقي الخط ── */}
              <div>
                <div className="text-xs font-bold mb-2 flex items-center gap-1.5"><TypeIcon className="h-3.5 w-3.5 text-[var(--brand)]" /> الخط</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {CERT_FONTS.map((f) => (
                    <button key={f.family} type="button" onClick={() => setSelectedFont(f)}
                      style={{ fontFamily: `"${f.family}", Tajawal, sans-serif` }}
                      className={`px-2 py-1.5 rounded-xl border-2 text-xs text-center transition ${selectedFont.family === f.family ? "border-[var(--brand)] bg-[var(--brand)]/10 font-bold" : "border-border hover:border-[var(--brand)]/40"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* ── معاينة حية ── */}
              <div>
                <div className="text-xs font-bold mb-2 text-muted-foreground">معاينة الشهادة:</div>
                <div
                  className="rounded-2xl border-4 p-5 text-center relative overflow-hidden shadow-md"
                  style={{
                    background: `linear-gradient(135deg, ${selectedTheme.bg1}, ${selectedTheme.bg2})`,
                    borderColor: selectedTheme.border1,
                    fontFamily: `"${selectedFont.family}", Tajawal, sans-serif`,
                  }}
                >
                  <div className="text-3xl mb-2">🏆</div>
                  <div className="text-xs font-black mb-1" style={{ color: selectedTheme.title }}>شهادة تقدير</div>
                  <div className="text-base font-black mb-1" style={{ color: selectedTheme.name }}>
                    {target.display_name || "اسم المستخدم"}
                  </div>
                  {title && <div className="text-sm font-bold mb-1" style={{ color: selectedTheme.title }}>{title}</div>}
                  {body && <p className="text-[11px] leading-relaxed" style={{ color: selectedTheme.body }}>{body}</p>}
                  <div className="text-[10px] mt-2 opacity-70" style={{ color: selectedTheme.body }}>مبادرة كلنا معاً – محافظة الوسطى</div>
                </div>
              </div>
            </>
          )}

          <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-sm">
            📷 {imgFile ? imgFile.name : "إرفاق صورة (اختياري)"}
            <input type="file" accept="image/*" onChange={(e) => setImgFile(e.target.files?.[0] || null)} className="hidden" />
          </label>
          <button onClick={send} disabled={sending || !title.trim()}
            className="w-full px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
            {sending ? "جاري الإرسال..." : "إرسال الشهادة 🎖️"}
          </button>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: any) {
  return (
    <div className="bg-card rounded-2xl border border-border p-5 flex items-center gap-4">
      <div className={`h-12 w-12 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center text-white`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-2xl font-black">{value}</div>
      </div>
    </div>
  );
}


function BadgeGrantPanel({ teacherId: _teacherId, reloadKey }: { teacherId: string; reloadKey?: number }) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ id: string; display_name: string | null; role_type: string | null }[]>([]);
  const [target, setTarget] = useState<{ id: string; display_name: string | null; role_type: string | null } | null>(null);
  const [sending, setSending] = useState<string | null>(null);
  const [allBadges, setAllBadges] = useState<{ id: string; name: string; icon: string; audience: string }[]>([]);

  useEffect(() => {
    supabase.from("badges").select("id, name, icon, audience").then(({ data, error }) => {
      if (error) toast.error("تعذّر تحديث قائمة الشارات: " + error.message);
      else setAllBadges((data || []) as any);
    });
  }, [reloadKey]);

  const search = async () => {
    if (!q.trim()) return;
    const { data } = await supabase.from("profiles").select("id, display_name, role_type").ilike("display_name", `%${q.trim()}%`).limit(20);
    setResults((data || []) as any);
  };

  const grant = async (badge_id: string) => {
    if (!target) return;
    setSending(badge_id);
    const { data: sess } = await supabase.auth.getSession();
    const granter = sess.session?.user.id || null;
    const { error } = await supabase.from("user_badges").insert({ user_id: target.id, badge_id, awarded_by: granter });
    setSending(null);
    if (error) {
      const msg = error.message || "";
      if (msg.includes("duplicate")) toast.error("المستخدم يملك هذه الشارة بالفعل");
      else toast.error("تعذّر منح الشارة: " + msg);
      return;
    }
    toast.success("تم منح الشارة 🏅 (يمكنك منحها مرة أخرى لزيادة العدّاد)");
  };

  const targetAudience = target?.role_type === "teacher" || target?.role_type === "supervisor" ? "teacher" : "student";
  const visibleBadges = allBadges.filter(b => b.audience === targetAudience);

  return (
    <div className="bg-card rounded-3xl border border-border p-5 mt-6">
      <h3 className="font-bold mb-3 flex items-center gap-2"><Award className="h-5 w-5 text-violet-500" /> منح شارات التميز</h3>
      {!target ? (
        <>
          <div className="flex gap-2 mb-3">
            <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()}
              placeholder="ابحث باسم المستخدم..." className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background" />
            <button onClick={search} className="px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 inline-flex items-center gap-1">
              <Search className="h-4 w-4" /> بحث
            </button>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto">
            {results.map((r) => (
              <button key={r.id} onClick={() => setTarget(r)} className="text-right p-3 rounded-xl border border-border hover:bg-secondary flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-[image:var(--gradient-warm)] flex items-center justify-center text-white font-bold">
                  {(r.display_name || "؟").charAt(0)}
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">{r.display_name || "بدون اسم"}</div>
                  <div className="text-[10px] text-muted-foreground">{r.role_type === "teacher" || r.role_type === "supervisor" ? "معلم" : "طالب"}</div>
                </div>
              </button>
            ))}
            {q && results.length === 0 && <div className="text-sm text-muted-foreground text-center py-3 col-span-2">لا توجد نتائج</div>}
          </div>
        </>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-2 rounded-xl bg-secondary">
            <div className="text-sm">إلى: <b>{target.display_name}</b> <span className="text-[10px] text-muted-foreground">({targetAudience === "teacher" ? "معلم" : "طالب"})</span></div>
            <button onClick={() => setTarget(null)} className="text-xs text-destructive">تغيير</button>
          </div>
          <div className="text-xs text-muted-foreground">
            {targetAudience === "teacher" ? "شارات خاصة بالمعلمين:" : "شارات خاصة بالطلاب:"}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {visibleBadges.map((b) => (
              <button key={b.id} onClick={() => grant(b.id)} disabled={sending === b.id}
                className="p-3 rounded-xl border-2 border-border hover:border-[var(--brand)] bg-background text-center transition disabled:opacity-50">
                <div className="text-3xl mb-1">{b.icon}</div>
                <div className="text-xs font-bold">{b.name}</div>
              </button>
            ))}
            {visibleBadges.length === 0 && (
              <div className="col-span-full text-center text-sm text-muted-foreground py-4">لا توجد شارات لهذه الفئة بعد</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const ICON_CHOICES = ["🏅","🥇","🥈","🥉","🌟","⭐","✨","🏆","🎖️","🎗️","👑","💎","🔥","⚡","🚀","🎯","🧠","📚","✏️","📝","🎨","🎵","🧮","➕","➖","✖️","➗","🔢","💯","🤝","🙋","💪","❤️","🌈","🌻","🦄","🐝","🦉","🌍","🛡️"];

function CreateBadgePanel({ onCreated }: { onCreated?: () => void }) {
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("🏅");
  const [description, setDescription] = useState("");
  const [audience, setAudience] = useState<"student" | "teacher">("student");
  const [color, setColor] = useState("amber");
  const [saving, setSaving] = useState(false);

  const create = async () => {
    if (!name.trim()) { toast.error("اكتبي اسم الشارة"); return; }
    setSaving(true);
    // Generate a unique slug-like id
    const id = `custom_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const { data, error } = await supabase.from("badges").insert({
      id, name: name.trim(), icon, description: description.trim() || null, audience, color,
    }).select("id").maybeSingle();
    setSaving(false);
    if (error) { toast.error("تعذّر إنشاء الشارة: " + error.message); return; }
    if (!data) { toast.error("تم الحفظ لكن القائمة لم تتحدث، حدّثي الصفحة مرة واحدة"); return; }
    toast.success("تم إنشاء الشارة 🎉 ظهرت الآن في قائمة الاختيار بالأسفل");
    setName(""); setDescription(""); setIcon("🏅");
    onCreated?.();
  };

  return (
    <div className="bg-card rounded-3xl border border-border p-5 mt-6">
      <h3 className="font-bold mb-3 flex items-center gap-2"><Award className="h-5 w-5 text-rose-500" /> إنشاء شارة جديدة باسم وأيقونة</h3>
      <div className="grid sm:grid-cols-2 gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="اسم الشارة (مثال: نجم الرياضيات)"
          className="px-4 py-2.5 rounded-xl border border-border bg-background" />
        <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="وصف مختصر (اختياري)"
          className="px-4 py-2.5 rounded-xl border border-border bg-background" />
        <select value={audience} onChange={(e) => setAudience(e.target.value as any)} className="px-4 py-2.5 rounded-xl border border-border bg-background">
          <option value="student">شارة للطلاب</option>
          <option value="teacher">شارة للمعلمين</option>
        </select>
        <select value={color} onChange={(e) => setColor(e.target.value)} className="px-4 py-2.5 rounded-xl border border-border bg-background">
          <option value="amber">ذهبي</option>
          <option value="emerald">أخضر</option>
          <option value="rose">وردي</option>
          <option value="violet">بنفسجي</option>
          <option value="cyan">سماوي</option>
        </select>
      </div>
      <div className="text-xs text-muted-foreground mt-3 mb-2">اختاري أيقونة الشارة:</div>
      <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto p-2 rounded-xl border border-border bg-background">
        {ICON_CHOICES.map((ic) => (
          <button key={ic} onClick={() => setIcon(ic)} type="button"
            className={`text-2xl h-10 w-10 rounded-lg flex items-center justify-center transition ${icon === ic ? "bg-[var(--brand)]/15 ring-2 ring-[var(--brand)]" : "hover:bg-secondary"}`}>
            {ic}
          </button>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="rounded-2xl border-2 border-violet-200 bg-gradient-to-br from-violet-50 via-fuchsia-50 to-pink-50 p-3 text-center min-w-[120px]">
          <div className="text-3xl mb-1">{icon}</div>
          <div className="text-xs font-black">{name || "معاينة"}</div>
        </div>
        <button onClick={create} disabled={saving || !name.trim()}
          className="flex-1 px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
          {saving ? "جاري الحفظ..." : "إنشاء الشارة"}
        </button>
      </div>
    </div>
  );
}

// ── ملصقات المعلم ─────────────────────────────────────────────────────────────
type Recipient = { id: string; name: string; type: "student" | "teacher" };

function StickerPanel({ teacherId, students }: { teacherId: string; students: Stat[] }) {
  const [open, setOpen] = useState(false);
  const [selectedRecipient, setSelectedRecipient] = useState("");
  const [recipientSearch, setRecipientSearch] = useState("");
  const [showRecipientDrop, setShowRecipientDrop] = useState(false);
  const [teachers, setTeachers] = useState<Recipient[]>([]);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<any[]>([]);
  const [loadingSent, setLoadingSent] = useState(false);
  const [sentSearch, setSentSearch] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.from("profiles").select("id, display_name, role_type")
      .in("role_type", ["teacher", "supervisor", "admin"])
      .neq("id", teacherId)
      .then(({ data }) => {
        setTeachers((data || []).map((p: any) => ({ id: p.id, name: p.display_name || "—", type: "teacher" as const })));
      });
  }, [teacherId]);

  const allRecipients: Recipient[] = [
    ...students.map((s) => ({ id: s.id, name: s.display_name || "بدون اسم", type: "student" as const })),
    ...teachers,
  ];

  const recipientLabel = (id: string) => {
    const r = allRecipients.find((r) => r.id === id);
    return r ? `${r.name} (${r.type === "student" ? "طالب" : "معلم"})` : "—";
  };

  const recipientTypeLabel = (id: string) => {
    const r = allRecipients.find((r) => r.id === id);
    return r?.type === "teacher" ? "معلم" : "طالب";
  };

  const loadSent = async () => {
    setLoadingSent(true);
    const { data } = await (supabase as any)
      .from("teacher_stickers")
      .select("id, student_id, image_url, title, message, created_at")
      .eq("teacher_id", teacherId)
      .order("created_at", { ascending: false })
      .limit(30);
    setSent(data || []);
    setLoadingSent(false);
  };

  useEffect(() => { if (open) loadSent(); }, [open]);

  const pickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("الصورة أكبر من 5 ميغا"); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  };

  const send = async () => {
    if (!selectedRecipient) { toast.error("اختاري المستلم أولاً"); return; }
    if (!title.trim()) { toast.error("اكتبي عنوان الملصق"); return; }
    if (!file) { toast.error("اختاري صورة الملصق"); return; }
    setSending(true);
    const ext = file.name.split(".").pop() || "png";
    const path = `stickers/${teacherId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("activity-files").upload(path, file, { upsert: true });
    if (upErr) { toast.error("تعذّر رفع الصورة: " + upErr.message); setSending(false); return; }
    const { data: urlData } = supabase.storage.from("activity-files").getPublicUrl(path);
    const image_url = urlData?.publicUrl || "";
    const { error: insErr } = await (supabase as any).from("teacher_stickers").insert({
      teacher_id: teacherId,
      student_id: selectedRecipient,
      image_url,
      title: title.trim(),
      message: message.trim(),
    });
    if (insErr) { toast.error("تعذّر إرسال الملصق: " + insErr.message); setSending(false); return; }
    const rType = recipientTypeLabel(selectedRecipient);
    toast.success(`✨ تم إرسال الملصق لل${rType}!`);
    setFile(null); setPreview(null); setTitle(""); setMessage(""); setSelectedRecipient("");
    setSending(false);
    await loadSent();
  };

  const deleteSticker = async (id: string) => {
    await (supabase as any).from("teacher_stickers").delete().eq("id", id);
    setSent((prev) => prev.filter((s: any) => s.id !== id));
    toast.success("تم حذف الملصق");
  };

  const filteredSent = sentSearch.trim()
    ? sent.filter((s: any) => (s.title || "").includes(sentSearch) || recipientLabel(s.student_id).includes(sentSearch))
    : sent;

  return (
    <div className="mt-6">
      <div className="flex justify-center">
        <button
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl text-white font-bold shadow-md hover:opacity-90 transition"
          style={{ background: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)" }}
        >
          <span className="text-lg">🌟</span>
          {open ? "إخفاء الملصقات" : "الملصقات ✨"}
        </button>
      </div>

      {open && (
        <div className="mt-4 space-y-4">
          {/* بطاقة الإرسال */}
          <div className="bg-card rounded-3xl border-2 border-amber-200 dark:border-amber-800 p-5 space-y-4"
            style={{ background: "linear-gradient(135deg, #fffbeb 0%, #fff7ed 100%)" }}>
            <div className="font-black text-lg flex items-center gap-2 text-amber-800 dark:text-amber-300">
              <span>🎖️</span> أرسل ملصق تشجيعي
            </div>

            {/* اختيار المستلم — بحث بالاسم */}
            <div className="relative">
              <label className="text-xs font-bold text-muted-foreground mb-1.5 block">ابحث باسم المستلم (طالب أو معلم)</label>
              {allRecipients.length === 0 ? (
                <p className="text-sm text-rose-600">لا يوجد مستلمون متاحون بعد</p>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground pointer-events-none" />
                    <input
                      value={selectedRecipient
                        ? (allRecipients.find((r) => r.id === selectedRecipient)?.name || "") +
                          " (" + (allRecipients.find((r) => r.id === selectedRecipient)?.type === "student" ? "طالب" : "معلم") + ")"
                        : recipientSearch}
                      onChange={(e) => {
                        setSelectedRecipient("");
                        setRecipientSearch(e.target.value);
                        setShowRecipientDrop(true);
                      }}
                      onFocus={() => { setShowRecipientDrop(true); if (selectedRecipient) setRecipientSearch(""); }}
                      placeholder="اكتبي اسم الطالب أو المعلم..."
                      className="w-full pr-9 pl-4 py-2.5 rounded-xl border-2 border-amber-200 bg-white/80 dark:bg-background focus:border-amber-400 outline-none"
                    />
                    {selectedRecipient && (
                      <button
                        onClick={() => { setSelectedRecipient(""); setRecipientSearch(""); setShowRecipientDrop(false); }}
                        className="absolute left-3 top-2.5 text-muted-foreground hover:text-foreground"
                      >✕</button>
                    )}
                  </div>
                  {showRecipientDrop && !selectedRecipient && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowRecipientDrop(false)} />
                      <div className="absolute z-20 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border-2 border-amber-200 bg-white dark:bg-card shadow-xl">
                        {(() => {
                          const q = recipientSearch.trim().toLowerCase();
                          const filtered = allRecipients.filter((r) =>
                            !q || r.name.toLowerCase().includes(q)
                          );
                          if (!filtered.length) return (
                            <p className="text-sm text-center text-muted-foreground py-4">لا توجد نتائج</p>
                          );
                          const studs = filtered.filter((r) => r.type === "student");
                          const tchrs = filtered.filter((r) => r.type === "teacher");
                          return (
                            <>
                              {studs.length > 0 && (
                                <>
                                  <div className="px-3 py-1 text-[10px] font-black text-amber-700 bg-amber-50 dark:bg-amber-950/30 sticky top-0">الطلاب</div>
                                  {studs.map((r) => (
                                    <button key={r.id} onMouseDown={() => { setSelectedRecipient(r.id); setShowRecipientDrop(false); setRecipientSearch(""); }}
                                      className="w-full text-right px-4 py-2 text-sm hover:bg-amber-50 dark:hover:bg-amber-900/20 flex items-center gap-2">
                                      <span className="text-xs bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 px-1.5 py-0.5 rounded font-bold">طالب</span>
                                      {r.name}
                                    </button>
                                  ))}
                                </>
                              )}
                              {tchrs.length > 0 && (
                                <>
                                  <div className="px-3 py-1 text-[10px] font-black text-emerald-700 bg-emerald-50 dark:bg-emerald-950/30 sticky top-0">المعلمون والمشرفون</div>
                                  {tchrs.map((r) => (
                                    <button key={r.id} onMouseDown={() => { setSelectedRecipient(r.id); setShowRecipientDrop(false); setRecipientSearch(""); }}
                                      className="w-full text-right px-4 py-2 text-sm hover:bg-emerald-50 dark:hover:bg-emerald-900/20 flex items-center gap-2">
                                      <span className="text-xs bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 rounded font-bold">معلم</span>
                                      {r.name}
                                    </button>
                                  ))}
                                </>
                              )}
                            </>
                          );
                        })()}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {/* عنوان الملصق */}
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1.5 block">عنوان الملصق</label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="مثال: أحسنت! 🌟 متميز في الرياضيات"
                className="w-full px-4 py-2.5 rounded-xl border-2 border-amber-200 bg-white/80 dark:bg-background focus:border-amber-400 outline-none"
              />
            </div>

            {/* رسالة اختيارية */}
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1.5 block">رسالة تشجيع (اختياري)</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="اكتبي كلمة تشجيع قصيرة..."
                rows={2}
                className="w-full px-4 py-2.5 rounded-xl border-2 border-amber-200 bg-white/80 dark:bg-background focus:border-amber-400 outline-none resize-none"
              />
            </div>

            {/* رفع صورة الملصق */}
            <div>
              <label className="text-xs font-bold text-muted-foreground mb-1.5 block">صورة الملصق</label>
              <input ref={fileRef} type="file" accept="image/*" onChange={pickFile} className="hidden" />
              {preview ? (
                <div className="relative inline-block">
                  <img src={preview} alt="preview"
                    className="h-36 w-36 object-cover rounded-2xl border-4 border-amber-300 shadow-lg" />
                  <button
                    onClick={() => { setFile(null); setPreview(null); if (fileRef.current) fileRef.current.value = ""; }}
                    className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-rose-500 text-white flex items-center justify-center text-xs shadow-md"
                  >✕</button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full flex items-center justify-center gap-3 px-5 py-5 rounded-2xl border-2 border-dashed border-amber-300 hover:border-amber-500 text-amber-700 hover:bg-amber-50 transition"
                >
                  <ImageIcon className="h-6 w-6" />
                  <div className="text-right">
                    <div className="text-sm font-bold">اضغطي لاختيار صورة الملصق</div>
                    <div className="text-[11px] opacity-70">PNG, JPG, GIF – حتى 5 ميغا</div>
                  </div>
                </button>
              )}
            </div>

            {/* زر الإرسال */}
            <button
              onClick={send}
              disabled={sending || !selectedRecipient || !title.trim() || !file}
              className="w-full inline-flex items-center justify-center gap-2 py-3.5 rounded-xl text-white font-bold text-base disabled:opacity-40 transition shadow-md"
              style={{ background: "linear-gradient(135deg, #f59e0b 0%, #f97316 100%)" }}
            >
              <Send className="h-5 w-5" />
              {sending ? "جاري الإرسال..." : "أرسل الملصق ✉️"}
            </button>
          </div>

          {/* الملصقات المرسلة */}
          <div className="bg-card rounded-3xl border border-border p-5">
            <div className="font-bold mb-3 flex items-center gap-2">
              <span>📋</span> الملصقات المرسلة سابقاً
              {loadingSent && <span className="text-xs text-muted-foreground font-normal">جاري التحميل...</span>}
            </div>
            {/* بحث في الملصقات */}
            {sent.length > 0 && (
              <div className="relative mb-4">
                <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
                <input
                  value={sentSearch}
                  onChange={(e) => setSentSearch(e.target.value)}
                  placeholder="بحث في الملصقات..."
                  className="w-full pr-9 pl-4 py-2 rounded-xl border border-border bg-background text-sm"
                />
              </div>
            )}
            {filteredSent.length === 0 && !loadingSent ? (
              <p className="text-sm text-center text-muted-foreground py-8">
                {sentSearch ? "لا توجد نتائج للبحث" : "لم ترسلي أي ملصقات بعد"}
              </p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {filteredSent.map((s: any) => {
                  const rType = recipientTypeLabel(s.student_id);
                  return (
                  <div key={s.id} className="relative rounded-2xl border border-border overflow-hidden group shadow-sm hover:shadow-md transition bg-card">
                    <img src={s.image_url} alt={s.title}
                      className="w-full h-28 object-cover bg-secondary" />
                    <div className="p-2.5">
                      <div className="font-bold text-xs truncate">{s.title}</div>
                      <div className="text-[10px] truncate mt-0.5 flex items-center gap-1">
                        <span className={`inline-block px-1.5 py-0.5 rounded-full font-bold ${rType === "معلم" ? "bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300"}`}>
                          {rType}
                        </span>
                        <span className="text-muted-foreground truncate">{recipientLabel(s.student_id).split(" (")[0]}</span>
                      </div>
                      {s.message && (
                        <div className="text-[10px] text-muted-foreground mt-1 line-clamp-2 italic">
                          "{s.message}"
                        </div>
                      )}
                      <div className="text-[9px] text-muted-foreground/60 mt-1">
                        {new Date(s.created_at).toLocaleDateString("ar-EG")}
                      </div>
                    </div>
                    <button
                      onClick={() => deleteSticker(s.id)}
                      className="absolute top-1.5 left-1.5 h-6 w-6 rounded-full bg-rose-600 text-white hidden group-hover:flex items-center justify-center shadow-md"
                      title="حذف"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}