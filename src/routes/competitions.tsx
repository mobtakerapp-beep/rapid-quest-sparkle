import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy, Plus, Clock, Send, X, Crown, MessageCircle, Image as ImageIcon, Link2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Reactions } from "@/components/Reactions";
import { MathToolbar } from "@/components/MathToolbar";
import { MathText } from "@/components/MathText";
import { ReportButton } from "@/components/ReportButton";

export const Route = createFileRoute("/competitions")({ component: CompetitionsPage });

type MQ = {
  question: string;
  is_multiple_choice: boolean;
  options?: string[];
  correct_index?: number;
  correct_answer?: string;
  duration_seconds: number;
};

type Comp = {
  id: string;
  title: string;
  description: string | null;
  question: string;
  image_url: string | null;
  duration_seconds: number;
  starts_at: string;
  ends_at: string;
  created_by: string;
  is_multiple_choice?: boolean | null;
  options?: string[] | null;
  questions?: MQ[] | null;
};
type Sub = {
  id: string;
  user_id: string;
  answer: string | null;
  answers?: Record<string, string> | null;
  correct_count?: number | null;
  question_count?: number | null;
  image_url: string | null;
  link_url: string | null;
  submitted_at: string;
  time_taken_seconds: number;
  is_correct: boolean;
};

async function uploadToBucket(bucket: string, file: File, uid: string): Promise<string | null> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${uid}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) { toast.error("فشل رفع الملف: " + error.message); return null; }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

const newBlankQuestion = (): MQ => ({
  question: "",
  is_multiple_choice: true,
  options: ["", "", "", ""],
  correct_index: 0,
  correct_answer: "",
  duration_seconds: 5,
});

function CompetitionsPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [isParent, setIsParent] = useState(false);
  const [comps, setComps] = useState<Comp[]>([]);
  const [active, setActive] = useState<Comp | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [userSubmittedIds, setUserSubmittedIds] = useState<Set<string>>(new Set());

  const [title, setTitle] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [questions, setQuestions] = useState<MQ[]>([newBlankQuestion()]);

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
      setCanCreate(!!roles?.some((r) => ["admin", "teacher", "supervisor"].includes(String(r.role))));
      load(id);
    });
  }, [navigate]);

  const load = async (userId?: string) => {
    const { data, error } = await supabase.from("competitions").select("*").order("created_at", { ascending: false }).limit(50);
    if (error) { toast.error("تعذّر تحميل المسابقات: " + error.message); return; }
    setComps((data || []) as Comp[]);
    const id = userId || uid;
    if (id) {
      const { data: subs } = await supabase.from("competition_submissions").select("competition_id").eq("user_id", id);
      setUserSubmittedIds(new Set((subs || []).map((s: any) => s.competition_id)));
    }
  };

  useEffect(() => {
    const ch = supabase.channel("competitions-list")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "competitions" }, (p) => {
        setComps((prev) => [p.new as Comp, ...prev.filter(c => c.id !== (p.new as Comp).id)]);
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "competitions" }, (p) => {
        setComps((prev) => prev.filter(c => c.id !== (p.old as any).id));
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "competitions" }, (p) => {
        setComps((prev) => prev.map(c => c.id === (p.new as Comp).id ? p.new as Comp : c));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel(`my-submissions-${uid}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "competition_submissions",
        filter: `user_id=eq.${uid}`,
      }, (p: any) => {
        setUserSubmittedIds((prev) => new Set([...prev, p.new.competition_id]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid]);

  const updateQ = (i: number, patch: Partial<MQ>) => {
    setQuestions((p) => p.map((q, j) => (j === i ? { ...q, ...patch } : q)));
  };
  const addQ = () => setQuestions((p) => [...p, newBlankQuestion()]);
  const removeQ = (i: number) => setQuestions((p) => p.length > 1 ? p.filter((_, j) => j !== i) : p);

  const create = async () => {
    if (!uid || !title.trim()) { toast.error("أدخل عنوان المسابقة"); return; }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) { toast.error(`السؤال ${i + 1}: اكتب نص السؤال`); return; }
      if (q.is_multiple_choice) {
        const filled = (q.options || []).map((o) => o.trim()).filter(Boolean);
        if (filled.length < 2) { toast.error(`السؤال ${i + 1}: أضف خيارين على الأقل`); return; }
        if (!q.options?.[q.correct_index ?? 0]?.trim()) { toast.error(`السؤال ${i + 1}: حدد الإجابة الصحيحة`); return; }
      } else if (!q.correct_answer?.trim()) {
        toast.error(`السؤال ${i + 1}: أدخل الإجابة الصحيحة`); return;
      }
      if (!q.duration_seconds || q.duration_seconds < 3) { toast.error(`السؤال ${i + 1}: المؤقت 3 ثوانٍ على الأقل`); return; }
    }
    setUploading(true);
    let image_url: string | null = null;
    if (imageFile) image_url = await uploadToBucket("competition-media", imageFile, uid);

    const totalDuration = questions.reduce((s, q) => s + (q.duration_seconds || 0), 0);
    const cleanQuestions: MQ[] = questions.map((q) => {
      const rawOptions = (q.options || []).map((o) => o.trim());
      const cleanOptions = q.is_multiple_choice ? rawOptions.filter(Boolean) : undefined;
      const originalCorrectText = rawOptions[q.correct_index ?? 0] ?? "";
      const remappedIdx = cleanOptions
        ? Math.max(0, cleanOptions.indexOf(originalCorrectText))
        : 0;
      return {
        question: q.question.trim(),
        is_multiple_choice: q.is_multiple_choice,
        options: cleanOptions,
        correct_index: q.is_multiple_choice ? remappedIdx : undefined,
        correct_answer: q.is_multiple_choice
          ? (cleanOptions?.[remappedIdx] || "")
          : (q.correct_answer || "").trim(),
        duration_seconds: q.duration_seconds,
      };
    });

    const first = cleanQuestions[0];
    const starts = new Date();
    const ends = new Date(starts.getTime() + totalDuration * 1000);

    const { data: inserted, error: insertErr } = await supabase.from("competitions").insert({
      title: title.trim(),
      question: first.question,
      image_url,
      duration_seconds: totalDuration,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      created_by: uid,
      is_multiple_choice: first.is_multiple_choice,
      options: (first.options as any) ?? null,
      questions: null,
    } as any).select().single();

    if (insertErr) {
      setUploading(false);
      return toast.error("فشل إنشاء المسابقة: " + insertErr.message);
    }

    const compId = (inserted as any).id;

    // For MC questions store the correct INDEX (integer 0-3) so the RPC can compare selected index.
    // For text questions store the correct answer string.
    // Format matches what submit_competition_attempt expects (same pattern as quizzes).
    const correctKeys = cleanQuestions.map((q) =>
      q.is_multiple_choice ? (q.correct_index ?? 0) : (q.correct_answer ?? "").trim()
    );

    await supabase.from("competition_secrets" as any).upsert({
      competition_id: compId,
      correct_answer: JSON.stringify(correctKeys),
      correct_index: first.correct_index ?? null,
    }, { onConflict: "competition_id" });

    const { error: updateErr } = await supabase.from("competitions").update({
      questions: cleanQuestions as any,
    }).eq("id", compId);

    setUploading(false);
    if (updateErr) {
      toast.error("تحذير: فشل حفظ الأسئلة كاملة. حاول مرة أخرى.");
      return;
    }

    toast.success("تم إنشاء المسابقة 🏆");
    setTitle(""); setImageFile(null); setQuestions([newBlankQuestion()]); setShowForm(false);
    load();
  };

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
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> الرئيسية
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-yellow-500 to-orange-500 flex items-center justify-center text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <h1 className="font-bold">المسابقات السريعة</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl">
        {canCreate && (
          <div className="mb-6">
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[image:var(--gradient-hero)] text-white font-bold">
                <Plus className="h-5 w-5" /> إنشاء مسابقة جديدة
              </button>
            ) : (
              <div className="bg-card rounded-3xl border border-border p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">مسابقة جديدة (متعددة الأسئلة)</h3>
                  <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
                </div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المسابقة" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background" />
                <div>
                  <label className="block text-sm font-bold mb-1 inline-flex items-center gap-1"><ImageIcon className="h-4 w-4" /> صورة للمسابقة (اختياري)</label>
                  <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="text-sm" />
                  {imageFile && <div className="text-xs text-muted-foreground mt-1">{imageFile.name}</div>}
                </div>
                {questions.map((q, i) => (
                  <QuestionEditor key={i} index={i} q={q} onChange={(patch) => updateQ(i, patch)} onRemove={() => removeQ(i)} canRemove={questions.length > 1} />
                ))}
                <button onClick={addQ} className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed border-border text-sm font-bold hover:bg-secondary">
                  <Plus className="h-4 w-4" /> إضافة سؤال آخر
                </button>
                <button onClick={create} disabled={uploading} className="px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold w-full disabled:opacity-50">
                  {uploading ? "جاري الإنشاء..." : `إطلاق المسابقة (${questions.length} ${questions.length === 1 ? "سؤال" : "أسئلة"})`}
                </button>
              </div>
            )}
          </div>
        )}

        {active ? (
          <CompetitionView comp={active} uid={uid!} onBack={() => { setActive(null); load(); }} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {comps.length === 0 ? (
              <div className="text-center text-muted-foreground py-16 text-sm col-span-full">لا توجد مسابقات بعد</div>
            ) : comps.map((c) => {
              const timePassed = c.ends_at ? new Date(c.ends_at) < new Date() : false;
              const userDone = userSubmittedIds.has(c.id);
              const showWinner = userDone || timePassed;
              const qCount = Array.isArray(c.questions) ? c.questions.length : 1;
              const onDelete = async (e: React.MouseEvent) => {
                e.stopPropagation();
                if (!confirm("حذف المسابقة نهائياً؟")) return;
                if (c.image_url) {
                  try {
                    const urlObj = new URL(c.image_url);
                    const parts = urlObj.pathname.split("/competition-media/");
                    if (parts[1]) await supabase.storage.from("competition-media").remove([parts[1]]);
                  } catch {}
                }
                const { error } = await supabase.from("competitions").delete().eq("id", c.id);
                if (error) return toast.error("لا تملك صلاحية الحذف");
                toast.success("تم الحذف");
                setComps((p) => p.filter((x) => x.id !== c.id));
              };
              return (
                <div key={c.id} className="relative">
                  <button onClick={() => setActive(c)} className="w-full text-right bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition">
                    {c.image_url && <img src={c.image_url} alt="" className="w-full h-40 object-cover" />}
                    <div className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <h3 className="font-bold">{c.title}</h3>
                          <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.question}</p>
                        </div>
                        <span className={`text-xs px-2 py-1 rounded-full shrink-0 font-semibold ${userDone ? "bg-secondary text-muted-foreground" : "bg-emerald-100 text-emerald-700"}`}>
                          {userDone ? "شاركت ✓" : "● نشطة"}
                        </span>
                      </div>
                      <div className="text-[11px] text-muted-foreground mt-2">{qCount} {qCount === 1 ? "سؤال" : "أسئلة"}</div>
                      {showWinner && <CompetitionWinner competitionId={c.id} />}
                    </div>
                  </button>
                  {canCreate && (
                    <button onClick={onDelete} className="absolute top-2 left-2 p-1.5 rounded-lg bg-destructive/90 text-white hover:bg-destructive shadow" title="حذف">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function QuestionEditor({ index, q, onChange, onRemove, canRemove }: { index: number; q: MQ; onChange: (patch: Partial<MQ>) => void; onRemove: () => void; canRemove: boolean }) {
  const qRef = useRef<HTMLTextAreaElement>(null);
  const aRef = useRef<HTMLInputElement>(null);
  return (
    <div className="rounded-2xl border-2 border-border bg-secondary/30 p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-black">السؤال {index + 1}</div>
        {canRemove && (
          <button onClick={onRemove} className="text-destructive p-1 rounded-lg hover:bg-destructive/10"><Trash2 className="h-4 w-4" /></button>
        )}
      </div>
      <textarea ref={qRef} value={q.question} onChange={(e) => onChange({ question: e.target.value })} placeholder="نص السؤال" rows={2} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background resize-none" />
      <MathToolbar targetRef={qRef} onChange={(v) => onChange({ question: v })} />
      <div className="flex items-center gap-3 text-sm">
        <label className="inline-flex items-center gap-2">
          <input type="radio" checked={q.is_multiple_choice} onChange={() => onChange({ is_multiple_choice: true })} /> اختيارات متعددة
        </label>
        <label className="inline-flex items-center gap-2">
          <input type="radio" checked={!q.is_multiple_choice} onChange={() => onChange({ is_multiple_choice: false })} /> إجابة نصية
        </label>
      </div>
      {q.is_multiple_choice ? (
        <div className="space-y-2">
          {(q.options || []).map((opt, i) => (
            <div key={i} className="flex items-center gap-2">
              <input type="radio" name={`correct-${index}`} checked={q.correct_index === i} onChange={() => onChange({ correct_index: i })} className="h-4 w-4" />
              <input value={opt} onChange={(e) => onChange({ options: (q.options || []).map((o, j) => (j === i ? e.target.value : o)) })}
                placeholder={`الخيار ${i + 1}`}
                className={`flex-1 px-3 py-2 rounded-xl border bg-background ${q.correct_index === i ? "border-emerald-500" : "border-border"}`} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <input ref={aRef} value={q.correct_answer || ""} onChange={(e) => onChange({ correct_answer: e.target.value })} placeholder="الإجابة الصحيحة" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background" />
          <MathToolbar targetRef={aRef} onChange={(v) => onChange({ correct_answer: v })} />
        </>
      )}
      <div className="flex items-center gap-2">
        <label className="text-sm font-bold inline-flex items-center gap-1"><Clock className="h-4 w-4" /> مؤقت السؤال (ثانية):</label>
        <input type="number" min={3} value={q.duration_seconds} onChange={(e) => onChange({ duration_seconds: parseInt(e.target.value) || 5 })} className="w-24 px-3 py-1.5 rounded-xl border border-border bg-background" />
      </div>
    </div>
  );
}

function CompetitionView({ comp, uid, onBack }: { comp: Comp; uid: string; onBack: () => void }) {
  const isMulti = Array.isArray(comp.questions) && comp.questions.length > 0;
  return isMulti
    ? <MultiQuestionView comp={comp} uid={uid} onBack={onBack} />
    : <SingleCompetitionView comp={comp} uid={uid} onBack={onBack} />;
}

function MultiQuestionView({ comp, uid, onBack }: { comp: Comp; uid: string; onBack: () => void }) {
  const [questions, setQuestions] = useState<MQ[] | null>(null);
  const [idx, setIdx] = useState(0);
  // answers: { questionIdx -> option TEXT (for MC) or typed text }
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [textAnswer, setTextAnswer] = useState("");
  const [now, setNow] = useState(Date.now());
  const [questionStartedAt, setQuestionStartedAt] = useState<number>(Date.now());
  const [submittedResult, setSubmittedResult] = useState<{ correct: number; total: number } | null>(null);
  const [alreadyDone, setAlreadyDone] = useState(false);
  const [startTime] = useState(Date.now());
  const [isTeacher, setIsTeacher] = useState<boolean | null>(null);
  // Store question texts + student answers for result review (no correct answers needed)
  const [reviewData, setReviewData] = useState<{ question: string; userAnswer: string; options?: string[] }[] | null>(null);
  const submitting = useRef(false);
  // Local ref to questions for use in callbacks
  const questionsRef = useRef<MQ[] | null>(null);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      const teacher = !!roles?.some((r) => ["admin", "teacher", "supervisor"].includes(String(r.role)));
      setIsTeacher(teacher);

      const { data: existing } = await supabase.from("competition_submissions").select("id, correct_count, question_count").eq("competition_id", comp.id).eq("user_id", uid).maybeSingle();
      if (existing) {
        setAlreadyDone(true);
        if (existing.correct_count != null) setSubmittedResult({ correct: existing.correct_count, total: existing.question_count || 0 });
      }

      // Load questions for students who haven't submitted yet, or teachers
      if (!existing || teacher) {
        const { data, error } = await supabase.rpc("get_competition_for_attempt", { _id: comp.id });
        if (error) { toast.error(error.message); return; }
        const row: any = Array.isArray(data) ? data[0] : data;
        const qs = (row?.questions as MQ[] | null) || (comp.questions as MQ[]);
        setQuestions(qs && qs.length ? qs : null);
        questionsRef.current = qs && qs.length ? qs : null;
        setQuestionStartedAt(Date.now());
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.id, uid]);

  useEffect(() => {
    if (alreadyDone || submittedResult || isTeacher) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [alreadyDone, submittedResult, isTeacher]);

  const finalize = async (finalAnswers: Record<string, string>) => {
    if (submitting.current) return;
    submitting.current = true;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const { data, error } = await supabase.rpc("submit_competition_attempt", {
      _competition_id: comp.id, _answers: finalAnswers as any, _time_taken_seconds: elapsed,
    });
    submitting.current = false;
    if (error) { toast.error(error.message); return; }
    const r: any = Array.isArray(data) ? data[0] : data;
    const correct = r?.correct_count ?? 0;
    const total = r?.question_count ?? (questionsRef.current?.length ?? 0);
    setSubmittedResult({ correct, total });

    // Build review data — for MC map stored index back to option text for display
    const qs = questionsRef.current;
    if (qs) {
      setReviewData(qs.map((q, qi) => {
        const raw = finalAnswers[String(qi)];
        let display = raw ?? "—";
        if (q.is_multiple_choice && q.options && raw !== undefined) {
          const idx = parseInt(raw, 10);
          if (!isNaN(idx) && q.options[idx] !== undefined) display = q.options[idx];
        }
        return { question: q.question, userAnswer: display, options: q.options };
      }));
    }
    toast.success(`انتهت المسابقة! أصبت ${correct} من ${total} 🎉`);
  };

  const goNext = (storedAnswers: Record<string, string>) => {
    const qs = questionsRef.current;
    if (!qs) return;
    if (idx + 1 >= qs.length) {
      finalize(storedAnswers);
    } else {
      setIdx(idx + 1);
      setTextAnswer("");
      setQuestionStartedAt(Date.now());
    }
  };

  // val: for MC = option TEXT, for text = typed string
  const recordAnswer = (val: string) => {
    if (isTeacher) return;
    const qs = questionsRef.current;
    if (!qs) return;
    const next = { ...answers, [String(idx)]: val };
    setAnswers(next);
    goNext(next);
  };

  // Compute derived values needed by the auto-advance hook (safe to compute before returns)
  const currentQ = questions?.[idx];
  const remaining = currentQ ? Math.max(0, Math.ceil((questionStartedAt + currentQ.duration_seconds * 1000 - now) / 1000)) : 0;

  // Auto-advance when timer hits 0 — must be declared BEFORE any conditional return
  useEffect(() => {
    if (isTeacher || !currentQ || alreadyDone || submittedResult) return;
    if (remaining <= 0) {
      const next = { ...answers, [String(idx)]: answers[String(idx)] ?? "" };
      setAnswers(next);
      goNext(next);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remaining, isTeacher]);

  // Loading state until we know if teacher or not
  if (isTeacher === null) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> العودة للقائمة
        </button>
        <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
      </div>
    );
  }

  // Teachers skip the quiz — go directly to submissions and comments
  if (isTeacher) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> العودة للقائمة
        </button>
        <div className="bg-card rounded-3xl border border-border p-6">
          <h2 className="text-2xl font-black mb-2">{comp.title}</h2>
          {comp.image_url && <img src={comp.image_url} alt="" className="w-full max-h-72 object-contain rounded-2xl mb-4 bg-secondary/30" />}
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 rounded-2xl p-4 text-amber-700 font-bold text-sm mb-4">
            👁️ وضع المراجعة — يمكنك مشاهدة إجابات الطلاب والتعليق، لكن لا تشارك في الإجابة
          </div>
          <Reactions targetType="competition" targetId={comp.id} uid={uid} />
        </div>
        <CompetitionComments competitionId={comp.id} uid={uid} />
        <SubmissionsList comp={comp} uid={uid} isTeacher={true} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> العودة للقائمة
      </button>
      <div className="bg-card rounded-3xl border border-border p-6">
        <h2 className="text-2xl font-black mb-2">{comp.title}</h2>
        {comp.image_url && <img src={comp.image_url} alt="" className="w-full max-h-72 object-contain rounded-2xl mb-4 bg-secondary/30" />}

        {alreadyDone || submittedResult ? (
          <div className="space-y-4">
            {/* بطاقة "أنا أستطيع ذلك" */}
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 rounded-2xl p-6 text-center">
              <div className="text-5xl mb-3">🌟</div>
              <div className="text-emerald-700 dark:text-emerald-400 font-black text-2xl mb-2">أنا أستطيع ذلك!</div>
              {submittedResult && (
                <>
                  <div className="text-2xl font-black mt-2 mb-1">
                    {submittedResult.correct} / {submittedResult.total}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {submittedResult.correct === submittedResult.total
                      ? "🎉 ممتاز! إجابات صحيحة بالكامل!"
                      : submittedResult.correct > submittedResult.total / 2
                      ? "👏 أداء جيد — استمر في المحاولة!"
                      : "💪 لا تستسلم — المحاولة والتعلم هما المفتاح!"}
                  </div>
                </>
              )}
              {alreadyDone && !submittedResult && (
                <div className="text-sm text-muted-foreground mt-2">لقد شاركت في هذه المسابقة سابقاً</div>
              )}
            </div>

            {/* مراجعة الإجابات — تعرض إجابة الطالب فقط بدون الكشف عن الصواب والخطأ */}
            {reviewData && reviewData.length > 0 && (
              <div className="space-y-3">
                <h3 className="font-black text-lg">إجاباتك</h3>
                {reviewData.map((rd, qi) => (
                  <div key={qi} className="rounded-2xl border border-border bg-secondary/30 p-4">
                    <p className="font-bold text-sm leading-relaxed mb-2">
                      <span className="text-muted-foreground text-xs me-1">{qi + 1}.</span>
                      <MathText text={rd.question} />
                    </p>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">إجابتك:</span>
                      <span className="font-bold bg-card px-2 py-0.5 rounded-lg border border-border">
                        <MathText text={rd.userAnswer || "—"} />
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : !questions ? (
          <div className="text-center py-8 text-muted-foreground">جاري التحميل...</div>
        ) : currentQ ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm font-bold text-muted-foreground">السؤال {idx + 1} من {questions.length}</div>
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-black ${remaining <= 3 ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"}`}>
                <Clock className="h-4 w-4" /> {remaining}ث
              </div>
            </div>
            <div className="w-full bg-secondary rounded-full h-2 overflow-hidden">
              <div className="bg-[image:var(--gradient-hero)] h-full transition-all" style={{ width: `${(remaining / currentQ.duration_seconds) * 100}%` }} />
            </div>
            <p className="text-xl font-bold leading-relaxed"><MathText text={currentQ.question} /></p>
            {currentQ.is_multiple_choice && currentQ.options && currentQ.options.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-2">
                {currentQ.options.map((opt, i) => (
                  // Send the option INDEX (as string) — RPC compares selected index against stored correct_index
                  <button key={i} onClick={() => recordAnswer(String(i))}
                    className="text-right px-4 py-3 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition font-bold">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm me-2">{['أ','ب','ج','د','هـ','و'][i] ?? String(i+1)}</span>
                    <MathText text={opt} />
                  </button>
                ))}
              </div>
            ) : (
              <div className="flex gap-2">
                <input value={textAnswer} onChange={(e) => setTextAnswer(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && textAnswer.trim()) recordAnswer(textAnswer.trim()); }}
                  placeholder="اكتب إجابتك ثم اضغط Enter"
                  className="flex-1 px-4 py-3 rounded-xl border border-border bg-background" autoFocus />
                <button onClick={() => textAnswer.trim() && recordAnswer(textAnswer.trim())} className="px-5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold">
                  <Send className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        ) : null}

        <div className="mt-4">
          <Reactions targetType="competition" targetId={comp.id} uid={uid} />
        </div>
      </div>

      <CompetitionComments competitionId={comp.id} uid={uid} />
      {/* Show participants list to students after submission */}
      <SubmissionsList comp={comp} uid={uid} isTeacher={false} />
    </div>
  );
}

function SingleCompetitionView({ comp, uid, onBack }: { comp: Comp; uid: string; onBack: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [isTeacher, setIsTeacher] = useState(false);
  const [subImage, setSubImage] = useState<File | null>(null);
  const [subLink, setSubLink] = useState("");
  const [sending, setSending] = useState(false);
  const startMs = comp.starts_at ? new Date(comp.starts_at).getTime() : Date.now();
  const endMs = comp.ends_at ? new Date(comp.ends_at).getTime() : Infinity;
  const remaining = comp.ends_at ? Math.max(0, Math.floor((endMs - now) / 1000)) : Infinity;
  const ended = comp.ends_at ? remaining === 0 : false;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      setIsTeacher(!!roles?.some((r) => ["admin", "teacher", "supervisor"].includes(String(r.role))));
      const { data } = await supabase.from("competition_submissions").select("id").eq("competition_id", comp.id).eq("user_id", uid);
      setSubmitted(!!data?.length);
    })();
  }, [uid, comp.id]);

  const submitMC = async (opt: string) => {
    if (isTeacher || submitted || ended || sending) return;
    setSending(true);
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    // Send option TEXT for text-based comparison in RPC
    const { error } = await supabase.from("competition_submissions").insert({
      competition_id: comp.id, user_id: uid, answer: opt,
      time_taken_seconds: elapsed, is_correct: false,
    });
    setSending(false);
    if (error) return toast.error("فشل الإرسال: " + error.message);
    setSubmitted(true);
  };

  const submit = async () => {
    if (submitted || ended) return;
    if (!answer.trim() && !subImage && !subLink.trim()) { toast.error("أضف إجابة أو صورة أو رابط"); return; }
    setSending(true);
    let image_url: string | null = null;
    if (subImage) image_url = await uploadToBucket("competition-media", subImage, uid);
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    const { error } = await supabase.from("competition_submissions").insert({
      competition_id: comp.id, user_id: uid, answer: answer.trim() || "—",
      image_url, link_url: subLink.trim() || null,
      time_taken_seconds: elapsed, is_correct: false,
    });
    setSending(false);
    if (error) return toast.error("فشل الإرسال: " + error.message);
    setSubmitted(true); setAnswer(""); setSubImage(null); setSubLink("");
  };

  const mins = isFinite(remaining) ? Math.floor(remaining / 60) : 0;
  const secs = isFinite(remaining) ? remaining % 60 : 0;

  // Teacher view: skip quiz, go straight to submissions
  if (isTeacher) {
    return (
      <div className="space-y-4">
        <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> العودة للقائمة
        </button>
        <div className="bg-card rounded-3xl border border-border p-6">
          <h2 className="text-2xl font-black mb-2">{comp.title}</h2>
          {comp.image_url && <img src={comp.image_url} alt="" className="w-full max-h-80 object-contain rounded-2xl mb-4 bg-secondary/30" />}
          <p className="text-lg mb-4 leading-relaxed"><MathText text={comp.question} /></p>
          <div className="bg-amber-50 dark:bg-amber-950/40 border border-amber-200 rounded-2xl p-4 text-amber-700 font-bold text-sm mb-4">
            👁️ وضع المراجعة — يمكنك مشاهدة إجابات الطلاب والتعليق، لكن لا تشارك في الإجابة
          </div>
          <Reactions targetType="competition" targetId={comp.id} uid={uid} />
        </div>
        <CompetitionComments competitionId={comp.id} uid={uid} />
        <SubmissionsList comp={comp} uid={uid} isTeacher={true} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> العودة للقائمة
      </button>
      <div className="bg-card rounded-3xl border border-border p-6">
        <h2 className="text-2xl font-black mb-2">{comp.title}</h2>

        {/* Timer — hidden if teacher */}
        {!isTeacher && (
          <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold mb-4 ${ended ? "bg-secondary" : "bg-amber-100 text-amber-700"}`}>
            <Clock className="h-4 w-4" />
            {ended ? "انتهت المسابقة" : !comp.ends_at ? "مفتوحة" : `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`}
          </div>
        )}

        {comp.image_url && <img src={comp.image_url} alt="" className="w-full max-h-80 object-contain rounded-2xl mb-4 bg-secondary/30" />}
        <p className="text-lg mb-4 leading-relaxed"><MathText text={comp.question} /></p>

        {submitted ? (
          /* بطاقة "أنا أستطيع ذلك" بعد الإرسال */
          <div className="bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 rounded-2xl p-6 text-center mb-4">
            <div className="text-5xl mb-3">🌟</div>
            <div className="text-emerald-700 dark:text-emerald-400 font-black text-2xl">أنا أستطيع ذلك!</div>
            <div className="text-sm text-muted-foreground mt-2">تم تسجيل مشاركتك بنجاح ✓</div>
          </div>
        ) : !ended ? (
          <div className="space-y-2">
            {comp.is_multiple_choice && comp.options && comp.options.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-2">
                {comp.options.map((opt, i) => (
                  <button key={i} disabled={sending} onClick={() => submitMC(opt)}
                    className="text-right px-4 py-3 rounded-xl border-2 border-border hover:border-primary hover:bg-primary/5 transition font-bold disabled:opacity-50">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary/10 text-primary text-sm me-2">{['أ','ب','ج','د','هـ','و'][i] ?? String(i+1)}</span>
                    <MathText text={opt} />
                  </button>
                ))}
              </div>
            ) : (
              <>
                <input value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="إجابتك..." className="w-full px-4 py-3 rounded-xl border border-border bg-background" />
                <div className="flex gap-2 flex-wrap items-center">
                  <label className="inline-flex items-center gap-1 text-sm px-3 py-2 rounded-xl bg-secondary cursor-pointer hover:bg-secondary/70">
                    <ImageIcon className="h-4 w-4" /> صورة
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => setSubImage(e.target.files?.[0] || null)} />
                  </label>
                  {subImage && <span className="text-xs text-muted-foreground">{subImage.name}</span>}
                  <div className="flex-1 min-w-[200px] inline-flex items-center gap-1 bg-background border border-border rounded-xl px-3">
                    <Link2 className="h-4 w-4 text-muted-foreground" />
                    <input value={subLink} onChange={(e) => setSubLink(e.target.value)} placeholder="رابط (اختياري)" className="flex-1 py-2 bg-transparent outline-none text-sm" />
                  </div>
                  <button onClick={submit} disabled={sending} className="px-5 py-3 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        ) : null}

        <Reactions targetType="competition" targetId={comp.id} uid={uid} />
      </div>

      <CompetitionComments competitionId={comp.id} uid={uid} />
      <SubmissionsList comp={comp} uid={uid} isTeacher={false} />
    </div>
  );
}

function SubmissionsList({ comp, uid, isTeacher }: { comp: Comp; uid: string; isTeacher: boolean }) {
  const [subs, setSubs] = useState<(Sub & { name?: string; avatar_url?: string | null })[]>([]);
  const isMulti = Array.isArray(comp.questions) && comp.questions.length > 0;

  const loadSubs = async () => {
    const { data } = await supabase.from("competition_submissions").select("*").eq("competition_id", comp.id);
    const ids = (data || []).map((s) => s.user_id);
    const { data: profs } = ids.length ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids) : { data: [] };
    const nameMap: Record<string, { name: string; avatar: string | null }> = {};
    (profs || []).forEach((p: any) => { nameMap[p.id] = { name: p.display_name || "—", avatar: p.avatar_url }; });
    const list = (data || []).map((s: any) => ({ ...s, name: nameMap[s.user_id]?.name, avatar_url: nameMap[s.user_id]?.avatar }))
      .sort((a: any, b: any) => {
        if (isMulti) return (b.correct_count || 0) - (a.correct_count || 0) || a.time_taken_seconds - b.time_taken_seconds;
        return Number(b.is_correct) - Number(a.is_correct) || a.time_taken_seconds - b.time_taken_seconds;
      });
    // Assign rank only to those who got at least one correct in multi-question (or is_correct in single)
    let rankCounter = 0;
    list.forEach((s: any) => {
      const hasCorrect = isMulti ? (s.correct_count || 0) > 0 : !!s.is_correct;
      s._rank = hasCorrect ? ++rankCounter : null;
    });
    setSubs(list);
  };

  useEffect(() => {
    loadSubs();
    const ch = supabase.channel(`comp-subs-${comp.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_submissions", filter: `competition_id=eq.${comp.id}` },
        () => loadSubs()).subscribe();
    const poll = setInterval(() => loadSubs(), 20000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.id]);

  const markCorrect = async (subId: string, current: boolean) => {
    const { error } = await supabase.from("competition_submissions")
      .update({ is_correct: !current, teacher_approved: !current, approved_by: uid })
      .eq("id", subId);
    if (error) return toast.error(error.message);
    toast.success(!current ? "تم اعتماد الإجابة كصحيحة ✓" : "تم إلغاء الاعتماد");
    loadSubs();
  };

  return (
    <div className="bg-card rounded-3xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold flex items-center gap-2"><Crown className="h-5 w-5 text-amber-500" /> المتسابقون ({subs.length})</h3>
        <button onClick={loadSubs} className="text-xs px-3 py-1.5 rounded-lg bg-secondary hover:bg-secondary/70 font-bold">↻ تحديث</button>
      </div>
      {subs.length === 0 ? (
        <div className="text-center text-sm text-muted-foreground py-6">لا توجد مشاركات بعد</div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {subs.map((s) => (
            <div key={s.id} className="bg-secondary/40 rounded-2xl p-3 space-y-2">
              <div className="flex items-center gap-2">
                {s._rank != null ? (
                  <div className={`w-7 h-7 rounded-full text-xs font-black flex items-center justify-center ${s._rank === 1 ? "bg-amber-400 text-white" : s._rank === 2 ? "bg-gray-300 text-gray-700" : s._rank === 3 ? "bg-amber-700/70 text-white" : "bg-amber-100 text-amber-700"}`}>
                    {s._rank === 1 ? "🥇" : s._rank === 2 ? "🥈" : s._rank === 3 ? "🥉" : `#${s._rank}`}
                  </div>
                ) : (
                  <div className="w-7 h-7 rounded-full bg-secondary text-muted-foreground text-xs font-bold flex items-center justify-center">—</div>
                )}
                {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-[image:var(--gradient-hero)]" />}
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{s.name}</div>
                  <div className="text-[10px] text-muted-foreground">{s.time_taken_seconds}ث</div>
                </div>
                {isMulti ? (
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${(s.correct_count || 0) > 0 ? "bg-emerald-100 text-emerald-700" : "bg-secondary text-muted-foreground"}`}>
                    {s.correct_count ?? 0}/{s.question_count ?? 0}
                  </span>
                ) : (
                  s.is_correct && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">صحيح ✓</span>
                )}
              </div>
              {s.image_url && <img src={s.image_url} alt="" className="w-full max-h-56 object-contain rounded-xl bg-background" />}
              {/* Show answer text only to teachers */}
              {isTeacher && !isMulti && s.answer && s.answer !== "—" && (
                <div className="text-sm bg-background rounded-xl p-2"><b>الإجابة:</b> {s.answer}</div>
              )}
              {s.link_url && (
                <a href={s.link_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline break-all">
                  <Link2 className="h-3 w-3" /> {s.link_url}
                </a>
              )}
              {!isMulti && isTeacher && (
                <button onClick={() => markCorrect(s.id, s.is_correct)}
                  className={`w-full text-xs px-2 py-1.5 rounded-lg font-bold ${s.is_correct ? "bg-rose-100 text-rose-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {s.is_correct ? "إلغاء الاعتماد" : "اعتماد كإجابة صحيحة ✓"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CompetitionComments({ competitionId, uid }: { competitionId: string; uid: string }) {
  const [list, setList] = useState<any[]>([]);
  const [text, setText] = useState("");
  const [isMod, setIsMod] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("competition_comments").select("*")
      .eq("competition_id", competitionId).order("created_at", { ascending: true });
    const ids = [...new Set((data || []).map((c: any) => c.user_id))];
    const { data: profs } = ids.length ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
    const map: Record<string, string> = {};
    (profs || []).forEach((p: any) => { map[p.id] = p.display_name || "—"; });
    setList((data || []).map((c: any) => ({ ...c, name: map[c.user_id] })));
  };

  useEffect(() => {
    load();
    const ch = supabase.channel(`comp-comments-${competitionId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "competition_comments", filter: `competition_id=eq.${competitionId}` }, async (payload) => {
        const newComment = payload.new as any;
        const { data: prof } = await supabase.from("profiles").select("id, display_name").eq("id", newComment.user_id).maybeSingle();
        setList((prev) => {
          if (prev.some((c) => c.id === newComment.id)) return prev;
          return [...prev, { ...newComment, name: (prof as any)?.display_name || "—" }];
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "competition_comments", filter: `competition_id=eq.${competitionId}` }, (payload) => {
        setList((prev) => prev.filter((c) => c.id !== (payload.old as any).id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [competitionId]);

  useEffect(() => {
    supabase.from("user_roles").select("role").eq("user_id", uid).then(({ data }) => {
      setIsMod(!!data?.some((r) => ["admin", "supervisor"].includes(String(r.role))));
    });
  }, [uid]);

  const send = async () => {
    if (!text.trim()) return;
    const { error } = await supabase.from("competition_comments").insert({ competition_id: competitionId, user_id: uid, content: text.trim() });
    if (error) return toast.error("فشل الإرسال: " + error.message);
    setText("");
    load();
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("competition_comments").delete().eq("id", id);
    if (error) return toast.error("لا يمكن الحذف");
  };

  return (
    <div className="bg-card rounded-3xl border border-border p-6">
      <h3 className="font-bold mb-3 flex items-center gap-2"><MessageCircle className="h-5 w-5" /> التعليقات ({list.length})</h3>
      <div className="space-y-2 max-h-72 overflow-y-auto mb-3">
        {list.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">لا توجد تعليقات</div>
        ) : list.map((c) => (
          <div key={c.id} className="text-sm bg-secondary/50 rounded-xl p-3 flex justify-between gap-2 items-start">
            <div className="flex-1"><b>{c.name}: </b>{c.content}</div>
            <div className="flex items-center gap-2 shrink-0">
              <ReportButton targetKind="competition_comment" targetId={c.id} content={c.content} label="" />
              {(c.user_id === uid || isMod) && (
                <button onClick={() => del(c.id)} className="text-destructive text-lg leading-none">×</button>
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-2">
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="اكتب تعليقاً..." className="flex-1 px-4 py-2 rounded-xl border border-border bg-background" />
        <button onClick={send} disabled={!text.trim()} className="px-4 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CompetitionWinner({ competitionId }: { competitionId: string }) {
  const [winner, setWinner] = useState<{ name: string; score?: string; time?: number } | null>(null);
  useEffect(() => {
    (async () => {
      const { data: subs } = await supabase.from("competition_submissions")
        .select("user_id, is_correct, correct_count, question_count, time_taken_seconds")
        .eq("competition_id", competitionId);
      if (!subs?.length) return;
      const sorted = [...subs].sort((a: any, b: any) => {
        const ac = a.correct_count ?? (a.is_correct ? 1 : 0);
        const bc = b.correct_count ?? (b.is_correct ? 1 : 0);
        return bc - ac || a.time_taken_seconds - b.time_taken_seconds;
      });
      const top: any = sorted[0];
      if (!top) return;
      // Show winner even with score 0 (participation counts)
      const { data: prof } = await supabase.from("profiles").select("display_name").eq("id", top.user_id).maybeSingle();
      const score = top.question_count
        ? `${top.correct_count ?? 0}/${top.question_count}`
        : (top.is_correct ? "✓" : "");
      setWinner({ name: (prof as any)?.display_name || "—", score, time: top.time_taken_seconds });
    })();
  }, [competitionId]);
  if (!winner) return null;
  const formatTime = (s: number) => s >= 60 ? `${Math.floor(s/60)}د ${s%60}ث` : `${s}ث`;
  return (
    <div className="mt-2 flex flex-wrap gap-1">
      <div className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-amber-100 text-amber-800 font-bold">
        <Crown className="h-3 w-3" /> الأول: {winner.name}
      </div>
      {winner.score && (
        <div className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-emerald-100 text-emerald-700 font-bold">
          🏆 {winner.score}
        </div>
      )}
      {winner.time != null && (
        <div className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-full bg-blue-100 text-blue-700 font-bold">
          <Clock className="h-3 w-3" /> {formatTime(winner.time)}
        </div>
      )}
    </div>
  );
}
