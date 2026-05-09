import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ClipboardList, Plus, X, Clock, Paperclip, FileText } from "lucide-react";
import { toast } from "sonner";
import { MathToolbar } from "@/components/MathToolbar";
import { MathText } from "@/components/MathText";
import { DateTimePicker } from "@/components/DateTimePicker";

export const Route = createFileRoute("/assignments")({ component: AssignmentsPage });

type A = { id: string; teacher_id: string; title: string; description: string | null; subject: string; due_at: string | null; created_at: string };
type S = { id: string; assignment_id: string; student_id: string; content: string | null; file_url: string | null; grade: number | null; feedback: string | null; created_at: string };

function AssignmentsPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [roleType, setRoleType] = useState<string | null>(null);
  const [list, setList] = useState<A[]>([]);
  const [active, setActive] = useState<A | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [due, setDue] = useState(""); const [subject, setSubject] = useState("الرياضيات");
  const SUBJECTS = ["الرياضيات", "اللغة العربية", "العلوم", "الدراسات الاجتماعية", "اللغة الإنجليزية", "التربية الإسلامية", "أخرى"];
  const descRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const id = data.session.user.id;
      setUid(id);
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("profiles").select("role_type").eq("id", id).maybeSingle(),
      ]);
      setRoleType((profile as any)?.role_type || null);
      setIsTeacher(!!roles?.some((r) => ["admin", "teacher", "supervisor"].includes(String(r.role))));
      load();
    });
  }, [navigate]);

  const load = async () => {
    const { data } = await supabase.from("assignments").select("*").order("created_at", { ascending: false });
    setList((data || []) as A[]);
  };

  const create = async () => {
    if (!uid || !title.trim()) return toast.error("أدخل العنوان");
    const { error } = await supabase.from("assignments").insert({
      teacher_id: uid, title: title.trim(), description: desc.trim() || null, subject,
      due_at: due ? new Date(due).toISOString() : null,
    });
    if (error) return toast.error(error.message);
    toast.success("تم إنشاء الواجب 📝");
    setTitle(""); setDesc(""); setDue(""); setShowForm(false);
    load();
  };

  if (active && uid) return <AssignmentView a={active} uid={uid} isTeacher={isTeacher} onBack={() => setActive(null)} />;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="h-4 w-4" /> الرئيسية</Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white"><ClipboardList className="h-5 w-5" /></div>
            <h1 className="font-bold">الواجبات</h1>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {isTeacher && (
          <div className="mb-6">
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[image:var(--gradient-hero)] text-white font-bold"><Plus className="h-5 w-5" /> واجب جديد</button>
            ) : (
              <div className="bg-card rounded-3xl border border-border p-5 space-y-3">
                <div className="flex items-center justify-between"><h3 className="font-bold">واجب جديد</h3><button onClick={() => setShowForm(false)}><X className="h-4 w-4" /></button></div>
                <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان الواجب" className="w-full px-4 py-2.5 rounded-xl border border-border bg-background" />
                <select value={subject} onChange={(e) => setSubject(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background">
                  {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <textarea ref={descRef} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="الوصف والتعليمات (يدعم الكسور [٢/٣] والجذور √(٩))" rows={3} className="w-full px-4 py-2.5 rounded-xl border border-border bg-background resize-none" />
                <MathToolbar targetRef={descRef} onChange={setDesc} />
                <label className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> موعد التسليم (التاريخ والوقت)</label>
                <DateTimePicker value={due} onChange={setDue} placeholder="موعد التسليم" />
                <button onClick={create} className="w-full px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold">إنشاء</button>
              </div>
            )}
          </div>
        )}
        <div className="grid gap-3">
          {list.length === 0 ? <div className="text-center text-muted-foreground py-16 text-sm">لا توجد واجبات</div>
            : list.map((a) => (
              <button key={a.id} onClick={() => setActive(a)} className="text-right bg-card rounded-2xl border border-border p-4 hover:shadow-lg transition">
                <div className="flex items-center justify-between gap-2">
                  <div className="font-bold">{a.title}</div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] font-bold">{a.subject || "عام"}</span>
                </div>
                {a.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2"><MathText text={a.description} /></div>}
                {a.due_at && <div className="text-xs text-amber-600 mt-2 inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(a.due_at).toLocaleString("ar-EG")}</div>}
                {!isTeacher && <div className="mt-3 text-xs font-bold text-[var(--brand)]">اضغطي هنا لكتابة الحل أو رفع ملف ←</div>}
              </button>
            ))}
        </div>
      </main>
    </div>
  );
}

function AssignmentView({ a, uid, isTeacher, onBack }: { a: A; uid: string; isTeacher: boolean; onBack: () => void }) {
  const [subs, setSubs] = useState<(S & { name?: string })[]>([]);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [mySub, setMySub] = useState<S | null>(null);

  const load = async () => {
    const { data } = await supabase.from("assignment_submissions").select("*").eq("assignment_id", a.id);
    const ids = (data || []).map((s) => s.student_id);
    const { data: profs } = ids.length ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
    const m: Record<string, string> = {};
    (profs || []).forEach((p: any) => { m[p.id] = p.display_name || "—"; });
    setSubs((data || []).map((s: any) => ({ ...s, name: m[s.student_id] })));
    setMySub((data || []).find((s) => s.student_id === uid) || null);
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [a.id]);

  const submit = async () => {
    if (!content.trim() && !file) return toast.error("أضف نصاً أو ملفاً");
    setUploading(true);
    let file_url: string | null = null;
    try {
      if (file) {
        if (file.size > 20 * 1024 * 1024) { setUploading(false); return toast.error("الملف كبير (الحد 20 ميجا)"); }
        const ext = file.name.split(".").pop();
        const path = `${uid}/${a.id}-${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("assignment-files").upload(path, file);
        if (upErr) { setUploading(false); return toast.error("فشل رفع الملف"); }
        file_url = supabase.storage.from("assignment-files").getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("assignment_submissions").insert({
        assignment_id: a.id, student_id: uid, content: content.trim() || null, file_url,
      });
      if (error) { setUploading(false); return toast.error(error.message); }
      toast.success("تم تسليم الواجب ✅"); setContent(""); setFile(null); load();
    } finally { setUploading(false); }
  };

  const grade = async (sid: string, g: number, label: string) => {
    const fb = prompt("ملاحظة (اختياري):") || null;
    const { error } = await supabase.from("assignment_submissions").update({ grade: g, feedback: fb, graded_by: uid, graded_at: new Date().toISOString() }).eq("id", sid);
    if (error) return toast.error(error.message);
    toast.success(`تم التصحيح: ${label}`); load();
  };

  const isOwner = uid === a.teacher_id;
  const showAnswerBox = !isOwner && !mySub;
  const showSubmissionsList = isOwner || isTeacher;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3"><button onClick={onBack} className="text-sm inline-flex items-center gap-1"><ArrowLeft className="h-4 w-4" /> العودة</button></div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-3xl space-y-4">
        <div className="bg-card rounded-3xl border border-border p-6">
          <h2 className="text-2xl font-black mb-2">{a.title}</h2>
          {a.description && <div className="text-muted-foreground mb-3"><MathText text={a.description} /></div>}
          {a.due_at && <div className="text-xs text-amber-600">📅 تسليم: {new Date(a.due_at).toLocaleString("ar-EG")}</div>}
        </div>

        {showAnswerBox && (
          <div className="bg-card rounded-3xl border border-border p-6 space-y-3">
            <h3 className="font-bold">إجابتك</h3>
            <textarea ref={contentRef} value={content} onChange={(e) => setContent(e.target.value)} rows={5} placeholder="اكتب إجابتك هنا (يدعم الكسور والجذور)..." className="w-full px-4 py-3 rounded-xl border border-border bg-background resize-none" />
            <MathToolbar targetRef={contentRef} onChange={setContent} />
            <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-border bg-background cursor-pointer hover:bg-secondary/50 transition">
              <Paperclip className="h-4 w-4" />
              <span className="text-sm flex-1 truncate">{file ? file.name : "إرفاق صورة أو ملف (PDF, مستند) — اختياري"}</span>
              <input type="file" className="hidden" accept="image/*,application/pdf,.doc,.docx,.txt" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </label>
            {file && <button onClick={() => setFile(null)} className="text-xs text-destructive">إزالة الملف</button>}
            <button onClick={submit} disabled={uploading} className="w-full px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
              {uploading ? "جاري التسليم..." : "تسليم الواجب"}
            </button>
          </div>
        )}
        {!isOwner && mySub && (
          <div className="bg-card rounded-3xl border border-border p-6">
            <h3 className="font-bold mb-2">إجابتك (تم التسليم)</h3>
            {mySub.content && <div className="text-sm whitespace-pre-wrap"><MathText text={mySub.content} /></div>}
            {mySub.file_url && (
              <a href={mySub.file_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-2 text-sm text-[var(--brand)] font-bold">
                <FileText className="h-4 w-4" /> عرض المرفق
              </a>
            )}
            {mySub.grade !== null && (
              <div className={`mt-3 p-3 rounded-xl border ${mySub.grade >= 10 ? "bg-emerald-50 border-emerald-200 text-emerald-700" : mySub.grade >= 5 ? "bg-amber-50 border-amber-200 text-amber-700" : "bg-rose-50 border-rose-200 text-rose-700"}`}>
                <div className="font-bold">{mySub.grade >= 10 ? "✅ إجابة صحيحة" : mySub.grade >= 5 ? `جيد — ${mySub.grade}/10` : "❌ إجابة غير صحيحة"}</div>
                {mySub.feedback && <div className="text-sm mt-1">💬 <MathText text={mySub.feedback} /></div>}
              </div>
            )}
          </div>
        )}

        {showSubmissionsList && (
          <div className="bg-card rounded-3xl border border-border p-6">
            <h3 className="font-bold mb-3">تسليمات الطلاب ({subs.length})</h3>
            {subs.length === 0 ? <div className="text-sm text-muted-foreground">لا توجد تسليمات</div>
              : <div className="space-y-3">
                {subs.map((s) => (
                  <div key={s.id} className="p-4 rounded-xl border border-border">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-bold">{s.name}</div>
                      {s.grade !== null && (
                        <span className={`text-xs px-2 py-1 rounded-full ${s.grade >= 10 ? "bg-emerald-100 text-emerald-700" : s.grade >= 5 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                          {s.grade >= 10 ? "✅ صحيحة" : s.grade >= 5 ? `${s.grade}/10` : "❌ خطأ"}
                        </span>
                      )}
                    </div>
                    {s.content && <div className="text-sm whitespace-pre-wrap mb-2"><MathText text={s.content} /></div>}
                    {s.file_url && (
                      <a href={s.file_url} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-2 text-xs text-[var(--brand)] font-bold">
                        <FileText className="h-3.5 w-3.5" /> عرض المرفق
                      </a>
                    )}
                    <div className="flex gap-2 flex-wrap mt-2">
                      <button onClick={() => grade(s.id, 10, "صحيحة")} className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-bold">✅ صحيحة</button>
                      <button onClick={() => grade(s.id, 0, "خطأ")} className="text-xs px-3 py-1.5 rounded-lg bg-rose-500 text-white font-bold">❌ خطأ</button>
                      {[5, 6, 7, 8, 9].map((g) => (
                        <button key={g} onClick={() => grade(s.id, g, `${g}/10`)} className="text-xs px-2.5 py-1.5 rounded-lg bg-secondary font-bold">{g}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>}
          </div>
        )}
      </main>
    </div>
  );
}
