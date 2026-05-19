import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Send, MessageSquare, Search, ImagePlus, MoreVertical, Ban, Flag, ShieldOff, Trash2, Smile } from "lucide-react";
import { toast } from "sonner";
import EmojiPicker, { Theme } from "emoji-picker-react";

export const Route = createFileRoute("/messages")({
  validateSearch: (s) => ({ with: (s.with as string) || "" }),
  component: MessagesPage,
});

type Profile = { id: string; display_name: string | null; role_type: string | null; avatar_url: string | null };
type DM = { id: string; sender_id: string; receiver_id: string; content: string; image_url: string | null; created_at: string };

const MSG_EMOJIS = ["❤️", "😂", "👍", "🔥", "😮", "🥰"];

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
  const [showEmojiPicker, setShowEmojiPicker] = useState<string | false>(false);
  const [msgReactions, setMsgReactions] = useState<Record<string, Record<string, number>>>({});
  const [myReactions, setMyReactions] = useState<Record<string, string>>({});
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  const endRef = useRef<HTMLDivElement>(null);

  const loadUnread = async (myId: string) => {
    const { data } = await supabase.from("direct_messages").select("sender_id")
      .eq("receiver_id", myId).is("read_at", null).not("content", "like", "__STICKER__%");
    const counts: Record<string, number> = {};
    (data || []).forEach((m: any) => { counts[m.sender_id] = (counts[m.sender_id] || 0) + 1; });
    setUnreadCounts(counts);
  };

  const markRead = async (senderId: string) => {
    if (!uid) return;
    await supabase.from("direct_messages")
      .update({ read_at: new Date().toISOString() } as any)
      .eq("receiver_id", uid).eq("sender_id", senderId).is("read_at", null);
    setUnreadCounts((prev) => { const n = { ...prev }; delete n[senderId]; return n; });
  };

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
      loadUnread(myId);
      if (search.with) {
        const found = (profs || []).find((p) => p.id === search.with);
        if (found) { setActive(found as Profile); markRead(found.id); }
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

  const dmImagePath = (url: string | null): string | null => {
    if (!url) return null;
    const marker = "/storage/v1/object/sign/dm-images/";
    const idx = url.indexOf(marker);
    if (idx !== -1) return decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
    const pubMarker = "/storage/v1/object/public/dm-images/";
    const idx2 = url.indexOf(pubMarker);
    if (idx2 !== -1) return decodeURIComponent(url.slice(idx2 + pubMarker.length).split("?")[0]);
    return null;
  };

  const deleteConversation = async () => {
    if (!uid || !active) return;
    if (!confirm("حذف كل الرسائل في هذه المحادثة؟ لا يمكن التراجع.")) return;
    const imagePaths = msgs
      .map((m) => dmImagePath(m.image_url))
      .filter(Boolean) as string[];
    const { error } = await supabase.rpc("delete_conversation_with" as any, { _other: active.id });
    if (error) return toast.error("فشل حذف المحادثة");
    if (imagePaths.length) {
      await supabase.storage.from("dm-images").remove(imagePaths);
    }
    setMsgs([]);
    toast.success("تم حذف المحادثة");
    setMenuOpen(false);
  };

  const deleteMessage = async (id: string) => {
    if (!confirm("حذف هذه الرسالة؟")) return;
    const msg = msgs.find((m) => m.id === id);
    const { error } = await supabase.from("direct_messages").delete().eq("id", id);
    if (error) return toast.error("فشل الحذف");
    if (msg?.image_url) {
      const path = dmImagePath(msg.image_url);
      if (path) await supabase.storage.from("dm-images").remove([path]);
    }
    setMsgs((p) => p.filter((m) => m.id !== id));
  };

  const loadReactions = async (messageIds: string[]) => {
    if (!messageIds.length || !uid) return;
    const { data } = await supabase.from("reactions").select("target_id, emoji, user_id")
      .eq("target_type", "dm").in("target_id", messageIds);
    const counts: Record<string, Record<string, number>> = {};
    const mine: Record<string, string> = {};
    (data || []).forEach((r: any) => {
      if (!counts[r.target_id]) counts[r.target_id] = {};
      counts[r.target_id][r.emoji] = (counts[r.target_id][r.emoji] || 0) + 1;
      if (r.user_id === uid) mine[r.target_id] = r.emoji;
    });
    setMsgReactions(counts);
    setMyReactions(mine);
  };

  const toggleMsgReaction = async (msgId: string, emoji: string) => {
    if (!uid) return;
    const current = myReactions[msgId];
    if (current) {
      await supabase.from("reactions").delete()
        .eq("target_type", "dm").eq("target_id", msgId).eq("user_id", uid).eq("emoji", current);
    }
    if (current !== emoji) {
      await supabase.from("reactions").insert({ target_type: "dm", target_id: msgId, user_id: uid, emoji });
    }
    const ids = msgs.map((m) => m.id);
    loadReactions(ids);
  };

  useEffect(() => {
    if (!uid || !active) return;
    const load = async () => {
      const { data } = await supabase.from("direct_messages").select("*")
        .or(`and(sender_id.eq.${uid},receiver_id.eq.${active.id}),and(sender_id.eq.${active.id},receiver_id.eq.${uid})`)
        .not("content", "like", "__STICKER__%")
        .order("created_at", { ascending: true }).limit(200);
      const list = (data || []) as DM[];
      setMsgs(list);
      loadReactions(list.map((m) => m.id));
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    };
    load();
    const ch = supabase.channel(`dm-${uid}-${active.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (p) => {
        const m = p.new as DM;
        if (m.content?.startsWith("__STICKER__")) return;
        if ((m.sender_id === uid && m.receiver_id === active.id) || (m.sender_id === active.id && m.receiver_id === uid)) {
          setMsgs((prev) => {
            if (prev.some((x) => x.id === m.id)) return prev;
            const tempIdx = prev.findIndex((x) => x.id.startsWith("temp-") && x.sender_id === m.sender_id && x.content === m.content && x.image_url === m.image_url);
            if (tempIdx >= 0) {
              const next = [...prev]; next[tempIdx] = m; return next;
            }
            return [...prev, m];
          });
          setTimeout(() => endRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "reactions", filter: "target_type=eq.dm" }, () => {
        setMsgs((prev) => { loadReactions(prev.map((m) => m.id)); return prev; });
      })
      .subscribe();
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
            {filtered.map((p) => {
              const unread = unreadCounts[p.id] || 0;
              return (
                <button key={p.id} onClick={() => { setActive(p); markRead(p.id); }}
                  className={`w-full text-right p-3 border-b border-border hover:bg-secondary/50 flex items-center gap-3 ${active?.id === p.id ? "bg-secondary" : ""}`}>
                  <div className="relative shrink-0">
                    {p.avatar_url ? (
                      <img src={p.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded-full bg-[image:var(--gradient-warm)] flex items-center justify-center text-white font-bold text-sm">
                        {(p.display_name || "؟").charAt(0)}
                      </div>
                    )}
                    {unread > 0 && (
                      <span className="absolute -top-1 -left-1 min-w-[18px] h-[18px] rounded-full bg-rose-500 text-white text-[10px] font-black flex items-center justify-center px-0.5 shadow">
                        {unread > 9 ? "9+" : unread}
                      </span>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className={`text-sm truncate ${unread > 0 ? "font-black" : "font-semibold"}`}>{p.display_name || "بدون اسم"}</div>
                    <div className="text-[10px] text-muted-foreground">{p.role_type || ""}</div>
                  </div>
                  {unread > 0 && (
                    <span className="shrink-0 text-[10px] text-rose-600 font-bold">{unread} جديد</span>
                  )}
                </button>
              );
            })}
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
                  const reactions = msgReactions[m.id] || {};
                  const myEmoji = myReactions[m.id];
                  const hasReactions = Object.keys(reactions).length > 0;
                  return (
                    <div key={m.id} className="group">
                      <div className={`flex items-center gap-1 ${me ? "justify-start" : "justify-end"}`}>
                        {me && !m.id.startsWith("temp-") && (
                          <button onClick={() => deleteMessage(m.id)} className="opacity-0 group-hover:opacity-100 transition p-1 rounded-md hover:bg-destructive/10 text-destructive" title="حذف الرسالة">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                        {!m.id.startsWith("temp-") && (
                          <div className="relative opacity-0 group-hover:opacity-100 transition">
                            <button
                              onClick={() => setShowEmojiPicker(showEmojiPicker === m.id ? false : m.id)}
                              className="p-1 rounded-md hover:bg-secondary text-muted-foreground"
                              title="تفاعل"
                            >
                              <Smile className="h-3.5 w-3.5" />
                            </button>
                            {showEmojiPicker === m.id && (
                              <div className={`absolute z-30 ${me ? "left-0" : "right-0"} bottom-8 bg-card border border-border rounded-2xl shadow-xl p-2 flex gap-1`}>
                                {MSG_EMOJIS.map((emoji) => (
                                  <button
                                    key={emoji}
                                    onClick={() => { toggleMsgReaction(m.id, emoji); setShowEmojiPicker(false); }}
                                    className={`text-lg p-1.5 rounded-xl hover:bg-secondary transition ${myEmoji === emoji ? "bg-[var(--brand)]/15 ring-1 ring-[var(--brand)]" : ""}`}
                                  >
                                    {emoji}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                        <div className={`max-w-[75%] px-3 py-2 rounded-2xl text-sm ${me ? "bg-[var(--brand)] text-white" : "bg-secondary"}`}>
                          {m.image_url && (
                            <a href={m.image_url} target="_blank" rel="noreferrer">
                              <img src={m.image_url} alt="" className="rounded-xl max-w-full max-h-64 object-cover mb-1" />
                            </a>
                          )}
                          {m.content && m.content !== "📷 صورة" && <div>{m.content}</div>}
                        </div>
                      </div>
                      {hasReactions && (
                        <div className={`flex gap-1 mt-0.5 flex-wrap ${me ? "justify-start pr-8" : "justify-end pl-8"}`}>
                          {Object.entries(reactions).map(([emoji, count]) => (
                            <button
                              key={emoji}
                              onClick={() => toggleMsgReaction(m.id, emoji)}
                              className={`text-xs px-1.5 py-0.5 rounded-full border transition ${myEmoji === emoji ? "bg-[var(--brand)]/15 border-[var(--brand)] text-[var(--brand)]" : "bg-card border-border hover:bg-secondary"}`}
                            >
                              {emoji} {count > 1 ? count : ""}
                            </button>
                          ))}
                        </div>
                      )}
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
                <div className="p-3 border-t border-border flex gap-2 relative">
                  {showEmojiPicker === "input" && (
                    <div className="absolute bottom-full mb-2 right-0 z-30">
                      <EmojiPicker theme={Theme.AUTO} width={300} height={350}
                        onEmojiClick={(e) => { setText((t) => t + e.emoji); setShowEmojiPicker(false); }} />
                    </div>
                  )}
                  <label className="p-2 rounded-xl bg-secondary hover:bg-secondary/80 cursor-pointer" title="إرسال صورة">
                    <ImagePlus className="h-5 w-5" />
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0]; if (f) sendImage(f); e.target.value = "";
                    }} />
                  </label>
                  <button onClick={() => setShowEmojiPicker(showEmojiPicker === "input" ? false : "input")}
                    className="p-2 rounded-xl bg-secondary hover:bg-secondary/80" title="إيموجي">
                    <Smile className="h-5 w-5" />
                  </button>
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
