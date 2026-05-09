import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Trophy, Plus, Trash2, Calendar as CalIcon, Crown } from "lucide-react";
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
  const [winners, setWinners] = useState<Record<string, { name: string; votes: number } | null>>({});
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
    const list = (data || []) as Contest[];
    setContests(list);
    // compute winners for ended contests
    const ended = list.filter((c) => c.ends_at && new Date(c.ends_at) < new Date());
    if (ended.length === 0) return;
    const { data: entries } = await supabase.from("gallery_contest_entries")
      .select("id, contest_id, user_id").in("contest_id", ended.map((c) => c.id));
    if (!entries?.length) return;
    const { data: votes } = await supabase.from("gallery_contest_votes")
      .select("entry_id").in("entry_id", entries.map((e) => e.id));
    const voteCount: Record<string, number> = {};
    (votes || []).forEach((v: any) => { voteCount[v.entry_id] = (voteCount[v.entry_id] || 0) + 1; });
    // group by contest, pick top
    const topByContest: Record<string, { user_id: string; votes: number } | null> = {};
    for (const c of ended) {
      const ce = entries.filter((e: any) => e.contest_id === c.id);
      if (!ce.length) { topByContest[c.id] = null; continue; }
      let best = ce[0]; let bestV = voteCount[ce[0].id] || 0;
      for (const e of ce) { const v = voteCount[e.id] || 0; if (v > bestV) { best = e; bestV = v; } }
      topByContest[c.id] = bestV > 0 ? { user_id: best.user_id, votes: bestV } : null;
    }
    const winnerIds = Object.values(topByContest).filter(Boolean).map((w) => w!.user_id);
    const { data: profs } = winnerIds.length
      ? await supabase.from("profiles").select("id, display_name").in("id", winnerIds)
      : { data: [] as any[] };
    const nameMap: Record<string, string> = {};
    (profs || []).forEach((p: any) => { nameMap[p.id] = p.display_name || "—"; });
    const out: Record<string, { name: string; votes: number } | null> = {};
    for (const [cid, w] of Object.entries(topByContest)) {
      out[cid] = w ? { name: nameMap[w.user_id] || "متسابق", votes: w.votes } : null;
    }
    setWinners(out);
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
              (() => {
                const ended = c.ends_at && new Date(c.ends_at) < new Date();
                const w = winners[c.id];
                return (
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
                      <CalIcon className="h-3 w-3" /> {ended ? "انتهت" : "ينتهي"} {new Date(c.ends_at).toLocaleDateString("ar-EG")}
                    </div>
                  )}
                  {ended && w && (
                    <div className="mt-3 bg-gradient-to-l from-amber-100 to-yellow-50 border border-amber-300 rounded-xl p-2 flex items-center gap-2">
                      <Crown className="h-5 w-5 text-amber-500" />
                      <div className="flex-1 min-w-0">
                        <div className="text-[10px] text-amber-700 font-bold">🏆 الفائز</div>
                        <div className="text-sm font-black truncate">{w.name}</div>
                      </div>
                      <span className="text-xs font-bold text-amber-700">{w.votes} ❤</span>
                    </div>
                  )}
                  {ended && !w && (
                    <div className="mt-3 text-xs text-muted-foreground">لا توجد مشاركات بأصوات</div>
                  )}
                </div>
              </Link>
                );
              })()
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
