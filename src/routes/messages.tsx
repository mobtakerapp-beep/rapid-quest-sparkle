import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Send, MessageSquare, Search, ImagePlus, MoreVertical, Ban, Flag, ShieldOff, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/messages")({
  validateSearch: (s) => ({ with: (s.with as string) || "" }),
  component: MessagesPage,
});

type Profile = { id: string; display_name: string | null; role_type: string | null; avatar_url: string | null };
type DM = { id: string; sender_id: string; receiver_id: string; content: string; image_url: string | null; created_at: string };

function MessagesPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [uid, setUid] = useState<string | null>(null);
  const [people, setPeople] = useState<Profile[]>([]);
  const [active, setActive] = useState<Profile | null>(null);
  const [msgs, setMsgs] = useState<DM[]>([]);
  const [text, setText] = useState("");
  const [q, setQ] = useState("");
  const [blocked, setBlocked] = useState<Set<string>>(new Set());
  const [menuOpen, setMenuOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const myId = data.session.user.id;
      setUid(myId);
      const [{ data: profs }, { data: blocks }] = await Promise.all([
        supabase.from("profiles").select("id, display_name, role_type, avatar_url").neq("id", myId).limit(200),
        supabase.from("user_blocks" as any).select("blocked_id").eq("blocker_id", myId),
      ]);
      const blockedIds = new Set<string>(((blocks as any[]) || []).map((b: any) => b.blocked_id));
      setBlocked(blockedIds);
      setPeople((profs || []) as Profile[]);
      if (search.with) {
        const found = (profs || []).find((p) => p.id === search.with);
        if (found) setActive(found as Profile);
      }
    });
  }, [navigate, search.with]);

  const isBlocked = active ? blocked.has(active.id) : false;

  const toggleBlock = async () => {
    if (!uid || !active) return;
    if (isBlocked) {
      const { error } = await supabase.from("user_blocks" as any).delete().eq("blocker_id", uid).eq("blocked_id", active.id);
      if (error) return toast.error("فشل إلغاء الحظر");
      setBlocked((prev) => { const n = new Set(prev); n.delete(active.id); return n; });
      toast.success("تم إلغاء الحظر");
    } else {
      const { error } = await supabase.from("user_blocks" as any).insert({ blocker_id: uid, blocked_id: active.id });
      if (error) return toast.error("فشل الحظر");
      setBlocked((prev) => new Set(prev).add(active.id));
      toast.success("تم حظر المستخدم");
    }
    setMenuOpen(false);
  };

  const submitReport = async () => {
    if (!uid || !active || !reportReason.trim()) return;
    const { error } = await supabase.from("reports").insert({
      user_id: uid,
      reason: reportReason.trim(),
      content: `بلاغ ضد المستخدم: ${active.display_name || active.id}`,
      reported_user_id: active.id,
    } as any);
    if (error) return toast.error("فشل إرسال البلاغ");
    toast.success("تم إرسال البلاغ للإدارة");
    setReportReason("");
    setReportOpen(false);
    setMenuOpen(false);
  };

  const deleteConversation = async () => {
    if (!uid || !active) return;
    if (!confirm("حذف كل الرسائل في هذه المحادثة؟ لا يمكن التراجع.")) return;
    const { error } = await supabase.rpc("delete_conversation_with" as any, { _other: active.id });
    if (error) return toast.error("فشل حذف المحادثة");
    setMsgs([]);
    toast.success("تم حذف المحادثة");
    setMenuOpen(false);
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("حذف هذه الرسالة؟")) return;
    const { error } = await supabase.from("direct_messages").delete().eq("id", id);
    if (error) return toast.error("فشل الحذف");
    setMsgs((p) => p.filter((m) => m.id !== id));
  };

  useEffect(() => {
    if (!uid || !active) return;
    const load = async () => {
      const { data } = await supabase.from("direct_messages").select("*")
        .or(`and(sender_id.eq.${uid},receiver_id.eq.${active.id}),and(sender_id.eq.${active.id},receiver_id.eq.${uid})`)
        .order("created_at", { ascending: true }).limit(200);
      setMsgs((data || []) as DM[]);
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };
    load();
    const ch = supabase.channel(`dm-${uid}-${active.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (p) => {
        const m = p.new as DM;
        if ((m.sender_id === uid && m.receiver_id === active.id) || (m.sender_id === active.id && m.receiver_id === uid)) {
          setMsgs((prev) => {
            // dedupe by id, and replace any optimistic temp from same sender with same content
            if (prev.some((x) => x.id === m.id)) return prev;
            const tempIdx = prev.findIndex((x) => x.id.startsWith("temp-") && x.sender_id === m.sender_id && x.content === m.content && x.image_url === m.image_url);
            if (tempIdx >= 0) {
              const next = [...prev]; next[tempIdx] = m; return next;
            }
            return [...prev, m];
          });
          setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid, active]);

  const send = async () => {
    if (!uid || !active || !text.trim()) return;
    const content = text.trim();
    const tempId = `temp-${Date.now()}`;
    const optimistic: DM = { id: tempId, sender_id: uid, receiver_id: active.id, content, image_url: null, created_at: new Date().toISOString() };
    setMsgs((prev) => [...prev, optimistic]);
    setText("");
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: uid, receiver_id: active.id, content,
    });
    if (error) {
      setMsgs((prev) => prev.filter((m) => m.id !== tempId));
      toast.error("فشل الإرسال");
      setText(content);
    }
  };

  const sendImage = async (file: File) => {
    if (!uid || !active) return;
    if (file.size > 10 * 1024 * 1024) return toast.error("الصورة كبيرة (الحد 10 ميجا)");
    const ext = file.name.split(".").pop();
    const path = `${uid}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage.from("dm-images").upload(path, file);
    if (upErr) return toast.error("فشل رفع الصورة");
    // الـ bucket خاص — رابط موقّع طويل الأمد (سنة)
    const { data: signed } = await supabase.storage.from("dm-images").createSignedUrl(path, 60 * 60 * 24 * 365);
    const url = signed?.signedUrl || "";
    const tempId = `temp-${Date.now()}`;
    const optimistic: DM = { id: tempId, sender_id: uid, receiver_id: active.id, content: "📷 صورة", image_url: url, created_at: new Date().toISOString() };
    setMsgs((prev) => [...prev, optimistic]);
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    const { error } = await supabase.from("direct_messages").insert({
      sender_id: uid, receiver_id: active.id, content: "📷 صورة", image_url: url,
    });
    if (error) {
      setMsgs((prev) => prev.filter((m) => m.id !== tempId));
      toast.error("فشل الإرسال");
    }
  };

  const filtered = q ? people.filter((p) => (p.display_name || "").includes(q)) : people;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> الرئيسية
            </Link>
            <Link to="/supervisors" className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700 font-bold">
              🛡️ المشرفون
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white">
              <MessageSquare className="h-5 w-5" />
            </div>
            <h1 className="font-bold">الرسائل الخاصة</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-4 max-w-5xl grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4 h-[calc(100vh-120px)]">
        <aside className="bg-card border border-border rounded-2xl overflow-hidden flex flex-col">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search className="h-4 w-4 absolute right-3 top-2.5 text-muted-foreground" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث عن مستخدم..."
                className="w-full pr-9 pl-3 py-2 rounded-xl bg-background border border-border text-sm" />
            </div>
          </div>
          <div className="overflow-y-auto flex-1">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => setActive(p)}
                className={`w-full text-right p-3 border-b border-border hover:bg-secondary/50 flex items-center gap-3 ${active?.id === p.id ? "bg-secondary" : ""}`}>
                <div className="h-9 w-9 rounded-full bg-[image:var(--gradient-warm)] flex items-center justify-center text-white font-bold">
                  {(p.display_name || "؟").charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">{p.display_name || "بدون اسم"}</div>
                  <div className="text-[10px] text-muted-foreground">{p.role_type || ""}</div>
                </div>
              </button>
            ))}
          </div>
        </aside>

        <section className="bg-card border border-border rounded-2xl flex flex-col overflow-hidden">
          {!active ? (
            <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">اختر شخصاً لبدء المحادثة</div>
          ) : (
            <>
              <div className="p-3 border-b border-border font-bold flex items-center justify-between relative">
                <span className="truncate">{active.display_name || "محادثة"}{isBlocked && <span className="text-xs text-destructive mr-2">(محظور)</span>}</span>
                <button onClick={() => setMenuOpen((v) => !v)} className="p-1.5 rounded-lg hover:bg-secondary" title="خيارات">
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <div className="absolute top-12 left-2 z-20 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[200px]">
                    <button onClick={toggleBlock} className="w-full text-right px-3 py-2 text-sm hover:bg-secondary flex items-center gap-2">
                      {isBlocked ? <ShieldOff className="h-4 w-4 text-emerald-600" /> : <Ban className="h-4 w-4 text-destructive" />}
                      {isBlocked ? "إلغاء الحظر" : "حظر هذا المستخدم"}
                    </button>
                    <button onClick={() => { setReportOpen(true); setMenuOpen(false); }} className="w-full text-right px-3 py-2 text-sm hover:bg-secondary flex items-center gap-2 border-t border-border">
                      <Flag className="h-4 w-4 text-amber-600" /> الإبلاغ عنه للإدارة
                    </button>
                    <button onClick={deleteConversation} className="w-full text-right px-3 py-2 text-sm hover:bg-secondary flex items-center gap-2 border-t border-border text-destructive">
                      <Trash2 className="h-4 w-4" /> حذف كل المحادثة
                    </button>
                  </div>
                )}
              </div>

              {reportOpen && (
                <div className="p-3 border-b border-border bg-amber-50/50">
                  <div className="text-sm font-bold mb-2 flex items-center gap-1.5"><Flag className="h-4 w-4 text-amber-600" /> سبب البلاغ</div>
                  <textarea value={reportReason} onChange={(e) => setReportReason(e.target.value)} rows={2} maxLength={300}
                    placeholder="اكتب سبب البلاغ بوضوح..." className="w-full px-3 py-2 rounded-xl border border-border bg-background text-sm resize-none" />
                  <div className="flex gap-2 mt-2">
                    <button onClick={submitReport} disabled={!reportReason.trim()} className="px-3 py-1.5 rounded-lg bg-[image:var(--gradient-hero)] text-white text-sm font-bold disabled:opacity-50">إرسال البلاغ</button>
                    <button onClick={() => { setReportOpen(false); setReportReason(""); }} className="px-3 py-1.5 rounded-lg bg-secondary text-sm">إلغاء</button>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {msgs.map((m) => {
                  const me = m.sender_id === uid;
                  return (
                    <div key={m.id} className={`flex ${me ? "justify-start" : "justify-end"}`}>
                      <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${me ? "bg-[var(--brand)] text-white" : "bg-secondary"}`}>
                        {m.image_url && (
                          <a href={m.image_url} target="_blank" rel="noreferrer">
                            <img src={m.image_url} alt="" className="rounded-xl max-w-full max-h-64 object-cover mb-1" />
                          </a>
                        )}
                        {m.content && m.content !== "📷 صورة" && <div>{m.content}</div>}
                      </div>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>
              {isBlocked ? (
                <div className="p-3 border-t border-border bg-secondary/40 text-center text-sm text-muted-foreground">
                  لقد قمت بحظر هذا المستخدم — لا يمكنك إرسال رسائل إليه. اضغط القائمة لإلغاء الحظر.
                </div>
              ) : (
                <div className="p-3 border-t border-border flex gap-2">
                  <label className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 cursor-pointer" title="إرسال صورة">
                    <ImagePlus className="h-5 w-5" />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = "";
                    }} />
                  </label>
                  <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === "Enter" && send()}
                    placeholder="اكتب رسالة..." className="flex-1 px-4 py-2 rounded-xl bg-background border border-border" />
                  <button onClick={send} disabled={!text.trim()}
                    className="px-4 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
                    <Send className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}