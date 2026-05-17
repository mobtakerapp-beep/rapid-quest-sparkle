import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Target, Plus, X, Check, ShieldAlert, CheckSquare, Square, Trash2, Printer } from "lucide-react";
import { FullPageLoader } from "@/components/LoadingSpinner";
import { toast } from "sonner";
import { MathToolbar } from "@/components/MathToolbar";
import { useRef } from "react";
import { MathText } from "@/components/MathText";
import { playCorrect, playWrong, fireworks, burstStars, playFanfare } from "@/lib/quizFx";
import { toAr } from "@/lib/utils";
import { SCHOOLS } from "@/lib/schools";

export const Route = createFileRoute("/quizzes")({ component: QuizzesPage });

type Q = { question: string; options: string[]; correct: number; image_url?: string | null; type?: "mc" | "essay" };
type Quiz = { id: string; title: string; subject: string; questions: Q[]; created_by: string; teacher_name?: string };

async function printQuiz(quiz: Quiz) {
  const school = quiz.subject || "";
  const teacher = quiz.teacher_name || "";
  const today = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
  const arabicOpts = ["أ", "ب", "ج", "د", "هـ"];

  // If questions are not loaded yet (list view), fetch them first
  let qs: Q[] = Array.isArray(quiz.questions) ? quiz.questions.filter(Boolean) as Q[] : [];
  if (qs.length === 0) {
    const { data } = await supabase.rpc("get_quiz_for_attempt" as any, { _quiz_id: quiz.id });
    if (data && data[0]) qs = (data[0].questions || []) as Q[];
  }

  const mcCount = qs.filter(q => (q.type || "mc") === "mc").length;
  const essayCount = qs.filter(q => q.type === "essay").length;

  const questionsHtml = qs.map((q, i) => {
    const isMC = (q.type || "mc") === "mc";
    const optsHtml = isMC
      ? `<div class="options-grid">${q.options.map((o, oi) =>
          `<div class="option"><span class="opt-circle">${arabicOpts[oi] || toAr(oi + 1)}</span><span class="opt-text">${toAr(String(o))}</span></div>`
        ).join("")}</div>`
      : `<div class="essay-lines">${Array.from({ length: 5 }, () =>
          `<div class="essay-line"></div>`).join("")}</div>`;
    return `<div class="question-block">
      <div class="q-header">
        <span class="q-num">${toAr(i + 1)}</span>
        <span class="q-text">${toAr(q.question)}</span>
        <div class="q-score"><span class="qs-lbl">${isMC ? "درجة" : "درجات"}</span><div class="qs-box"></div></div>
      </div>
      ${q.image_url ? `<img src="${q.image_url}" class="q-img" />` : ""}
      ${optsHtml}
    </div>`;
  }).join("");

  const html = `<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
<meta charset="UTF-8">
<title>اختبار — ${quiz.title}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Segoe UI", Arial, sans-serif;
    font-size: 13px;
    color: #111;
    direction: rtl;
    background: #fff;
    padding: 14mm 18mm 12mm 18mm;
  }
  /* ── TOP STRIPE ── */
  .stripe {
    height: 8px;
    background: repeating-linear-gradient(90deg,#7b2d8b 0 40px,#fff 40px 44px,#1d6fa4 44px 84px,#fff 84px 88px);
    margin-bottom: 10px;
  }
  /* ── HEADER ── */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    border: 2px solid #7b2d8b;
    border-radius: 8px;
    padding: 8px 14px;
    margin-bottom: 8px;
    background: #fdf6ff;
  }
  .header-center { text-align: center; flex: 1; }
  .header-center .initiative { font-size: 16px; font-weight: 900; color: #7b2d8b; }
  .header-center .gov { font-size: 11px; color: #666; margin-top: 2px; }
  .header-badge {
    border-radius: 6px; padding: 6px 10px;
    font-size: 11px; font-weight: 700; text-align: center; line-height: 1.5;
    min-width: 72px; color: #fff;
  }
  /* ── INFO ROW ── */
  .info-row {
    display: flex;
    border: 1.5px solid #999;
    border-radius: 6px;
    overflow: hidden;
    margin-bottom: 8px;
    font-size: 12px;
  }
  .info-cell {
    flex: 1;
    padding: 5px 10px;
    border-left: 1.5px solid #ccc;
    background: #fafafa;
  }
  .info-cell:last-child { border-left: none; }
  .info-label { font-size: 10px; color: #888; margin-bottom: 1px; }
  .info-value { font-weight: 700; }
  /* ── STUDENT ROW ── */
  .student-row {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }
  .student-field {
    flex: 1;
    border: 1.5px solid #555;
    border-radius: 5px;
    padding: 5px 10px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .student-field .lbl { color: #444; font-size: 11px; white-space: nowrap; }
  .student-field .line { flex: 1; border-bottom: 1px dashed #aaa; height: 14px; }
  .score-box {
    border: 2px solid #7b2d8b;
    border-radius: 6px;
    padding: 5px 14px;
    font-size: 11px;
    display: flex; align-items: center; gap: 6px;
  }
  .score-box .lbl { color: #7b2d8b; font-weight: 700; white-space: nowrap; }
  .score-box .boxes { display: flex; gap: 4px; }
  .score-box .sbox { width: 32px; height: 22px; border: 1.5px solid #7b2d8b; border-radius: 3px; }
  /* ── TITLE BANNER ── */
  .title-banner {
    background: #7b2d8b;
    color: #fff;
    text-align: center;
    padding: 8px 14px;
    border-radius: 6px;
    font-size: 15px;
    font-weight: 900;
    margin-bottom: 6px;
  }
  /* ── STATS BAR ── */
  .stats-bar {
    display: flex;
    gap: 6px;
    margin-bottom: 10px;
    font-size: 11px;
  }
  .stat-pill {
    border-radius: 4px;
    padding: 3px 10px;
    font-weight: 700;
  }
  /* ── INSTRUCTIONS ── */
  .instructions {
    border: 1.5px solid #e0a000;
    border-radius: 6px;
    padding: 7px 12px;
    margin-bottom: 12px;
    background: #fffbef;
    font-size: 12px;
    line-height: 1.8;
  }
  .instructions strong { color: #b07800; }
  /* ── QUESTION BLOCK ── */
  .question-block {
    border: 1.5px solid #ddd;
    border-radius: 7px;
    padding: 10px 12px;
    margin-bottom: 10px;
    page-break-inside: avoid;
    background: #fff;
  }
  .q-header {
    display: flex;
    align-items: flex-start;
    gap: 8px;
    margin-bottom: 8px;
  }
  .q-num {
    background: #7b2d8b;
    color: #fff;
    border-radius: 50%;
    min-width: 24px;
    height: 24px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 900;
    flex-shrink: 0;
  }
  .q-text { flex: 1; font-weight: 700; font-size: 13px; line-height: 1.6; }
  .q-score {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }
  .q-score .qs-lbl {
    font-size: 10px;
    color: #888;
    white-space: nowrap;
  }
  .q-score .qs-box {
    width: 36px;
    height: 20px;
    border: 1.5px solid #7b2d8b;
    border-radius: 3px;
  }
  /* ── MC OPTIONS ── */
  .options-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
    padding-right: 8px;
  }
  .option {
    display: flex;
    align-items: center;
    gap: 6px;
    border: 1.5px solid #ddd;
    border-radius: 6px;
    padding: 5px 8px;
    background: #fafafa;
  }
  .opt-circle {
    width: 22px; height: 22px;
    border: 2px solid #7b2d8b;
    border-radius: 50%;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 900;
    color: #7b2d8b;
    flex-shrink: 0;
  }
  .opt-text { font-size: 12px; line-height: 1.4; }
  /* ── ESSAY LINES ── */
  .essay-lines { padding-right: 8px; }
  .essay-line {
    border-bottom: 1px solid #ccc;
    height: 26px;
    margin-bottom: 0;
  }
  /* ── Q IMAGE ── */
  .q-img {
    max-width: 200px;
    height: auto;
    border-radius: 6px;
    margin-bottom: 8px;
    display: block;
    border: 1px solid #ddd;
  }
  /* ── FOOTER ── */
  .footer {
    margin-top: 14px;
    border-top: 1.5px solid #bbb;
    padding-top: 6px;
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #777;
  }
  @media print {
    body { padding: 8mm 12mm 6mm 12mm; }
    .stripe,.header,.title-banner,.q-num,.opt-circle,.score-box {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
  }
</style>
</head>
<body>

<div class="stripe"></div>

<div class="header">
  <div class="header-badge" style="background:#7b2d8b;">اختبار<br>رسمي</div>
  <div class="header-center">
    <div class="initiative">مبادرة كلنا معاً</div>
    <div class="gov">محافظة الوسطى — سلطنة عُمان</div>
  </div>
  <div class="header-badge" style="background:#1d6fa4;">وزارة<br>التربية</div>
</div>

<div class="info-row">
  <div class="info-cell">
    <div class="info-label">المادة / المدرسة</div>
    <div class="info-value">${school || "—"}</div>
  </div>
  <div class="info-cell">
    <div class="info-label">المعلم / المعلمة</div>
    <div class="info-value">${teacher || "—"}</div>
  </div>
  <div class="info-cell">
    <div class="info-label">التاريخ</div>
    <div class="info-value">${today}</div>
  </div>
  <div class="info-cell">
    <div class="info-label">الزمن المحدد</div>
    <div class="info-value">______ دقيقة</div>
  </div>
</div>

<div class="student-row">
  <div class="student-field" style="flex:2">
    <span class="lbl">اسم الطالب / الطالبة:</span>
    <span class="line"></span>
  </div>
  <div class="student-field">
    <span class="lbl">الصف والشعبة:</span>
    <span class="line"></span>
  </div>
  <div class="score-box">
    <span class="lbl">الدرجة:</span>
    <div class="boxes"><div class="sbox"></div></div>
    <span style="color:#7b2d8b;font-weight:700;">/ ${toAr(mcCount + essayCount)}</span>
  </div>
</div>

<div class="title-banner">🎯 ${quiz.title}</div>

<div class="stats-bar">
  ${mcCount > 0 ? `<span class="stat-pill" style="background:#e8f4fd;color:#1d6fa4;border:1px solid #1d6fa4;">✏️ أسئلة اختيارية: ${toAr(mcCount)}</span>` : ""}
  ${essayCount > 0 ? `<span class="stat-pill" style="background:#f3e8ff;color:#7b2d8b;border:1px solid #7b2d8b;">📝 أسئلة مقالية: ${toAr(essayCount)}</span>` : ""}
  <span class="stat-pill" style="background:#fff8e0;color:#9a6000;border:1px solid #e0a000;">📊 المجموع: ${toAr(mcCount + essayCount)} سؤال</span>
</div>

<div class="instructions">
  <strong>📌 تعليمات عامة:</strong> اقرأ الأسئلة بتمعن قبل الإجابة — للأسئلة الاختيارية: اختر الإجابة الصحيحة الواحدة — للأسئلة المقالية: اكتب إجابتك بوضوح في المساحة المخصصة — الغش محرّم.
</div>

${questionsHtml}

<div class="footer">
  <span>مبادرة كلنا معاً — محافظة الوسطى</span>
  <span>${quiz.title}</span>
  <span>${today}</span>
</div>

</body>
</html>`;

  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) { alert("يرجى السماح بفتح نوافذ جديدة في المتصفح"); URL.revokeObjectURL(url); return; }
  setTimeout(() => { w.print(); setTimeout(() => URL.revokeObjectURL(url), 60000); }, 800);
}

function QuizzesPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [isParent, setIsParent] = useState(false);
  const [list, setList] = useState<Quiz[]>([]);
  const [active, setActive] = useState<Quiz | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState(SCHOOLS[0]);
  const [filter, setFilter] = useState("الكل");
  const [questions, setQuestions] = useState<Q[]>([{ question: "", options: ["", "", "", ""], correct: 0, type: "mc" }]);
  const [attemptedIds, setAttemptedIds] = useState<Set<string>>(new Set());
  const [isAdmin, setIsAdmin] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const subjects = ["الكل", ...SCHOOLS];

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const id = data.session.user.id;
      setUid(id);
      const [{ data: roles }, { data: prof }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("profiles").select("role_type").eq("id", id).maybeSingle(),
      ]);
      if ((prof as any)?.role_type === "parent") { setIsParent(true); return; }
      const adminRoles = !!roles?.some((r) => ["admin", "supervisor"].includes(String(r.role)));
      setIsTeacher(!!roles?.some((r) => ["admin", "teacher", "supervisor"].includes(String(r.role))));
      setIsAdmin(adminRoles);
      load(id);
    });
  }, [navigate]);

  // ── Realtime subscription ──
  useEffect(() => {
    const ch = supabase.channel("quizzes-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "quizzes" }, () => load())
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "quizzes" }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "quizzes" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = async (userId?: string) => {
    const currentUid = userId ?? uid;
    const [{ data }, { data: attempts }] = await Promise.all([
      supabase.rpc("list_quizzes" as any),
      currentUid
        ? supabase.from("quiz_attempts").select("quiz_id").eq("user_id", currentUid)
        : Promise.resolve({ data: [] }),
    ]);
    const mapped = (data || []).map((r: any) => ({
      id: r.id, title: r.title, subject: r.subject, created_by: r.created_by,
      questions: new Array(r.question_count || 0).fill(null),
    }));
    // Fetch teacher names
    const creatorIds = [...new Set(mapped.map((q: any) => q.created_by).filter(Boolean))];
    const { data: profs } = creatorIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", creatorIds)
      : { data: [] };
    const nameMap: Record<string, string> = {};
    (profs || []).forEach((p: any) => { nameMap[p.id] = p.display_name || ""; });
    setList(mapped.map((q: any) => ({ ...q, teacher_name: nameMap[q.created_by] || "" })) as any);
    setAttemptedIds(new Set(((attempts as any[]) || []).map((a: any) => a.quiz_id)));
  };

  const openQuiz = async (quizId: string) => {
    const { data, error } = await supabase.rpc("get_quiz_for_attempt" as any, { _quiz_id: quizId });
    if (error || !data || !data[0]) { toast.error("تعذر فتح الاختبار"); return; }
    const row = data[0];
    setActive({ id: row.id, title: row.title, subject: row.subject, created_by: row.created_by, questions: row.questions || [] } as any);
  };

  const create = async () => {
    if (!uid || !title.trim()) return toast.error("أكمل العنوان");
    const bad = questions.some((q) => {
      if (!q.question.trim()) return true;
      if ((q.type || "mc") === "mc" && q.options.some((o) => !o.trim())) return true;
      return false;
    });
    if (bad) return toast.error("أكمل كل الأسئلة");
    const { error } = await supabase.from("quizzes").insert({ title: title.trim(), subject, questions: questions as any, created_by: uid });
    if (error) return toast.error(error.message);
    toast.success("تم إضافة الاختبار للبنك 🎯");
    const { data: students } = await supabase.from("profiles").select("id").eq("role_type", "student");
    if (students?.length) {
      await supabase.from("notifications").insert(
        students.map((s) => ({
          user_id: s.id,
          title: `اختبار جديد 🎯`,
          body: `تم إضافة اختبار جديد: "${title.trim()}" — مدرسة: ${subject}`,
          type: "quiz",
          link: "/quizzes",
        }))
      );
    }
    setTitle(""); setSubject(SCHOOLS[0]); setQuestions([{ question: "", options: ["", "", "", ""], correct: 0, type: "mc" }]); setShowForm(false); load(uid ?? undefined);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(list.map((q) => q.id)));
  const clearSelect = () => { setSelected(new Set()); setSelectMode(false); };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`حذف ${selected.size} اختبار نهائياً؟`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    const { error } = await supabase.from("quizzes").delete().in("id", ids);
    setBulkDeleting(false);
    if (error) return toast.error("فشل الحذف: " + error.message);
    toast.success(`تم حذف ${toAr(ids.length)} اختبار ✨`);
    setList((p) => p.filter((q) => !ids.includes(q.id)));
    setSelected(new Set()); setSelectMode(false);
  };

  const filtered = filter === "الكل" ? list : list.filter((q) => q.subject === filter);

  if (active && uid) return <QuizPlay quiz={active} uid={uid} isTeacher={isTeacher} onBack={() => { setActive(null); load(); }} />;

  if (isParent) return (
    <div dir="rtl" className="min-h-screen bg-background flex flex-col items-center justify-center gap-4 text-center px-4">
      <div className="text-5xl">🔒</div>
      <h2 className="text-xl font-black">هذه الصفحة للطلاب فقط</h2>
      <p className="text-muted-foreground text-sm">كولي أمر يمكنك متابعة المجتمع والمعرض والشات</p>
      <Link to="/" className="px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold">العودة للرئيسية</Link>
    </div>
  );

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center text-white"><Target className="h-5 w-5" /></div>
            <h1 className="font-bold">بنك الاختبارات</h1>
            {isAdmin && (
              <button onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition ${selectMode ? "bg-rose-100 text-rose-700" : "bg-secondary hover:bg-secondary/70"}`}>
                <ShieldAlert className="h-4 w-4" />
                {selectMode ? "إلغاء" : "تحديد"}
              </button>
            )}
          </div>
        </div>
      </header>
      {selectMode && isAdmin && (
        <div className="sticky top-[57px] z-20 bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center gap-3" dir="rtl">
          <span className="text-sm font-bold text-rose-700">{toAr(selected.size)} محدد</span>
          <button onClick={selectAll} className="text-xs px-3 py-1 rounded-lg bg-rose-100 text-rose-700 font-bold hover:bg-rose-200">تحديد الكل ({toAr(filtered.length)})</button>
          <button onClick={clearSelect} className="text-xs px-3 py-1 rounded-lg bg-secondary font-bold hover:bg-secondary/70">إلغاء</button>
          <button onClick={bulkDelete} disabled={selected.size === 0 || bulkDeleting}
            className="mr-auto inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-rose-600 text-white text-sm font-bold disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> {bulkDeleting ? "جاري الحذف..." : `حذف (${toAr(selected.size)})`}
          </button>
        </div>
      )}
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <div className="mb-4 flex flex-wrap gap-2">
          {subjects.map((s) => (
            <button key={s} onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border ${filter === s ? "bg-[var(--brand)] text-white border-[var(--brand)]" : "bg-card border-border text-muted-foreground hover:border-[var(--brand)]/50"}`}>
              {s} {s !== "الكل" && `(${list.filter(q => q.subject === s).length})`}
            </button>
          ))}
        </div>
        {isTeacher && (
          <div className="mb-6">
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[image:var(--gradient-hero)] text-white font-bold"><Plus className="h-5 w-5" /> اختبار جديد</button>
            ) : (
              <div className="bg-card rounded-3xl border border-border p-5 space-y-3">
                <div className="flex items-center justify-between"><h3 className="font-bold">اختبار جديد</h3><button onClick={() => setShowForm(false)}><X className="h-4 w-4" /></button></div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الاختبار" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background" />
                <select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background">
                  {SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {questions.map((q, qi) => (
                  <QuestionEditor key={qi} q={q} qi={qi} onChange={(nq) => { const n = [...questions]; n[qi] = nq; setQuestions(n); }} />
                ))}
                <div className="flex gap-2 flex-wrap">
                  <button onClick={() => setQuestions([...questions, { question: "", options: ["", "", "", ""], correct: 0, type: "mc" }])} className="text-sm text-[var(--brand)]">+ سؤال اختياري</button>
                  <button onClick={() => setQuestions([...questions, { question: "", options: [], correct: 0, type: "essay" }])} className="text-sm text-violet-600">+ سؤال مقالي</button>
                </div>
                <button onClick={create} className="w-full px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold">إنشاء</button>
              </div>
            )}
          </div>
        )}
        <div className="grid gap-3">
          {filtered.length === 0 ? <div className="text-center text-muted-foreground py-16 text-sm">لا توجد اختبارات في هذا التصنيف</div>
            : filtered.map((q) => {
              const canDelete = isTeacher;
              const onDelete = async (e: React.MouseEvent) => {
                e.stopPropagation();
                if (!confirm("حذف الاختبار نهائياً؟")) return;
                const { error } = await supabase.from("quizzes").delete().eq("id", q.id);
                if (error) return toast.error("لا تملك صلاحية الحذف");
                toast.success("تم الحذف");
                setList((p) => p.filter((x) => x.id !== q.id));
              };
              const isSelected = selected.has(q.id);
              return (
              <div key={q.id} className={`flex items-stretch gap-2 ${isSelected && selectMode ? "ring-2 ring-rose-400 rounded-2xl" : ""}`}>
                {selectMode && isAdmin && (
                  <button onClick={() => toggleSelect(q.id)} className="flex items-center shrink-0 pr-1">
                    {isSelected ? <CheckSquare className="h-5 w-5 text-rose-500" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                  </button>
                )}
                <button onClick={() => selectMode ? toggleSelect(q.id) : openQuiz(q.id)} className="flex-1 text-right bg-card rounded-2xl border border-border p-4 hover:shadow-lg transition min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-bold">{q.title}</div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {!isTeacher && (
                        attemptedIds.has(q.id)
                          ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 font-bold flex items-center gap-0.5"><Check className="h-2.5 w-2.5" /> شاركت</span>
                          : <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 font-bold">● نشطة</span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] font-bold">🏫 {q.subject || SCHOOLS[0]}</span>
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">{toAr(Array.isArray(q.questions) ? q.questions.length : 0)} أسئلة</div>
                  {(q as any).teacher_name && <div className="text-[11px] text-muted-foreground mt-0.5">المعلم: {(q as any).teacher_name}</div>}
                </button>
                {isTeacher && !selectMode && (
                  <div className="flex flex-col gap-1 justify-center shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); printQuiz(q); }} className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80" title="طباعة">
                      <Printer className="h-3.5 w-3.5" />
                    </button>
                    {canDelete && (
                      <button onClick={onDelete} className="p-1.5 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20" title="حذف">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
              );
            })}
        </div>
      </main>
    </div>
  );
}

function QuizPlay({ quiz, uid, isTeacher, onBack }: { quiz: Quiz; uid: string; isTeacher: boolean; onBack: () => void }) {
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [essays, setEssays] = useState<Record<number, string>>({});
  const [done, setDone] = useState(false);
  const [score, setScore] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [previousDetails, setPreviousDetails] = useState<any[] | null>(null);
  const rawQs = Array.isArray(quiz.questions) ? quiz.questions : [];

  // No shuffle: display options exactly as saved in DB.
  // correct=0 in DB means the first option is the correct answer.
  // Student sends answers[i] = oi (the pressed display index = original DB index).
  const qs: Q[] = rawQs as Q[];
  const mcCount = qs.filter((q) => (q.type || "mc") === "mc").length;

  // Load previous attempt — students can take only ONCE; teachers preview without submitting
  useEffect(() => {
    if (isTeacher) { setLoaded(true); return; }
    (async () => {
      const { data } = await supabase.from("quiz_attempts")
        .select("score, total, details").eq("quiz_id", quiz.id).eq("user_id", uid).maybeSingle();
      if (data) {
        setScore(data.score || 0);
        setDone(true);
        const det = (data.details as any[]) || [];
        setPreviousDetails(det);
        const ans: Record<number, number> = {}; const ess: Record<number, string> = {};
        det.forEach((d: any) => {
          if (d.type === "essay") ess[d.i] = d.essay || "";
          else if (typeof d.selected === "number") ans[d.i] = d.selected;
        });
        setAnswers(ans); setEssays(ess);
      }
      setLoaded(true);
    })();
  }, [quiz.id, uid, isTeacher]);

  const submit = async () => {
    const ansMap: Record<string, number> = {};
    const essMap: Record<string, string> = {};
    qs.forEach((q: any, i: number) => {
      if ((q.type || "mc") === "essay") essMap[String(i)] = essays[i] || "";
      else if (typeof answers[i] === "number") {
        ansMap[String(i)] = answers[i];
      }
    });
    const { data, error } = await supabase.rpc("submit_quiz_attempt" as any, {
      _quiz_id: quiz.id,
      _answers: ansMap as any,
      _essays: essMap as any,
    });
    if (error) {
      const msg = error.message || "";
      toast.error(msg.includes("حليت") || msg.includes("unique") ? "لقد حليت هذا الاختبار من قبل" : msg);
      return;
    }
    const row = Array.isArray(data) ? data[0] : data;
    const s = row?.score ?? 0;
    const det = (row?.details as any[]) || [];
    setScore(s); setDone(true); setPreviousDetails(det);
    toast.success(`نتيجتك: ${toAr(s)}/${toAr(mcCount)} 🎉`);
    if (mcCount > 0) {
      const ratio = s / mcCount;
      if (ratio >= 0.5) { playFanfare(); fireworks(Math.max(0.4, ratio)); }
      else if (s > 0) { burstStars(); }
    }
  };

  if (!loaded) return <FullPageLoader />;

  const essayCount = qs.filter((q) => (q.type || "mc") === "essay").length;

  // After submission: show results summary only (no questions replay)
  if (done && !isTeacher) {
    return (
      <div dir="rtl" className="min-h-screen bg-background">
        <header className="bg-card border-b border-border sticky top-0 z-10">
          <div className="container mx-auto px-4 py-3"><button onClick={onBack} className="text-sm inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" /> العودة</button></div>
        </header>
        <main className="container mx-auto px-4 py-10 max-w-md space-y-4">
          <div className="text-center bg-card rounded-3xl border border-border p-8 shadow-lg space-y-4">
            <div className="text-6xl">🎯</div>
            <h2 className="text-2xl font-black">{quiz.title}</h2>
            {mcCount > 0 && (
              <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-5">
                <div className="text-xs text-emerald-700 dark:text-emerald-400 font-bold mb-1">درجة الأسئلة الاختيارية</div>
                <div className="text-4xl font-black text-emerald-700 dark:text-emerald-400">{toAr(score)} / {toAr(mcCount)}</div>
              </div>
            )}
            {essayCount > 0 && (
              <div className="bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800 rounded-2xl p-4">
                <div className="text-sm font-bold text-violet-700 dark:text-violet-400">📝 الأسئلة المقالية ({toAr(essayCount)})</div>
                <div className="text-xs text-violet-600 dark:text-violet-500 mt-1">تم الإرسال للمعلم — بانتظار التصحيح</div>
              </div>
            )}
            <div className="text-xs text-muted-foreground">تم تسجيل النتيجة وإضافة نقاطك ✅</div>
            <button onClick={onBack} className="w-full px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold">العودة للقائمة</button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3"><button onClick={onBack} className="text-sm inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" /> العودة</button></div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-2xl space-y-4">
        <h2 className="text-2xl font-black">{quiz.title}</h2>
        {qs.map((q, i) => (
          <div key={i} className="bg-card rounded-2xl border border-border p-5">
            <div className="font-bold mb-3 flex gap-1 items-start justify-between">
              <div className="flex gap-1"><span>{toAr(i + 1)}.</span><MathText text={q.question} /></div>
            </div>
            {q.image_url && <img src={q.image_url} alt="" className="w-full max-h-72 object-contain rounded-xl mb-3 bg-secondary/30" />}
            {(q.type || "mc") === "essay" ? (
              <textarea
                value={essays[i] || ""}
                onChange={(e) => setEssays({ ...essays, [i]: e.target.value })}
                placeholder="اكتب إجابتك هنا..."
                rows={4}
                className="w-full px-3 py-2 rounded-xl border-2 border-border bg-background text-sm"
              />
            ) : (
            <div className="grid gap-2">
              {q.options.map((o, oi) => {
                const sel = answers[i] === oi;
                return (
                  <button key={oi} disabled={isTeacher}
                    onClick={(e) => {
                      setAnswers({ ...answers, [i]: oi });
                      if (oi === q.correct) {
                        playCorrect();
                        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        burstStars({ x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight });
                      } else {
                        playWrong();
                      }
                    }}
                    className={`text-right px-4 py-3 rounded-xl border-2 transition ${
                      sel ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-border"
                    }`}><MathText text={o} /></button>
                );
              })}
            </div>
            )}
          </div>
        ))}
        {isTeacher ? (
          <div dir="rtl" className="text-center bg-secondary/60 rounded-2xl border border-border p-4 text-sm text-muted-foreground font-bold">
            👀 أنت تشاهد الاختبار بصفة مراجع — لا يمكنك الإجابة
          </div>
        ) : (
          <button onClick={submit}
            disabled={qs.some((q, i) => (q.type || "mc") === "mc" ? answers[i] === undefined : !essays[i]?.trim())}
            className="w-full px-5 py-3 rounded-2xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">إنهاء الاختبار</button>
        )}
      </main>
    </div>
  );
}

function QuestionEditor({ q, qi, onChange }: { q: Q; qi: number; onChange: (q: Q) => void }) {
  const qRef = useRef<HTMLInputElement>(null);
  const correctRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user.id;
      if (!uid) return;
      const ext = file.name.split(".").pop() || "png";
      const path = `${uid}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("quiz-images").upload(path, file);
      if (error) { toast.error("فشل الرفع: " + error.message); return; }
      const url = supabase.storage.from("quiz-images").getPublicUrl(path).data.publicUrl;
      onChange({ ...q, image_url: url });
    } finally { setUploading(false); e.target.value = ""; }
  };

  // For MC: options[0] = correct answer, options[1..3] = wrong answers, correct = 0
  const opts = q.options.length >= 4 ? q.options : ["", "", "", ""];
  const correctAnswer = opts[0] || "";
  const wrongAnswers = [opts[1] || "", opts[2] || "", opts[3] || ""];

  const setCorrectAnswer = (v: string) => {
    const o = [...opts]; o[0] = v;
    onChange({ ...q, options: o, correct: 0 });
  };
  const setWrongAnswer = (wi: number, v: string) => {
    const o = [...opts]; o[wi + 1] = v;
    onChange({ ...q, options: o, correct: 0 });
  };

  return (
    <div className="p-3 rounded-xl border border-border space-y-2">
      <div className="text-[11px] font-bold text-muted-foreground">
        {(q.type || "mc") === "essay" ? "📝 سؤال مقالي" : "☑️ سؤال اختياري"}
      </div>
      <input
        ref={qRef}
        value={q.question}
        onChange={(e) => onChange({ ...q, question: e.target.value })}
        placeholder={`السؤال ${toAr(qi + 1)}`}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background"
      />
      <MathToolbar targetRef={qRef} onChange={(v) => onChange({ ...q, question: v })} />
      <div className="flex items-center gap-2 flex-wrap">
        <label className="cursor-pointer text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/80 inline-flex items-center gap-1">
          📷 {q.image_url ? "تغيير الصورة" : "إضافة صورة (اختياري)"}
          <input type="file" accept="image/*" className="hidden" onChange={onPickImage} disabled={uploading} />
        </label>
        {q.image_url && (
          <>
            <img src={q.image_url} alt="" className="h-12 rounded border" />
            <button type="button" onClick={() => onChange({ ...q, image_url: null })} className="text-xs text-destructive">حذف</button>
          </>
        )}
        {uploading && <span className="text-xs text-muted-foreground">جاري الرفع...</span>}
      </div>
      {(q.type || "mc") === "mc" && (
        <div className="space-y-1.5">
          <div className="text-[10px] text-muted-foreground font-bold">اكتب الإجابة الصحيحة ثم 3 إجابات خاطئة — ستظهر عشوائية للطالب</div>
          <div className="flex items-center gap-2">
            <span className="text-emerald-600">✅</span>
            <input
              ref={correctRef}
              value={correctAnswer}
              onChange={(e) => setCorrectAnswer(e.target.value)}
              placeholder="الإجابة الصحيحة"
              className="flex-1 px-3 py-2 rounded-lg border-2 border-emerald-500 bg-background text-sm font-bold"
            />
          </div>
          <MathToolbar targetRef={correctRef} onChange={(v) => setCorrectAnswer(v)} />
          {wrongAnswers.map((w, wi) => (
            <div key={wi} className="flex items-center gap-2">
              <span className="text-rose-500">❌</span>
              <input
                value={w}
                onChange={(e) => setWrongAnswer(wi, e.target.value)}
                placeholder={`إجابة خاطئة ${toAr(wi + 1)}`}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
