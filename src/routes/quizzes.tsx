import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Target, Plus, X, Check } from "lucide-react";
import { toast } from "sonner";
import { MathToolbar } from "@/components/MathToolbar";
import { useRef } from "react";
import { MathText } from "@/components/MathText";

export const Route = createFileRoute("/quizzes")({ component: QuizzesPage });

type Q = { question: string; options: string[]; correct: number; image_url?: string | null; type?: "mc" | "essay" };
type Quiz = { id: string; title: string; subject: string; questions: Q[]; created_by: string };

function QuizzesPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [list, setList] = useState<Quiz[]>([]);
  const [active, setActive] = useState<Quiz | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [subject, setSubject] = useState("عام");
  const [filter, setFilter] = useState("الكل");
  const [questions, setQuestions] = useState<Q[]>([{ question: "", options: ["", "", "", ""], correct: 0, type: "mc" }]);

  const subjects = ["الكل", "رياضيات", "علوم", "لغة عربية", "إنجليزي", "دراسات", "إسلامية", "عام"];

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const id = data.session.user.id;
      setUid(id);
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", id);
      setIsTeacher(!!roles?.some((r) => ["admin", "teacher", "supervisor"].includes(String(r.role))));
      load();
    });
  }, [navigate]);

  const load = async () => {
    // Use RPC so students get list without correct answers; teachers/admins still see everything via RLS
    const { data } = await supabase.rpc("list_quizzes" as any);
    // Map shape: list_quizzes returns question_count, no `questions` array
    const mapped = (data || []).map((r: any) => ({
      id: r.id, title: r.title, subject: r.subject, created_by: r.created_by,
      questions: new Array(r.question_count || 0).fill(null), // placeholder for count display
    }));
    setList(mapped as any);
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
    setTitle(""); setSubject("عام"); setQuestions([{ question: "", options: ["", "", "", ""], correct: 0, type: "mc" }]); setShowForm(false); load();
  };

  const filtered = filter === "الكل" ? list : list.filter((q) => q.subject === filter);

  if (active && uid) return <QuizPlay quiz={active} uid={uid} isTeacher={isTeacher} onBack={() => { setActive(null); load(); }} />;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" /> الرئيسية</Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-rose-500 to-pink-500 flex items-center justify-center text-white"><Target className="h-5 w-5" /></div>
            <h1 className="font-bold">بنك الاختبارات</h1>
          </div>
        </div>
      </header>
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
                  {subjects.filter(s => s !== "الكل").map((s) => <option key={s} value={s}>{s}</option>)}
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
            : filtered.map((q) => (
              <button key={q.id} onClick={() => openQuiz(q.id)} className="text-right bg-card rounded-2xl border border-border p-4 hover:shadow-lg transition">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold">{q.title}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] font-bold">{q.subject || "عام"}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{Array.isArray(q.questions) ? q.questions.length : 0} أسئلة</div>
              </button>
            ))}
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
  // No client-side shuffle: keeps option indices aligned with server-stored `correct` for scoring.
  const [qs] = useState(() => rawQs.map((q) => ({ ...q })));
  const mcCount = qs.filter((q) => (q.type || "mc") === "mc").length;

  // Load previous attempt — students can take only ONCE; teachers can preview without restriction
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
    // Send selections to server; server scores using real correct answers (which the client doesn't have).
    const ansMap: Record<string, number> = {};
    const essMap: Record<string, string> = {};
    qs.forEach((q, i) => {
      if ((q.type || "mc") === "essay") essMap[String(i)] = essays[i] || "";
      else if (typeof answers[i] === "number") ansMap[String(i)] = answers[i];
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
    toast.success(`نتيجتك: ${s}/${mcCount} 🎉`);
  };

  if (!loaded) return <div dir="rtl" className="min-h-screen flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;

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
              <div className="flex gap-1"><span>{i + 1}.</span><MathText text={q.question} /></div>
              {done && (q.type || "mc") === "mc" && (() => {
                const det = previousDetails?.find((d: any) => d.i === i);
                const correctIdx = (q as any).correct ?? det?.correct;
                const ok = correctIdx !== undefined && answers[i] === correctIdx;
                return (
                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                    {ok ? "1 / 1" : "0 / 1"}
                  </span>
                );
              })()}
              {(q.type || "mc") === "essay" && (() => {
                const det = previousDetails?.find((d: any) => d.i === i);
                if (done && det?.points !== null && det?.points !== undefined) {
                  return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{det.points} / 1 (مقالي مُصحح)</span>;
                }
                return <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-violet-100 text-violet-700">مقالي {done ? "(بانتظار التصحيح)" : ""}</span>;
              })()}
            </div>
            {q.image_url && <img src={q.image_url} alt="" className="w-full max-h-72 object-contain rounded-xl mb-3 bg-secondary/30" />}
            {(q.type || "mc") === "essay" ? (
              <textarea
                disabled={done}
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
                const det = previousDetails?.find((d: any) => d.i === i);
                const correctIdx = (q as any).correct ?? det?.correct;
                const correctAfter = done && correctIdx !== undefined && oi === correctIdx;
                const wrongAfter = done && sel && correctIdx !== undefined && oi !== correctIdx;
                return (
                  <button key={oi} disabled={done} onClick={() => setAnswers({ ...answers, [i]: oi })}
                    className={`text-right px-4 py-3 rounded-xl border-2 transition ${
                      correctAfter ? "border-emerald-500 bg-emerald-50" :
                      wrongAfter ? "border-rose-500 bg-rose-50" :
                      sel ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-border"
                    }`}><MathText text={o} /> {correctAfter && <Check className="inline h-4 w-4 text-emerald-600" />}</button>
                );
              })}
            </div>
            )}
          </div>
        ))}
        {!done ? (
          <button onClick={submit}
            disabled={qs.some((q, i) => (q.type || "mc") === "mc" ? answers[i] === undefined : !essays[i]?.trim())}
            className="w-full px-5 py-3 rounded-2xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">إنهاء الاختبار</button>
        ) : (
          <div className="text-center bg-card rounded-2xl border border-border p-6">
            <div className="text-3xl font-black mb-2">🎯 {score}/{mcCount}</div>
            <div className="text-sm text-muted-foreground mb-3">
              {qs.length > mcCount && <>الأسئلة المقالية ({qs.length - mcCount}) تحتاج تصحيح المعلم.<br /></>}
              تفاصيل الدرجات بجانب كل سؤال أعلاه
            </div>
            <div className="text-muted-foreground text-xs">تم تسجيل النتيجة وإضافة نقاطك</div>
          </div>
        )}
      </main>
    </div>
  );
}

function QuestionEditor({ q, qi, onChange }: { q: Q; qi: number; onChange: (q: Q) => void }) {
  const qRef = useRef<HTMLInputElement>(null);
  const optRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focused, setFocused] = useState<number>(-1);
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

  return (
    <div className="p-3 rounded-xl border border-border space-y-2">
      <div className="text-[11px] font-bold text-muted-foreground">
        {(q.type || "mc") === "essay" ? "📝 سؤال مقالي" : "☑️ سؤال اختياري"}
      </div>
      <input
        ref={qRef}
        onFocus={() => setFocused(-1)}
        value={q.question}
        onChange={(e) => onChange({ ...q, question: e.target.value })}
        placeholder={`السؤال ${qi + 1}`}
        className="w-full px-3 py-2 rounded-lg border border-border bg-background"
      />
      <MathToolbar
        targetRef={focused === -1 ? qRef : { current: optRefs.current[focused] }}
        onChange={(v) => {
          if (focused === -1) onChange({ ...q, question: v });
          else { const opts = [...q.options]; opts[focused] = v; onChange({ ...q, options: opts }); }
        }}
      />
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
      {(q.type || "mc") === "mc" && q.options.map((o, oi) => (
        <div key={oi} className="flex gap-2 items-center">
          <input type="radio" checked={q.correct === oi} onChange={() => onChange({ ...q, correct: oi })} />
          <input
            ref={(el) => { optRefs.current[oi] = el; }}
            onFocus={() => setFocused(oi)}
            value={o}
            onChange={(e) => { const opts = [...q.options]; opts[oi] = e.target.value; onChange({ ...q, options: opts }); }}
            placeholder={`الخيار ${oi + 1}`}
            className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm"
          />
        </div>
      ))}
    </div>
  );
}
