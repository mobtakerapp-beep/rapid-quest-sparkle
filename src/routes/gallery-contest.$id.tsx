import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Trophy, Heart, Upload, Trash2, MessageCircle, Send, Crown, Type } from "lucide-react";
import { ImageTextEditor } from "@/components/ImageTextEditor";
import { toast } from "sonner";

export const Route = createFileRoute("/gallery-contest/$id")({ component: ContestPage });

const EMOJIS = ["😀","😂","🥰","😍","🤩","😎","🤔","👍","👏","❤️","🔥","🎉","🌟","💯","🏆","🎨","✨","🙌","💪","👌"];

type Contest = { id: string; title: string; description: string | null; category: string; cover_url: string | null; ends_at: string | null; created_by: string };
type Entry = { id: string; contest_id: string; user_id: string; media_url: string; caption: string | null; created_at: string; approved?: boolean };
type Profile = { id: string; display_name: string | null; avatar_url: string | null };

const CATS: Record<string,string> = { drawing: "أحسن رسمة 🎨", video: "أحسن فيديو 🎬", photo: "أحسن صورة 📸", other: "إبداع 🌟" };
const isVideo = (u: string) => /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(u);

function ContestPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [isMod, setIsMod] = useState(false);
  const [contest, setContest] = useState<Contest | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [votes, setVotes] = useState<Record<string, number>>({});
  const [myVotes, setMyVotes] = useState<Set<string>>(new Set());
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [openComments, setOpenComments] = useState<string | null>(null);
  const [editorImageUrl, setEditorImageUrl] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      setUid(data.session.user.id);
      const { data: c } = await supabase.from("gallery_contests").select("*").eq("id", id).maybeSingle();
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id);
      const modFlag = !!roles?.some((r) => ["admin","supervisor"].includes(String(r.role)));
      setIsMod(modFlag);
      if (!c) { toast.error("المسابقة غير موجودة"); navigate({ to: "/gallery-contests" }); return; }
      setContest(c as Contest);
      load(data.session.user.id, modFlag);
    });
  }, [id, navigate]);

  const load = async (myId: string, showAll?: boolean) => {
    const isModNow = showAll ?? isMod;
    let q = supabase.from("gallery_contest_entries").select("*").eq("contest_id", id).order("created_at");
    if (!isModNow) q = (q as any).eq("approved", true);
    const { data: e } = await q;
    const list = (e || []) as Entry[];
    setEntries(list);
    const ids = Array.from(new Set(list.map(x => x.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_url").in("id", ids);
      const map: Record<string, Profile> = {};
      profs?.forEach(p => { map[p.id] = p as Profile; });
      setProfiles(map);
    }
    const eids = list.map(x => x.id);
    if (eids.length) {
      const { data: vs } = await supabase.from("gallery_contest_votes").select("entry_id, user_id").in("entry_id", eids);
      const cnt: Record<string, number> = {}; const mine = new Set<string>();
      (vs || []).forEach((v: any) => {
        cnt[v.entry_id] = (cnt[v.entry_id] || 0) + 1;
        if (v.user_id === myId) mine.add(v.entry_id);
      });
      setVotes(cnt); setMyVotes(mine);
    }
  };

  const submit = async () => {
    if (!uid) return;
    if (!file && !caption.trim()) return toast.error("أضف نصاً أو ملف صورة/فيديو");
    setBusy(true);
    try {
      let url: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${uid}/${Date.now()}.${ext}`;
        const bucket = file.type.startsWith("video/") ? "gallery-media" : "chat-images";
        const { error: upErr } = await supabase.storage.from(bucket).upload(path, file);
        if (upErr) throw upErr;
        url = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      }
      const { error } = await (supabase.from("gallery_contest_entries") as any).insert({
        contest_id: id, user_id: uid, media_url: url, caption: caption.trim() || null,
        approved: isMod,
      });
      if (error) throw error;
      toast.success(isMod ? "تم تقديم مشاركتك ✨" : "تم تقديم مشاركتك وستظهر بعد الاعتماد ⏳");
      setFile(null); setCaption("");
      load(uid);
    } catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const approveEntry = async (entryId: string) => {
    const { error } = await (supabase.from("gallery_contest_entries") as any).update({ approved: true }).eq("id", entryId);
    if (error) return toast.error("فشل الاعتماد");
    setEntries((p) => p.map((e) => e.id === entryId ? { ...e, approved: true } : e));
    toast.success("تم اعتماد المشاركة ✅");
  };

  const toggleVote = async (entryId: string) => {
    if (!uid) return;
    if (myVotes.has(entryId)) {
      await supabase.from("gallery_contest_votes").delete().eq("entry_id", entryId).eq("user_id", uid);
      setMyVotes(p => { const n = new Set(p); n.delete(entryId); return n; });
      setVotes(p => ({ ...p, [entryId]: Math.max(0, (p[entryId] || 1) - 1) }));
    } else {
      const { error } = await supabase.from("gallery_contest_votes").insert({ entry_id: entryId, user_id: uid });
      if (error) return toast.error("فشل التصويت");
      setMyVotes(p => new Set(p).add(entryId));
      setVotes(p => ({ ...p, [entryId]: (p[entryId] || 0) + 1 }));
    }
  };

  const delEntry = async (eid: string) => {
    if (!confirm("حذف مشاركتك؟")) return;
    await supabase.from("gallery_contest_entries").delete().eq("id", eid);
    if (uid) load(uid);
  };

  const sorted = [...entries].sort((a, b) => (votes[b.id] || 0) - (votes[a.id] || 0));
  const myEntry = entries.find(e => e.user_id === uid);
  const ended = !!(contest?.ends_at && new Date(contest.ends_at) < new Date());
  const winner = ended && sorted.length > 0 && (votes[sorted[0].id] || 0) > 0 ? sorted[0] : null;

  if (!contest) return <div dir="rtl" className="min-h-screen flex items-center justify-center text-muted-foreground">جاري التحميل...</div>;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10 backdrop-blur bg-card/90">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/gallery-contests" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> المسابقات
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white">
              <Trophy className="h-5 w-5" />
            </div>
            <h1 className="font-bold truncate max-w-[60vw]">{contest.title}</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="bg-card rounded-3xl border border-border p-5 mb-5">
          <div className="text-xs text-muted-foreground">{CATS[contest.category]}</div>
          <h2 className="text-2xl font-black mt-1">{contest.title}</h2>
          {contest.description && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{contest.description}</p>}
          {contest.ends_at && (
            <div className="text-xs text-muted-foreground mt-2">
              {ended ? "انتهت" : "تنتهي"} {new Date(contest.ends_at).toLocaleDateString("ar-EG")}
            </div>
          )}
          {winner && (
            <div className="mt-4 bg-gradient-to-l from-amber-100 to-yellow-50 border-2 border-amber-400 rounded-2xl p-4 flex items-center gap-3">
              <Crown className="h-10 w-10 text-amber-500" />
              <div className="flex-1 min-w-0">
                <div className="text-xs text-amber-700 font-bold">🏆 الفائز بالمسابقة</div>
                <div className="font-black text-lg truncate">{profiles[winner.user_id]?.display_name || "المشارك"}</div>
                <div className="text-xs text-muted-foreground">بأعلى عدد إعجابات: {votes[winner.id]} ❤</div>
              </div>
            </div>
          )}
        </div>

        {!myEntry && uid && !ended && (
          <div className="bg-card rounded-3xl border border-border p-5 mb-5">
            <div className="font-bold mb-3">قدّم مشاركتك</div>
            <div className="flex flex-col sm:flex-row gap-2">
              <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary text-sm">
                <Upload className="h-4 w-4" /> {file ? file.name.slice(0, 22) : "صورة/فيديو (اختياري)"}
                <input type="file" accept="image/*,video/*" className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] || null)} />
              </label>
              <input value={caption} onChange={(e) => setCaption(e.target.value)} placeholder="نص مشاركتك (يكفي وحده)"
                className="flex-1 px-3 py-2 rounded-xl border border-border bg-background text-sm" />
              <button onClick={submit} disabled={busy || (!file && !caption.trim())}
                className="px-4 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
                {busy ? "..." : "إرسال"}
              </button>
            </div>
          </div>
        )}

        {sorted.length === 0 ? (
          <div className="text-center text-muted-foreground py-16 text-sm">لا توجد مشاركات بعد</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {sorted.map((e, idx) => {
              const prof = profiles[e.user_id];
              const name = prof?.display_name || "مشارك";
              const v = e.media_url ? isVideo(e.media_url) : false;
              const voted = myVotes.has(e.id);
              const mine = e.user_id === uid;
              return (
                <div key={e.id} className={`relative bg-card border rounded-2xl overflow-hidden shadow-[var(--shadow-card)] ${isMod && e.approved === false ? "border-amber-400" : "border-border"}`}>
                  {/* Pending badge for mods */}
                  {isMod && e.approved === false && (
                    <div className="absolute top-0 inset-x-0 bg-amber-500/90 text-white text-center text-[11px] font-bold py-1 z-20">
                      ⏳ قيد المراجعة — <button onClick={() => approveEntry(e.id)} className="underline">اعتماد الآن</button>
                    </div>
                  )}
                  {idx < 3 && e.approved !== false && (
                    <div className="absolute top-2 right-2 bg-amber-500 text-white text-xs font-bold px-2 py-0.5 rounded-full z-10 shadow-lg">
                      #{idx + 1}
                    </div>
                  )}
                  {v ? (
                    <video src={e.media_url} controls className="w-full aspect-square object-cover bg-black" />
                  ) : e.media_url ? (
                    <div className="relative group">
                      <img src={e.media_url} alt="" className="w-full aspect-square object-cover" />
                      <button onClick={() => setEditorImageUrl(e.media_url)}
                        className="absolute bottom-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-violet-700/90 hover:bg-violet-800 text-white px-2.5 py-1.5 rounded-xl flex items-center gap-1.5 text-xs font-bold">
                        <Type className="h-3.5 w-3.5" /> كتابة
                      </button>
                    </div>
                  ) : (
                    <div className="w-full aspect-square flex items-center justify-center bg-gradient-to-br from-violet-100 via-pink-50 to-amber-100 p-4 text-center text-base font-bold text-foreground">
                      {e.caption || "—"}
                    </div>
                  )}
                  <div className="p-3 space-y-2">
                    {/* Reactions row first (right under the media) */}
                    <div className="flex items-center gap-2">
                      <button onClick={() => toggleVote(e.id)}
                        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition ${voted ? "bg-rose-500 text-white" : "bg-secondary"}`}>
                        <Heart className={`h-3.5 w-3.5 ${voted ? "fill-white" : ""}`} /> {votes[e.id] || 0}
                      </button>
                      <button onClick={() => setOpenComments(openComments === e.id ? null : e.id)}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-secondary">
                        <MessageCircle className="h-3.5 w-3.5" /> تعليقات
                      </button>
                      <div className="flex-1" />
                      {(mine || isMod) && (
                        <button onClick={() => delEntry(e.id)} className="text-destructive p-1 rounded hover:bg-destructive/10">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                    {/* Author */}
                    <div className="flex items-center gap-2">
                      {prof?.avatar_url
                        ? <img src={prof.avatar_url} alt="" className="h-6 w-6 rounded-full object-cover" />
                        : <div className="h-6 w-6 rounded-full bg-[image:var(--gradient-warm)] flex items-center justify-center text-white text-[10px] font-bold">{name.charAt(0)}</div>}
                      <div className="text-xs font-bold flex-1 min-w-0 truncate">{name}</div>
                    </div>
                    {/* Caption text after reactions */}
                    {e.caption && <div className="text-xs text-foreground/80 leading-relaxed">{e.caption}</div>}
                    {openComments === e.id && uid && <EntryComments entryId={e.id} uid={uid} />}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
      {editorImageUrl && (
        <ImageTextEditor
          onClose={() => setEditorImageUrl(null)}
          initialImageUrl={editorImageUrl}
          onSend={async (dataUrl) => {
            if (!uid) return;
            const res = await fetch(dataUrl);
            const blob = await res.blob();
            const path = `${uid}/${Date.now()}.jpg`;
            const { error: upErr } = await supabase.storage.from("chat-images").upload(path, blob, { contentType: "image/jpeg" });
            if (upErr) throw upErr;
            const url = supabase.storage.from("chat-images").getPublicUrl(path).data.publicUrl;
            const { error } = await (supabase.from("gallery_contest_entries") as any).insert({ contest_id: id, user_id: uid, media_url: url, caption: null, approved: isMod });
            if (error) throw error;
            import("sonner").then(({ toast }) => toast.success("تم إرسال مشاركتك ✨"));
            load(uid);
          }}
        />
      )}
    </div>
  );
}

function EntryComments({ entryId, uid }: { entryId: string; uid: string }) {
  const [list, setList] = useState<{ id: string; user_id: string; content: string; created_at: string; name?: string }[]>([]);
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);

  const load = async () => {
    // reuse gallery_comments table by storing item_id = entry_id
    const { data } = await supabase.from("gallery_comments").select("*").eq("item_id", entryId).order("created_at");
    const ids = Array.from(new Set((data || []).map((c: any) => c.user_id)));
    const { data: profs } = ids.length ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] };
    const map: Record<string, string> = {};
    (profs || []).forEach((p: any) => { map[p.id] = p.display_name || "مستخدم"; });
    setList((data || []).map((c: any) => ({ ...c, name: map[c.user_id] })));
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [entryId]);

  const send = async () => {
    if (!text.trim()) return;
    const { error } = await supabase.from("gallery_comments").insert({ item_id: entryId, user_id: uid, content: text.trim() });
    if (error) return toast.error(`فشل الإرسال: ${error.message}`);
    setText(""); load();
  };

  return (
    <div className="mt-2 border-t border-border pt-2 space-y-2">
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {list.map((c) => (
          <div key={c.id} className="text-xs bg-secondary/50 rounded-lg p-2">
            <span className="font-bold">{c.name}: </span>
            <span>{c.content}</span>
          </div>
        ))}
        {list.length === 0 && <div className="text-[11px] text-muted-foreground text-center">لا تعليقات بعد</div>}
      </div>
      {showEmoji && (
        <div className="flex flex-wrap gap-1 p-2 rounded-lg bg-secondary/40 border border-border">
          {EMOJIS.map((e) => (
            <button key={e} onClick={() => { setText(text + e); }} className="text-base hover:scale-125 transition" type="button">{e}</button>
          ))}
        </div>
      )}
      <div className="flex gap-1">
        <button type="button" onClick={() => setShowEmoji((v) => !v)} className="px-2 py-1.5 rounded-lg bg-secondary text-sm" title="إيموجي">😊</button>
        <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="اكتب تعليقاً..." className="flex-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs" />
        <button onClick={send} className="px-2 py-1.5 rounded-lg bg-[image:var(--gradient-hero)] text-white">
          <Send className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
