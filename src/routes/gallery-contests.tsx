import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Trophy, Plus, Trash2, Calendar as CalIcon } from "lucide-react";
import { isVerifiedTeacher } from "@/lib/roles";
import { DateTimePicker } from "@/components/DateTimePicker";

export const Route = createFileRoute("/gallery-contests")({ component: ContestsPage });

type Contest = { id: string; title: string; description: string | null; category: string; cover_url: string | null; ends_at: string | null; created_by: string; created_at: string };

const CATS: Record<string, string> = { drawing: "أحسن رسمة 🎨", video: "أحسن فيديو 🎬", photo: "أحسن صورة 📸", other: "إبداع 🌟" };

function ContestsPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [isTeacher, setIsTeacher] = useState(false);
  const [contests, setContests] = useState<Contest[]>([]);
  const [showNew, setShowNew] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const id = data.session.user.id;
      setUid(id);
      setIsTeacher(await isVerifiedTeacher(id));
      load();
    });
  }, [navigate]);

  const load = async () => {
    const { data } = await supabase.from("gallery_contests").select("*").order("created_at", { ascending: false });
    setContests((data || []) as Contest[]);
  };

  const delContest = async (id: string) => {
    if (!confirm("حذف هذه المسابقة؟")) return;
    const { error } = await supabase.from("gallery_contests").delete().eq("id", id);
    if (error) return toast.error("تعذر الحذف");
    setContests(p => p.filter(c => c.id !== id));
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10 backdrop-blur bg-card/90">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> الرئيسية
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <h1 className="font-bold">مسابقات معرض الإبداعات</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        {isTeacher && (
          <button onClick={() => setShowNew(true)}
            className="mb-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold">
            <Plus className="h-4 w-4" /> مسابقة جديدة
          </button>
        )}

        {contests.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">لا توجد مسابقات بعد</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {contests.map((c) => (
              <Link key={c.id} to="/gallery-contest/$id" params={{ id: c.id }}
                className="bg-card border border-border rounded-2xl overflow-hidden shadow-[var(--shadow-card)] hover:shadow-lg transition block">
                <div className="h-32 bg-[image:var(--gradient-warm)] flex items-center justify-center text-white text-3xl font-bold">
                  {CATS[c.category] || "إبداع"}
                </div>
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-lg">{c.title}</h3>
                    {(c.created_by === uid || isTeacher) && (
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); delContest(c.id); }}
                        className="text-destructive p-1 rounded hover:bg-destructive/10">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {c.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{c.description}</p>}
                  {c.ends_at && (
                    <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <CalIcon className="h-3 w-3" /> ينتهي {new Date(c.ends_at).toLocaleDateString("ar-EG")}
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </main>

      {showNew && uid && <NewContestModal uid={uid} onClose={() => setShowNew(false)} onSaved={() => { setShowNew(false); load(); }} />}
    </div>
  );
}

function NewContestModal({ uid, onClose, onSaved }: { uid: string; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [cat, setCat] = useState("drawing");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!title.trim()) return toast.error("اكتب عنواناً");
    setBusy(true);
    const { error } = await supabase.from("gallery_contests").insert({
      title: title.trim(), description: desc.trim() || null, category: cat,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null, created_by: uid,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("تم إنشاء المسابقة");
    onSaved();
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-3xl max-w-lg w-full p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
        <h2 className="font-bold text-lg">مسابقة جديدة</h2>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="العنوان"
          className="w-full px-4 py-2 rounded-xl border border-border bg-background" />
        <textarea value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="الوصف (اختياري)" rows={3}
          className="w-full px-4 py-2 rounded-xl border border-border bg-background" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} className="w-full px-4 py-2 rounded-xl border border-border bg-background">
          {Object.entries(CATS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <DateTimePicker value={endsAt} onChange={setEndsAt} placeholder="تاريخ انتهاء المسابقة" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-xl bg-secondary">إلغاء</button>
          <button onClick={save} disabled={busy} className="px-4 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
            {busy ? "..." : "إنشاء"}
          </button>
        </div>
      </div>
    </div>
  );
}
