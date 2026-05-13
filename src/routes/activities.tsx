import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, BookOpen, Upload, FileText, Download, Trash2, Video, Image as ImageIcon, File as FileIcon, Plus, X, CheckCircle2, Clock, MessageCircle, Send, ShieldAlert, CheckSquare, Square } from "lucide-react";
import { Reactions } from "@/components/Reactions";
import { MathToolbar } from "@/components/MathToolbar";
import { MathText } from "@/components/MathText";

export const Route = createFileRoute("/activities")({ component: ActivitiesPage });

type Activity = {
  id: string;
  user_id: string;
  subject: string;
  title: string;
  description: string | null;
  file_url: string;
  file_type: string;
  file_name: string | null;
  created_at: string;
  status: string;
};

const SUBJECTS = ["اللغة العربية", "الرياضيات", "العلوم", "الدراسات الاجتماعية", "اللغة الإنجليزية", "التربية الإسلامية", "التربية الفنية", "أخرى"];

const fileIcon = (type: string) => {
  if (type.startsWith("image/")) return ImageIcon;
  if (type.startsWith("video/")) return Video;
  if (type.includes("pdf") || type.includes("document") || type.includes("text")) return FileText;
  return FileIcon;
};

function ActivitiesPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [canUpload, setCanUpload] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<Activity[]>([]);
  const [activeSubject, setActiveSubject] = useState<string>("الكل");
  const [showForm, setShowForm] = useState(false);
  const [subject, setSubject] = useState(SUBJECTS[0]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const descRef = useRef<HTMLTextAreaElement>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const id = data.session.user.id;
      setUid(id);
      const [{ data: roles }, { data: profile }] = await Promise.all([
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("profiles").select("role_type").eq("id", id).maybeSingle(),
      ]);
      const roleList = (roles || []).map((r: any) => String(r.role));
      const rt = profile?.role_type || "";
      const admin = roleList.some((r) => ["admin", "supervisor"].includes(r)) || ["admin", "supervisor"].includes(rt);
      const privileged = admin || roleList.some((r) => r === "teacher") || rt === "teacher";
      setIsAdmin(admin);
      setCanUpload(privileged);
      load();
    });
  }, [navigate]);

  const load = async () => {
    const { data } = await supabase.from("activities").select("*").order("created_at", { ascending: false }).limit(200);
    setItems((data || []) as Activity[]);
  };

  const upload = async () => {
    if (!uid || !title.trim()) { toast.error("أكمل البيانات"); return; }
    if (file && file.size > 50 * 1024 * 1024) { toast.error("الملف كبير (الحد 50 ميجا)"); return; }
    setUploading(true);
    try {
      let publicUrl = "";
      let fileType = "text/plain";
      let fileName: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${uid}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("activity-files").upload(path, file);
        if (upErr) throw upErr;
        publicUrl = supabase.storage.from("activity-files").getPublicUrl(path).data.publicUrl;
        fileType = file.type || "application/octet-stream";
        fileName = file.name;
      } else {
        if (!desc.trim()) { toast.error("اكتب نص النشاط أو ارفع ملفاً"); setUploading(false); return; }
      }
      const { error } = await supabase.from("activities").insert({
        user_id: uid, subject, title: title.trim(), description: desc.trim() || null,
        file_url: publicUrl, file_type: fileType, file_name: fileName,
      });
      if (error) throw error;
      toast.success("تم رفع النشاط ✨");
      setTitle(""); setDesc(""); setFile(null); setShowForm(false);
      load();
    } catch (e: any) {
      toast.error(e.message ? `فشل الرفع: ${e.message}` : "فشل الرفع");
    } finally { setUploading(false); }
  };

  const del = async (id: string) => {
    if (!confirm("حذف النشاط؟")) return;
    const item = items.find((i) => i.id === id);
    const { error } = await supabase.from("activities").delete().eq("id", id);
    if (error) return toast.error("فشل الحذف");
    if (item?.file_url) {
      const marker = "/storage/v1/object/public/activity-files/";
      const idx = item.file_url.indexOf(marker);
      if (idx !== -1) {
        const path = decodeURIComponent(item.file_url.slice(idx + marker.length).split("?")[0]);
        await supabase.storage.from("activity-files").remove([path]);
      }
    }
    setItems((p) => p.filter((i) => i.id !== id));
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(filtered.map((i) => i.id)));
  const clearSelect = () => { setSelected(new Set()); setSelectMode(false); };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`حذف ${selected.size} نشاط نهائياً من الأرشيف والتخزين؟`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    for (const item of items.filter((i) => ids.includes(i.id) && i.file_url)) {
      if (!item.file_url) continue;
      const marker = "/storage/v1/object/public/activity-files/";
      const idx = item.file_url.indexOf(marker);
      if (idx !== -1) {
        const path = decodeURIComponent(item.file_url.slice(idx + marker.length).split("?")[0]);
        await supabase.storage.from("activity-files").remove([path]);
      }
    }
    const { error } = await supabase.from("activities").delete().in("id", ids);
    setBulkDeleting(false);
    if (error) return toast.error("فشل الحذف: " + error.message);
    toast.success(`تم حذف ${ids.length} نشاط وتحرير المساحة ✨`);
    setItems((p) => p.filter((i) => !ids.includes(i.id)));
    setSelected(new Set()); setSelectMode(false);
  };

  const approve = async (id: string) => {
    const { error } = await supabase.from("activities").update({ status: "approved" }).eq("id", id);
    if (error) return toast.error("فشل الاعتماد");
    toast.success("تم اعتماد النشاط ✅");
    setItems((p) => p.map((i) => i.id === id ? { ...i, status: "approved" } : i));
  };

  const filtered = activeSubject === "الكل" ? items : items.filter((i) => i.subject === activeSubject);

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10 backdrop-blur bg-card/90">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white">
              <BookOpen className="h-5 w-5" />
            </div>
            <h1 className="font-bold">بنك الأنشطة</h1>
            {isAdmin && (
              <button onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition ${selectMode ? "bg-rose-100 text-rose-700" : "bg-secondary hover:bg-secondary/70"}`}>
                <ShieldAlert className="h-4 w-4" />
                {selectMode ? "إلغاء" : "تحديد"}
              </button>
            )}
          </div>
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> الرئيسية
          </Link>
        </div>
      </header>
      {selectMode && isAdmin && (
        <div className="sticky top-[57px] z-20 bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center gap-3" dir="rtl">
          <span className="text-sm font-bold text-rose-700">{selected.size} محدد</span>
          <button onClick={selectAll} className="text-xs px-3 py-1 rounded-lg bg-rose-100 text-rose-700 font-bold hover:bg-rose-200">تحديد الكل ({filtered.length})</button>
          <button onClick={clearSelect} className="text-xs px-3 py-1 rounded-lg bg-secondary font-bold hover:bg-secondary/70">إلغاء التحديد</button>
          <button onClick={bulkDelete} disabled={selected.size === 0 || bulkDeleting}
            className="mr-auto inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-rose-600 text-white text-sm font-bold disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> {bulkDeleting ? "جاري الحذف..." : `حذف (${selected.size})`}
          </button>
        </div>
      )}

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Welcome banner */}
        <div className="mb-6 rounded-3xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 via-cyan-50 to-sky-50 p-5 text-center">
          <div className="text-3xl mb-2">📚✨</div>
          <h2 className="font-black text-lg text-blue-900 mb-1">أهلاً بك في بنك الأنشطة</h2>
          <p className="text-sm text-blue-800">استكشف أنشطة المعلمين الإبداعية في كل المواد، شارك بتعليقك وتفاعلك مع زملائك. كل نشاط يقربك خطوة من شارة جديدة 🏅</p>
        </div>
        {/* Upload (teachers/admins only) */}
        {canUpload && (
          <div className="mb-6">
            {!showForm ? (
              <button onClick={() => setShowForm(true)}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-2xl bg-[image:var(--gradient-hero)] text-white font-bold shadow-[var(--shadow-soft)]">
                <Plus className="h-5 w-5" /> إضافة نشاط جديد
              </button>
            ) : (
              <div className="bg-card rounded-3xl border border-border p-5 shadow-[var(--shadow-card)]">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold flex items-center gap-2"><Upload className="h-4 w-4" /> رفع نشاط</h3>
                  <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
                </div>
                <div className="grid gap-3">
                  <select value={subject} onChange={(e) => setSubject(e.target.value)}
                    className="px-4 py-2.5 rounded-xl border border-border bg-background">
                    {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="عنوان النشاط *" maxLength={120}
                    className="px-4 py-2.5 rounded-xl border border-border bg-background" />
                  <textarea ref={descRef} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="وصف مختصر — يدعم الكسور [٢/٣] والجذور √(٩)" rows={2}
                    className="px-4 py-2.5 rounded-xl border border-border bg-background resize-none" />
                  <MathToolbar targetRef={descRef} onChange={setDesc} />
                  <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary hover:bg-secondary/80 text-sm">
                    <Upload className="h-4 w-4" />
                    {file ? file.name : "اختر ملف (PDF / صورة / فيديو / مستند)"}
                    <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" />
                  </label>
                  <button onClick={upload} disabled={uploading || !title.trim()}
                    className="px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
                    {uploading ? "جاري الرفع..." : (file ? "رفع" : "نشر نص فقط")}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Subject filter */}
        <div className="flex gap-2 overflow-x-auto pb-3 mb-4">
          {["الكل", ...SUBJECTS].map((s) => (
            <button key={s} onClick={() => setActiveSubject(s)}
              className={`px-4 py-2 rounded-full text-sm whitespace-nowrap transition ${
                activeSubject === s ? "bg-[image:var(--gradient-hero)] text-white" : "bg-secondary hover:bg-secondary/80"
              }`}>{s}</button>
          ))}
        </div>

        {/* Items */}
        {filtered.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">لا توجد أنشطة في هذا القسم بعد. {canUpload && "كن أول من يرفع!"}</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((it) => {
              const Icon = fileIcon(it.file_type);
              const isImg = it.file_type.startsWith("image/");
              const isVid = it.file_type.startsWith("video/");
              const canDelete = it.user_id === uid || isAdmin;
              const isSelected = selected.has(it.id);
              return (
                <div key={it.id} className="relative">
                  {selectMode && isAdmin && (
                    <button onClick={() => toggleSelect(it.id)}
                      className={`absolute top-2 right-2 z-10 p-1 rounded-lg transition ${isSelected ? "text-rose-500" : "text-white drop-shadow"}`}>
                      {isSelected ? <CheckSquare className="h-6 w-6" /> : <Square className="h-6 w-6" />}
                    </button>
                  )}
                  <div onClick={() => selectMode && isAdmin && toggleSelect(it.id)}
                    className={selectMode && isAdmin ? "cursor-pointer" : ""}>
                    <ActivityCard it={it} Icon={Icon} isImg={isImg} isVid={isVid} canDelete={!selectMode && canDelete} isAdmin={isAdmin} uid={uid} onApprove={approve} onDelete={del} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function ActivityCard({ it, Icon, isImg, isVid, canDelete, isAdmin, uid, onApprove, onDelete }: any) {
  const [showComments, setShowComments] = useState(false);
  const [comments, setComments] = useState<any[]>([]);
  const [text, setText] = useState("");

  const loadComments = async () => {
    const { data } = await supabase.from("activity_comments").select("*").eq("activity_id", it.id).order("created_at", { ascending: true });
    const ids = [...new Set((data || []).map((c: any) => c.user_id))];
    const { data: profs } = ids.length ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
    const map: Record<string, string> = {};
    (profs || []).forEach((p: any) => { map[p.id] = p.display_name || "—"; });
    setComments((data || []).map((c: any) => ({ ...c, name: map[c.user_id] })));
  };

  const toggleComments = () => {
    setShowComments((v) => !v);
    if (!showComments) loadComments();
  };

  const sendComment = async () => {
    if (!text.trim() || !uid) return;
    const { error } = await supabase.from("activity_comments").insert({ activity_id: it.id, user_id: uid, content: text.trim() });
    if (error) return toast.error(`فشل الإرسال: ${error.message}`);
    setText("");
    loadComments();
  };

  const delComment = async (id: string) => {
    await supabase.from("activity_comments").delete().eq("id", id);
    setComments((p) => p.filter((c) => c.id !== id));
  };

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden shadow-[var(--shadow-card)] flex flex-col">
                  {it.file_url ? (
                    isImg ? (
                    <img src={it.file_url} alt={it.title} className="w-full h-44 object-cover" loading="lazy" />
                  ) : isVid ? (
                    <video src={it.file_url} controls className="w-full h-44 object-cover bg-black" />
                  ) : (
                    <div className="h-44 bg-gradient-to-br from-blue-50 to-cyan-50 flex items-center justify-center">
                      <Icon className="h-16 w-16 text-blue-400" />
                    </div>
                  )) : (
                    <div className="h-32 bg-gradient-to-br from-violet-50 to-pink-50 flex items-center justify-center p-4">
                      <FileText className="h-10 w-10 text-violet-400" />
                    </div>
                  )}
                  <div className="p-4 flex-1 flex flex-col">
                    <div className="text-xs text-[var(--brand)] font-semibold mb-1">{it.subject}</div>
                    <h3 className="font-bold mb-1 line-clamp-2">{it.title}</h3>
                    {it.description && <p className="text-xs text-muted-foreground line-clamp-2 mb-3"><MathText text={it.description} /></p>}
                    {it.status !== "approved" && (
                      <div className="mb-2 inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 w-fit">
                        <Clock className="h-3 w-3" /> قيد المراجعة
                      </div>
                    )}
                    <div className="mt-auto flex items-center gap-2">
                      {it.file_url && (
                        <a href={it.file_url} target="_blank" rel="noreferrer" download={it.file_name || undefined}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-sm">
                          <Download className="h-4 w-4" /> تحميل
                        </a>
                      )}
                      <button onClick={toggleComments} className="p-2 rounded-xl bg-secondary hover:bg-secondary/80" title="التعليقات">
                        <MessageCircle className="h-4 w-4" />
                      </button>
                      {isAdmin && it.status !== "approved" && (
                        <button onClick={() => onApprove(it.id)} className="p-2 rounded-xl bg-emerald-100 text-emerald-700 hover:bg-emerald-200" title="اعتماد">
                          <CheckCircle2 className="h-4 w-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button onClick={() => onDelete(it.id)} className="p-2 rounded-xl bg-destructive/10 text-destructive hover:bg-destructive/20">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Reactions targetType="activity" targetId={it.id} uid={uid} />
                    {showComments && (
                      <div className="mt-3 pt-3 border-t border-border space-y-2">
                        <div className="max-h-40 overflow-y-auto space-y-1.5">
                          {comments.length === 0 ? (
                            <div className="text-xs text-muted-foreground text-center py-2">لا توجد تعليقات</div>
                          ) : comments.map((c) => (
                            <div key={c.id} className="text-xs bg-secondary/50 rounded-lg p-2 flex justify-between gap-2">
                              <div className="flex-1"><b>{c.name}: </b>{c.content}</div>
                              {(c.user_id === uid || isAdmin) && (
                                <button onClick={() => delComment(c.id)} className="text-destructive opacity-70 hover:opacity-100">×</button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-1">
                          <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && sendComment()}
                            placeholder="تعليق..." className="flex-1 px-3 py-1.5 rounded-lg border border-border bg-background text-sm" />
                          <button onClick={sendComment} disabled={!text.trim()} className="p-1.5 rounded-lg bg-[var(--brand)] text-white disabled:opacity-50">
                            <Send className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
    </div>
  );
}
