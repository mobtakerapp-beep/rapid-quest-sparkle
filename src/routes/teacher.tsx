import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, GraduationCap, Users, FileText, MessageSquare, Copy, UserPlus, Award, Search, Palette, Type as TypeIcon } from "lucide-react";
import { CERT_THEMES, CERT_FONTS, type CertTheme, type CertFont } from "@/lib/certThemes";
import { FullPageLoader } from "@/components/LoadingSpinner";
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from "recharts";
import { toast } from "sonner";

export const Route = createFileRoute("/teacher")({ component: TeacherDashboard });

type Stat = { id: string; display_name: string | null; grade: string | null; points: number; activities: number; comments: number };

function TeacherDashboard() {
  const [classCode, setClassCode] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [studentEmail, setStudentEmail] = useState("");
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

  const addStudent = async () => {
    if (!studentEmail.trim()) { toast.error("اكتبي بريد الطالب"); return; }
    setAdding(true);
    const { data, error } = await supabase.rpc("add_student_by_email", { _email: studentEmail.trim() });
    setAdding(false);
    if (error || !data) { toast.error("لم يتم العثور على طالب بهذا البريد"); return; }
    toast.success("تمت إضافة الطالب لفصلك");
    setStudentEmail("");
    if (teacherId) await loadStudents(teacherId);
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
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> الرئيسية
          </Link>
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
                <button onClick={() => { navigator.clipboard.writeText(classCode); toast.success("تم النسخ"); }}
                  className="p-2 rounded-lg hover:bg-secondary"><Copy className="h-4 w-4" /></button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-2">الطالب يدخل هذا الكود في صفحة ملفه ليلتحق بفصلك</p>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">إضافة طالب يدوياً بالبريد</div>
            <div className="flex gap-2">
              <input value={studentEmail} onChange={(e) => setStudentEmail(e.target.value)}
                placeholder="student@email.com" className="flex-1 px-3 py-2 rounded-xl border border-border bg-background" />
              <button onClick={addStudent} disabled={adding}
                className="px-4 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold inline-flex items-center gap-1 disabled:opacity-50">
                <UserPlus className="h-4 w-4" /> إضافة
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <StatCard icon={Users} label="طلاب فصلي" value={stats.length} color="from-blue-500 to-cyan-500" />
          <StatCard icon={FileText} label="إجمالي النقاط" value={totalPoints} color="from-amber-500 to-orange-500" />
          <StatCard icon={MessageSquare} label="إجمالي التعليقات" value={totalComments} color="from-pink-500 to-rose-500" />
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
            <span className="text-xs text-muted-foreground font-normal">({stats.length} طالب)</span>
          </div>
          {stats.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground p-8">لا يوجد طلاب مسجلين بعد</div>
          ) : stats.map((s, i) => (
            <div key={s.id} className="flex items-center gap-3 p-4 border-b border-border last:border-0 hover:bg-secondary/30 transition">
              <div className="w-7 text-center font-black text-muted-foreground text-sm">
                {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : `#${i + 1}`}
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
                <div className="font-black text-[var(--brand)] text-base">{s.points}</div>
                <div className="text-[10px] text-muted-foreground">نقطة</div>
              </div>
              <Link to="/messages" search={{ with: s.id }} className="text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 shrink-0">رسالة</Link>
            </div>
          ))}
        </div>

        {teacherId && <EssayGradingPanel teacherId={teacherId} />}
        {teacherId && <CertificatePanel teacherId={teacherId} />}
        {teacherId && <BadgeSection teacherId={teacherId} />}
      </main>
    </div>
  );
}

function BadgeSection({ teacherId }: { teacherId: string }) {
  const [refresh, setRefresh] = useState(0);
  return (
    <>
      <CreateBadgePanel onCreated={() => setRefresh((r) => r + 1)} />
      <BadgeGrantPanel teacherId={teacherId} reloadKey={refresh} />
    </>
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
                  <div className="text-xs text-muted-foreground">الدرجة الحالية: {a.score}/{a.total}</div>
                </div>
                <div className="space-y-2">
                  {(a.details as any[]).filter((d: any) => d?.type === "essay").map((d: any) => (
                    <div key={d.i} className="bg-secondary/30 rounded-xl p-3">
                      <div className="text-sm font-bold mb-1">{d.i + 1}. {d.question}</div>
                      <div className="text-sm bg-background p-2 rounded mb-2 whitespace-pre-wrap">{d.essay || <span className="text-muted-foreground">لا توجد إجابة</span>}</div>
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