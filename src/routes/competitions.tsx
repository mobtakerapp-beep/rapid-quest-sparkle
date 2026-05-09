import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy, Plus, Clock, Send, X, Crown, MessageCircle, Image as ImageIcon, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Reactions } from "@/components/Reactions";
import { MathToolbar } from "@/components/MathToolbar";
import { MathText } from "@/components/MathText";
import { ReportButton } from "@/components/ReportButton";

export const Route = createFileRoute("/competitions")({ component: CompetitionsPage });

type Comp = { id: string; title: string; description: string | null; question: string; image_url: string | null; duration_seconds: number; starts_at: string; ends_at: string; created_by: string; is_multiple_choice?: boolean | null; options?: string[] | null };
type Sub = { id: string; user_id: string; answer: string; image_url: string | null; link_url: string | null; submitted_at: string; time_taken_seconds: number; is_correct: boolean };

async function uploadToBucket(bucket: string, file: File, uid: string): Promise<string | null> {
  const ext = file.name.split(".").pop() || "bin";
  const path = `${uid}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
  if (error) { toast.error("فشل رفع الملف: " + error.message); return null; }
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function CompetitionsPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [canCreate, setCanCreate] = useState(false);
  const [comps, setComps] = useState<Comp[]>([]);
  const [active, setActive] = useState<Comp | null>(null);
  const [showForm, setShowForm] = useState(false);
  // form
  const [title, setTitle] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [duration, setDuration] = useState(300);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [isMC, setIsMC] = useState(true);
  const [options, setOptions] = useState<string[]>(["", "", "", ""]);
  const [correctIdx, setCorrectIdx] = useState(0);
  const questionRef = useRef<HTMLTextAreaElement>(null);
  const answerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      setUid(data.session.user.id);
      // Verified by code only (user_roles), self-set profiles.role_type does NOT count
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id);
      setCanCreate(!!roles?.some((r) => ["admin", "teacher", "supervisor"].includes(String(r.role))));
      load();
    });
  }, [navigate]);

  const load = async () => {
    const { data } = await supabase.from("competitions").select("*").order("starts_at", { ascending: false }).limit(50);
    setComps((data || []) as Comp[]);
  };

  const create = async () => {
    if (!uid || !title.trim() || !question.trim()) { toast.error("أكمل البيانات"); return; }
    if (isMC) {
      const filled = options.map((o) => o.trim()).filter(Boolean);
      if (filled.length < 2) { toast.error("أضف خيارين على الأقل"); return; }
      if (!options[correctIdx]?.trim()) { toast.error("حدد الإجابة الصحيحة"); return; }
    } else if (!answer.trim()) {
      toast.error("أدخل الإجابة الصحيحة"); return;
    }
    setUploading(true);
    let image_url: string | null = null;
    if (imageFile) image_url = await uploadToBucket("competition-media", imageFile, uid);
    const starts = new Date();
    const ends = new Date(starts.getTime() + duration * 1000);
    const cleanOptions = isMC ? options.map((o) => o.trim()).filter(Boolean) : null;
    const { data: created, error } = await supabase.from("competitions").insert({
      title: title.trim(), question: question.trim(),
      image_url,
      duration_seconds: duration, starts_at: starts.toISOString(), ends_at: ends.toISOString(),
      created_by: uid,
      is_multiple_choice: isMC,
      options: cleanOptions as any,
    } as any).select("id").single();
    if (error) { setUploading(false); return toast.error(error.message); }
    if (created?.id) {
      const secret: any = { competition_id: created.id };
      if (isMC) {
        secret.correct_index = correctIdx;
        secret.correct_answer = options[correctIdx]?.trim() || null;
      } else {
        secret.correct_answer = answer.trim();
      }
      await supabase.from("competition_secrets" as any).insert(secret);
    }
    setUploading(false);
    toast.success("تم إنشاء المسابقة 🏆");
    setTitle(""); setQuestion(""); setAnswer(""); setImageFile(null); setShowForm(false);
    setOptions(["", "", "", ""]); setCorrectIdx(0); setIsMC(true);
    load();
  };

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
              <div className="bg-card rounded-3xl border border-border p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold">مسابقة جديدة</h3>
                  <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
                </div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان المسابقة" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background" />
                <textarea ref={questionRef} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="السؤال (يدعم الكسور والجذور)" rows={3} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background resize-none" />
                <MathToolbar targetRef={questionRef} onChange={setQuestion} />
                <div className="flex items-center gap-3 text-sm">
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" checked={isMC} onChange={() => setIsMC(true)} /> اختيارات متعددة (أسرع)
                  </label>
                  <label className="inline-flex items-center gap-2">
                    <input type="radio" checked={!isMC} onChange={() => setIsMC(false)} /> إجابة نصية
                  </label>
                </div>
                {isMC ? (
                  <div className="space-y-2">
                    <div className="text-xs text-muted-foreground">حدّد الإجابة الصحيحة بالنقر على الدائرة بجانبها</div>
                    {options.map((opt, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <input type="radio" name="correct" checked={correctIdx === i} onChange={() => setCorrectIdx(i)} className="h-4 w-4" />
                        <input value={opt} onChange={(e) => setOptions((p) => p.map((o, j) => (j === i ? e.target.value : o)))}
                          placeholder={`الخيار ${i + 1}`}
                          className={`flex-1 px-4 py-2 rounded-xl border bg-background ${correctIdx === i ? "border-emerald-500" : "border-border"}`} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <input ref={answerRef} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="الإجابة الصحيحة (للتحقق التلقائي)" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background" />
                    <MathToolbar targetRef={answerRef} onChange={setAnswer} />
                  </>
                )}
                <div>
                  <label className="block text-sm font-bold mb-1 inline-flex items-center gap-1"><ImageIcon className="h-4 w-4" /> صورة للمسابقة (اختياري)</label>
                  <input type="file" accept="image/*" onChange={(e) => setImageFile(e.target.files?.[0] || null)} className="text-sm" />
                  {imageFile && <div className="text-xs text-muted-foreground mt-1">{imageFile.name}</div>}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm">مدة المسابقة (ثانية):</label>
                  <input type="number" value={duration} onChange={(e) => setDuration(parseInt(e.target.value) || 300)} className="w-32 px-3 py-2 rounded-xl border border-border bg-background" />
                </div>
                <button onClick={create} disabled={uploading} className="px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold w-full disabled:opacity-50">
                  {uploading ? "جاري الإنشاء..." : "إطلاق المسابقة"}
                </button>
              </div>
            )}
          </div>
        )}

        {active ? (
          <CompetitionView comp={active} uid={uid!} onBack={() => setActive(null)} />
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {comps.length === 0 ? (
              <div className="text-center text-muted-foreground py-16 text-sm col-span-full">لا توجد مسابقات بعد</div>
            ) : comps.map((c) => {
              const ended = new Date(c.ends_at) < new Date();
              return (
                <button key={c.id} onClick={() => setActive(c)} className="text-right bg-card rounded-2xl border border-border overflow-hidden hover:shadow-lg transition">
                  {c.image_url && <img src={c.image_url} alt="" className="w-full h-40 object-cover" />}
                  <div className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex-1">
                        <h3 className="font-bold">{c.title}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1">{c.question}</p>
                      </div>
                      <span className={`text-xs px-2 py-1 rounded-full shrink-0 ${ended ? "bg-secondary text-muted-foreground" : "bg-emerald-100 text-emerald-700"}`}>
                        {ended ? "انتهت" : "نشطة"}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function CompetitionView({ comp, uid, onBack }: { comp: Comp; uid: string; onBack: () => void }) {
  const [now, setNow] = useState(Date.now());
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [subs, setSubs] = useState<(Sub & { name?: string; avatar_url?: string | null })[]>([]);
  const [isTeacher, setIsTeacher] = useState(false);
  const [subImage, setSubImage] = useState<File | null>(null);
  const [subLink, setSubLink] = useState("");
  const [sending, setSending] = useState(false);
  const startMs = new Date(comp.starts_at).getTime();
  const endMs = new Date(comp.ends_at).getTime();
  const remaining = Math.max(0, Math.floor((endMs - now) / 1000));
  const ended = remaining === 0;

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    (async () => {
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      setIsTeacher(!!roles?.some((r) => ["admin", "teacher", "supervisor"].includes(String(r.role))));
    })();
  }, [uid]);

  const loadSubs = async () => {
    const { data } = await supabase.from("competition_submissions").select("*").eq("competition_id", comp.id);
    const ids = (data || []).map((s) => s.user_id);
    const { data: profs } = ids.length ? await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids) : { data: [] };
    const nameMap: Record<string, { name: string; avatar: string | null }> = {};
    (profs || []).forEach((p: any) => { nameMap[p.id] = { name: p.display_name || "—", avatar: p.avatar_url }; });
    const list = (data || []).map((s: any) => ({ ...s, name: nameMap[s.user_id]?.name, avatar_url: nameMap[s.user_id]?.avatar }))
      .sort((a: any, b: any) => Number(b.is_correct) - Number(a.is_correct) || a.time_taken_seconds - b.time_taken_seconds);
    setSubs(list);
    setSubmitted(!!data?.find((s) => s.user_id === uid));
  };

  useEffect(() => {
    loadSubs();
    const ch = supabase.channel(`comp-${comp.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "competition_submissions", filter: `competition_id=eq.${comp.id}` },
        () => loadSubs()).subscribe();
    return () => { supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comp.id]);

  const submit = async () => {
    if (submitted || ended) return;
    if (!answer.trim() && !subImage && !subLink.trim()) { toast.error("أضف إجابة أو صورة أو رابط"); return; }
    setSending(true);
    let image_url: string | null = null;
    if (subImage) image_url = await uploadToBucket("competition-media", subImage, uid);
    const elapsed = Math.floor((Date.now() - startMs) / 1000);
    const isCorrect = false; // التصحيح يتم من قِبل المعلم عبر markCorrect
    const { error } = await supabase.from("competition_submissions").insert({
      competition_id: comp.id, user_id: uid, answer: answer.trim() || "—",
      image_url, link_url: subLink.trim() || null,
      time_taken_seconds: elapsed, is_correct: isCorrect,
    });
    setSending(false);
    if (error) return toast.error("فشل الإرسال: " + error.message);
    toast.success(isCorrect ? "إجابة صحيحة! 🎉" : "تم تسجيل مشاركتك");
    setSubmitted(true); setAnswer(""); setSubImage(null); setSubLink("");
  };

  const markCorrect = async (subId: string, current: boolean) => {
    const { error } = await supabase.from("competition_submissions")
      .update({ is_correct: !current, teacher_approved: !current, approved_by: uid })
      .eq("id", subId);
    if (error) return toast.error(error.message);
    toast.success(!current ? "تم اعتماد الإجابة كصحيحة ✓" : "تم إلغاء الاعتماد");
    loadSubs();
  };

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;

  return (
    <div className="space-y-4">
      <button onClick={onBack} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> العودة للقائمة
      </button>
      <div className="bg-card rounded-3xl border border-border p-6">
        <h2 className="text-2xl font-black mb-2">{comp.title}</h2>
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full font-bold mb-4 ${ended ? "bg-secondary" : "bg-amber-100 text-amber-700"}`}>
          <Clock className="h-4 w-4" />
          {ended ? "انتهت المسابقة" : `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`}
        </div>
        {comp.image_url && <img src={comp.image_url} alt="" className="w-full max-h-80 object-contain rounded-2xl mb-4 bg-secondary/30" />}
        <p className="text-lg mb-4 leading-relaxed"><MathText text={comp.question} /></p>
        {!ended && !submitted && (
          <div className="space-y-2">
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
          </div>
        )}
        {submitted && <div className="text-emerald-600 font-bold">✓ تم تسجيل مشاركتك</div>}
        <Reactions targetType="competition" targetId={comp.id} uid={uid} />
      </div>

      <CompetitionComments competitionId={comp.id} uid={uid} />

      <div className="bg-card rounded-3xl border border-border p-6">
        <h3 className="font-bold mb-4 flex items-center gap-2"><Crown className="h-5 w-5 text-amber-500" /> مشاركات المتسابقين ({subs.length})</h3>
        {subs.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-6">لا توجد مشاركات بعد</div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-3">
            {subs.map((s, i) => (
              <div key={s.id} className="bg-secondary/40 rounded-2xl p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 text-xs font-black flex items-center justify-center">#{i + 1}</div>
                  {s.avatar_url ? <img src={s.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" /> : <div className="w-8 h-8 rounded-full bg-[image:var(--gradient-hero)]" />}
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{s.name}</div>
                    <div className="text-[10px] text-muted-foreground">{s.time_taken_seconds}ث</div>
                  </div>
                  {s.is_correct && <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">صحيح ✓</span>}
                </div>
                {s.image_url && <img src={s.image_url} alt="" className="w-full max-h-56 object-contain rounded-xl bg-background" />}
                {s.answer && s.answer !== "—" && <div className="text-sm bg-background rounded-xl p-2"><b>الإجابة:</b> {s.answer}</div>}
                {s.link_url && (
                  <a href={s.link_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline break-all">
                    <Link2 className="h-3 w-3" /> {s.link_url}
                  </a>
                )}
                {isTeacher && (
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [competitionId]);
  useEffect(() => {
    supabase.from("user_roles").select("role").eq("user_id", uid).then(({ data }) => {
      setIsMod(!!data?.some((r) => ["admin","supervisor"].includes(String(r.role))));
    });
  }, [uid]);

  const send = async () => {
    if (!text.trim()) return;
    const { error } = await supabase.from("competition_comments").insert({ competition_id: competitionId, user_id: uid, content: text.trim() });
    if (error) return toast.error("فشل الإرسال: " + error.message);
    setText(""); load();
  };

  const del = async (id: string) => {
    const { error } = await supabase.from("competition_comments").delete().eq("id", id);
    if (error) return toast.error("لا يمكن الحذف");
    setList((p) => p.filter((c) => c.id !== id));
  };

  return (
    <div className="bg-card rounded-3xl border border-border p-6">
      <h3 className="font-bold mb-3 flex items-center gap-2"><MessageCircle className="h-5 w-5" /> التعليقات</h3>
      <div className="space-y-2 max-h-72 overflow-y-auto mb-3">
        {list.length === 0 ? (
          <div className="text-sm text-muted-foreground text-center py-4">لا توجد تعليقات</div>
        ) : list.map((c) => (
          <div key={c.id} className="text-sm bg-secondary/50 rounded-xl p-3 flex justify-between gap-2 items-start">
            <div className="flex-1"><b>{c.name}: </b>{c.content}</div>
            <div className="flex items-center gap-2">
              <ReportButton targetKind="competition_comment" targetId={c.id} content={c.content} label="" />
              {(c.user_id === uid || isMod) && <button onClick={() => del(c.id)} className="text-destructive">×</button>}
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
