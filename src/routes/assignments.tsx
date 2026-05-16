import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, ClipboardList, Plus, X, Clock, Paperclip, FileText, MessageSquare, Check, ShieldAlert, CheckSquare, Square, Trash2, Printer } from "lucide-react";
import { toast } from "sonner";
import { MathToolbar } from "@/components/MathToolbar";
import { MathText } from "@/components/MathText";
import { DateTimePicker } from "@/components/DateTimePicker";
import { SCHOOLS } from "@/lib/schools";

export const Route = createFileRoute("/assignments")({ component: AssignmentsPage });

type A = { id: string; teacher_id: string; title: string; description: string | null; subject: string; due_at: string | null; created_at: string; teacher_name?: string };

function printAssignment(a: A) {
  const school = a.subject || "";
  const teacher = a.teacher_name || "";
  const dueStr = a.due_at ? new Date(a.due_at).toLocaleString("ar-EG") : "";
  const html = `<!DOCTYPE html><html dir="rtl" lang="ar"><head><meta charset="UTF-8"><title>${a.title}</title>
  <style>body{font-family:Arial,sans-serif;margin:20mm;color:#000;direction:rtl}.hdr{text-align:center;border-bottom:2px solid #000;padding-bottom:12px;margin-bottom:16px}.hdr h1{font-size:17px;margin:0 0 4px}.info{font-size:12px;color:#444}.atitle{font-size:15px;font-weight:bold;margin-bottom:12px}.desc{line-height:1.8;font-size:13px;margin-bottom:20px}.ans{border:1px solid #ccc;height:200px;border-radius:8px}@media print{body{margin:10mm}}</style>
  </head><body>
  <div class="hdr"><h1>مبادرة كلنا معاً — محافظة الوسطى</h1>
  <div class="info">${school ? `مدرسة: ${school}` : ""}${teacher ? ` ◦ المعلم: ${teacher}` : ""}${dueStr ? ` ◦ موعد التسليم: ${dueStr}` : ""}</div></div>
  <div class="atitle">📋 واجب: ${a.title}</div>
  ${a.description ? `<div class="desc">${a.description}</div>` : ""}
  <div class="ans"></div>
  </body></html>`;
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, "_blank");
  if (!w) { alert("يرجى السماح بفتح نوافذ جديدة في المتصفح"); URL.revokeObjectURL(url); return; }
  setTimeout(() => { w.print(); setTimeout(() => URL.revokeObjectURL(url), 60000); }, 800);
}
type S = { id: string; assignment_id: string; student_id: string; content: string | null; file_url: string | null; grade: number | null; feedback: string | null; created_at: string };

function AssignmentsPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [isParent, setIsParent] = useState(false);
  const [list, setList] = useState<A[]>([]);
  const [active, setActive] = useState<A | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState(""); const [desc, setDesc] = useState(""); const [due, setDue] = useState(""); const [subject, setSubject] = useState(SCHOOLS[0]);
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
      if ((profile as any)?.role_type === "parent") { setIsParent(true); return; }
      const manageRoles = ["admin", "teacher", "supervisor"];
      const fromTable = !!roles?.some((r) => manageRoles.includes(String(r.role)));
      const fromProfile = manageRoles.includes(String((profile as any)?.role_type || ""));
      setIsTeacher(fromTable || fromProfile);
      setIsAdmin(!!roles?.some((r) => ["admin", "supervisor"].includes(String(r.role))));
      load(id);
    });
  }, [navigate]);

  const [isAdmin, setIsAdmin] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [mySubIds, setMySubIds] = useState<Set<string>>(new Set());

  const load = async (userId?: string) => {
    const id = userId ?? uid;
    const [{ data }, { data: mySubs }] = await Promise.all([
      supabase.from("assignments").select("*").order("created_at", { ascending: false }),
      id ? supabase.from("assignment_submissions").select("assignment_id").eq("student_id", id) : Promise.resolve({ data: [] }),
    ]);
    const assignments = (data || []) as A[];
    const tids = [...new Set(assignments.map((a) => a.teacher_id).filter(Boolean))];
    const { data: profs } = tids.length
      ? await supabase.from("profiles").select("id, display_name").in("id", tids)
      : { data: [] };
    const nameMap: Record<string, string> = {};
    (profs || []).forEach((p: any) => { nameMap[p.id] = p.display_name || ""; });
    setList(assignments.map((a) => ({ ...a, teacher_name: nameMap[a.teacher_id] || "" })));
    setMySubIds(new Set(((mySubs as any[]) || []).map((s) => s.assignment_id)));
  };

  useEffect(() => {
    if (!uid) return;
    const ch = supabase.channel(`assignments-subs-${uid}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "assignment_submissions", filter: `student_id=eq.${uid}` }, (p: any) => {
        setMySubIds((prev) => new Set([...prev, p.new.assignment_id]));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(list.map((i) => i.id)));
  const clearSelect = () => { setSelected(new Set()); setSelectMode(false); };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`حذف ${selected.size} واجب نهائياً؟`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    const { error } = await supabase.from("assignments").delete().in("id", ids);
    setBulkDeleting(false);
    if (error) return toast.error("فشل الحذف: " + error.message);
    toast.success(`تم حذف ${ids.length} واجب ✨`);
    setList((p) => p.filter((i) => !ids.includes(i.id)));
    setSelected(new Set()); setSelectMode(false);
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
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center text-white"><ClipboardList className="h-5 w-5" /></div>
            <h1 className="font-bold">الواجبات</h1>
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
          <span className="text-sm font-bold text-rose-700">{selected.size} محدد</span>
          <button onClick={selectAll} className="text-xs px-3 py-1 rounded-lg bg-rose-100 text-rose-700 font-bold hover:bg-rose-200">تحديد الكل ({list.length})</button>
          <button onClick={clearSelect} className="text-xs px-3 py-1 rounded-lg bg-secondary font-bold hover:bg-secondary/70">إلغاء</button>
          <button onClick={bulkDelete} disabled={selected.size === 0 || bulkDeleting}
            className="mr-auto inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-rose-600 text-white text-sm font-bold disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> {bulkDeleting ? "جاري الحذف..." : `حذف (${selected.size})`}
          </button>
        </div>
      )}
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
                  {SCHOOLS.map((s) => <option key={s} value={s}>{s}</option>)}
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
            : list.map((a) => {
              const canDelete = isTeacher;
              const isSelected = selected.has(a.id);
              const onDelete = async (e: React.MouseEvent) => {
                e.stopPropagation();
                if (!confirm("حذف الواجب نهائياً؟")) return;
                const { error } = await supabase.from("assignments").delete().eq("id", a.id);
                if (error) return toast.error("لا تملك صلاحية الحذف");
                toast.success("تم الحذف");
                setList((p) => p.filter((x) => x.id !== a.id));
              };
              return (
              <div key={a.id} className={`flex items-stretch gap-2 ${isSelected && selectMode ? "ring-2 ring-rose-400 rounded-2xl" : ""}`}>
                {selectMode && isAdmin && (
                  <button onClick={() => toggleSelect(a.id)} className="flex items-center shrink-0 pr-1">
                    {isSelected ? <CheckSquare className="h-5 w-5 text-rose-500" /> : <Square className="h-5 w-5 text-muted-foreground" />}
                  </button>
                )}
                <button onClick={() => selectMode ? toggleSelect(a.id) : setActive(a)} className="flex-1 text-right bg-card rounded-2xl border border-border p-4 hover:shadow-lg transition min-w-0">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-bold">{a.title}</div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {!isTeacher && (
                        mySubIds.has(a.id)
                          ? <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 font-bold flex items-center gap-0.5"><Check className="h-2.5 w-2.5" /> شاركت</span>
                          : <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 font-bold">● نشطة</span>
                      )}
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-[var(--brand)]/10 text-[var(--brand)] font-bold">🏫 {a.subject || SCHOOLS[0]}</span>
                    </div>
                  </div>
                  {(a as any).teacher_name && <div className="text-[11px] text-muted-foreground mt-0.5">المعلم: {(a as any).teacher_name}</div>}
                  {a.description && <div className="text-xs text-muted-foreground mt-1 line-clamp-2"><MathText text={a.description} /></div>}
                  {a.due_at && <div className="text-xs text-amber-600 mt-2 inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {new Date(a.due_at).toLocaleString("ar-EG")}</div>}
                  {!isTeacher && <div className="mt-3 text-xs font-bold text-[var(--brand)]">اضغطي هنا لكتابة الحل أو رفع ملف ←</div>}
                </button>
                {isTeacher && !selectMode && (
                  <div className="flex flex-col gap-1 justify-center shrink-0">
                    <button onClick={(e) => { e.stopPropagation(); printAssignment(a); }} className="p-1.5 rounded-lg bg-secondary hover:bg-secondary/80" title="طباعة">
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

function AssignmentView({ a, uid, isTeacher, onBack }: { a: A; uid: string; isTeacher: boolean; onBack: () => void }) {
  const [subs, setSubs] = useState<(S & { name?: string })[]>([]);
  const [content, setContent] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);
  const [mySub, setMySub] = useState<S | null>(null);

  const [gradingItem, setGradingItem] = useState<{ sid: string; score: number; label: string } | null>(null);
  const [feedbackInput, setFeedbackInput] = useState("");
  const [commentingId, setCommentingId] = useState<string | null>(null);
  const [commentText, setCommentText] = useState("");

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

  const grade = async (sid: string, score: number) => {
    const fb = feedbackInput.trim() || null;
    const { error } = await supabase.from("assignment_submissions")
      .update({ grade: score, feedback: fb, graded_by: uid, graded_at: new Date().toISOString() })
      .eq("id", sid);
    if (error) return toast.error(error.message);
    toast.success(`تم التصحيح${fb ? " مع التعليق" : ""} ✅`);
    setGradingItem(null);
    setFeedbackInput("");
    load();
  };

  const addCommentOnly = async (sid: string) => {
    if (!commentText.trim()) return toast.error("اكتب تعليقاً");
    const { error } = await supabase.from("assignment_submissions")
      .update({ feedback: commentText.trim(), graded_by: uid, graded_at: new Date().toISOString() })
      .eq("id", sid);
    if (error) return toast.error(error.message);
    toast.success("تم إضافة التعليق 💬");
    setCommentingId(null);
    setCommentText("");
    load();
  };

  const isOwner = uid === a.teacher_id;
  const showAnswerBox = !isTeacher && !mySub;
  const showSubmissionsList = isTeacher || isOwner;

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

        {isTeacher && (
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-2xl border border-amber-200 dark:border-amber-700 p-4 text-sm text-amber-800 dark:text-amber-200 font-bold">
            👁‍🗨 أنت في وضع المراجعة — يمكنك تصحيح إجابات الطلاب وإضافة تعليقات
          </div>
        )}

        {!isTeacher && mySub && (
          <div className="bg-card rounded-3xl border border-border p-6">
            <h3 className="font-bold mb-2">إجابتك (تم التسليم) ✅</h3>
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
            {mySub.grade === null && (
              <div className="mt-3 p-3 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm">
                ⏳ بانتظار تصحيح المعلم
              </div>
            )}
          </div>
        )}

        {showSubmissionsList && (
          <div className="bg-card rounded-3xl border border-border p-6">
            <h3 className="font-bold mb-3">تسليمات الطلاب ({subs.length})</h3>
            {subs.length === 0
              ? <div className="text-sm text-muted-foreground">لا توجد تسليمات بعد</div>
              : <div className="space-y-4">
                {subs.map((s) => (
                  <div key={s.id} className="p-4 rounded-2xl border border-border bg-background">
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-bold text-sm">{s.name}</div>
                      {s.grade !== null && (
                        <span className={`text-xs px-2 py-1 rounded-full font-bold ${s.grade >= 10 ? "bg-emerald-100 text-emerald-700" : s.grade >= 5 ? "bg-amber-100 text-amber-700" : "bg-rose-100 text-rose-700"}`}>
                          {s.grade >= 10 ? "✅ صحيحة" : s.grade >= 5 ? `${s.grade}/10` : "❌ خطأ"}
                        </span>
                      )}
                    </div>
                    {s.content && <div className="text-sm whitespace-pre-wrap mb-2 p-3 bg-secondary/40 rounded-xl"><MathText text={s.content} /></div>}
                    {s.file_url && (
                      <a href={s.file_url} target="_blank" rel="noreferrer" className="mb-2 inline-flex items-center gap-2 text-xs text-[var(--brand)] font-bold">
                        <FileText className="h-3.5 w-3.5" /> عرض المرفق
                      </a>
                    )}
                    {s.feedback && (
                      <div className="mb-2 flex items-start gap-1.5 text-xs text-muted-foreground bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-xl p-2">
                        <MessageSquare className="h-3.5 w-3.5 mt-0.5 text-blue-500 shrink-0" />
                        <span><MathText text={s.feedback} /></span>
                      </div>
                    )}

                    {gradingItem?.sid === s.id ? (
                      <div className="mt-2 space-y-2 bg-secondary/30 rounded-xl p-3">
                        <div className="text-xs font-bold text-muted-foreground">
                          تصحيح: <span className="text-foreground">{gradingItem.label}</span>
                        </div>
                        <textarea
                          value={feedbackInput}
                          onChange={(e) => setFeedbackInput(e.target.value)}
                          placeholder="تعليق للطالب... (اختياري)"
                          rows={2}
                          className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => grade(s.id, gradingItem.score)}
                            className="flex items-center gap-1 text-xs px-4 py-2 rounded-xl bg-emerald-500 text-white font-bold hover:bg-emerald-600 transition"
                          >
                            <Check className="h-3.5 w-3.5" /> تأكيد
                          </button>
                          <button
                            onClick={() => { setGradingItem(null); setFeedbackInput(""); }}
                            className="text-xs px-4 py-2 rounded-xl bg-secondary font-bold hover:bg-secondary/80 transition"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    ) : commentingId === s.id ? (
                      <div className="mt-2 space-y-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                        <div className="text-xs font-bold text-blue-700 dark:text-blue-300 flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" /> إضافة تعليق
                        </div>
                        <textarea
                          value={commentText}
                          onChange={(e) => setCommentText(e.target.value)}
                          placeholder="اكتب تعليقك للطالب..."
                          rows={2}
                          className="w-full px-3 py-2 rounded-xl border border-blue-200 bg-background text-sm resize-none"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => addCommentOnly(s.id)}
                            className="flex items-center gap-1 text-xs px-4 py-2 rounded-xl bg-blue-500 text-white font-bold hover:bg-blue-600 transition"
                          >
                            <Check className="h-3.5 w-3.5" /> حفظ التعليق
                          </button>
                          <button
                            onClick={() => { setCommentingId(null); setCommentText(""); }}
                            className="text-xs px-4 py-2 rounded-xl bg-secondary font-bold hover:bg-secondary/80 transition"
                          >
                            إلغاء
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2 flex-wrap mt-2">
                        <button
                          onClick={() => { setGradingItem({ sid: s.id, score: 10, label: "✅ صحيحة" }); setFeedbackInput(""); }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-emerald-500 text-white font-bold hover:bg-emerald-600 transition"
                        >✅ صحيحة</button>
                        <button
                          onClick={() => { setGradingItem({ sid: s.id, score: 0, label: "❌ خطأ" }); setFeedbackInput(""); }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-rose-500 text-white font-bold hover:bg-rose-600 transition"
                        >❌ خطأ</button>
                        {[5, 6, 7, 8, 9].map((g) => (
                          <button
                            key={g}
                            onClick={() => { setGradingItem({ sid: s.id, score: g, label: `${g}/10` }); setFeedbackInput(""); }}
                            className="text-xs px-2.5 py-1.5 rounded-lg bg-secondary font-bold hover:bg-secondary/80 transition"
                          >{g}/10</button>
                        ))}
                        <button
                          onClick={() => { setCommentingId(s.id); setCommentText(s.feedback || ""); }}
                          className="text-xs px-3 py-1.5 rounded-lg bg-blue-100 text-blue-700 font-bold hover:bg-blue-200 transition flex items-center gap-1"
                        >
                          <MessageSquare className="h-3 w-3" /> تعليق فقط
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            }
          </div>
        )}
      </main>
    </div>
  );
}
