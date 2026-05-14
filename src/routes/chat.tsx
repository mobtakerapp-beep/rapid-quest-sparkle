import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import { toast } from "sonner";
import {
  Send, Image as ImageIcon, LogOut, Trash2, Ban, Shield, X,
  User as UserIcon, BookOpen, GraduationCap, Heart, Smile,
  LockOpen, Lock, CheckSquare, Square, ShieldAlert
} from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { playLogoutSound } from "@/lib/sounds";
import { ReportButton } from "@/components/ReportButton";

export const Route = createFileRoute("/chat")({
  component: ChatPage,
});

type Message = {
  id: string;
  user_id: string;
  content: string | null;
  image_url: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  is_banned: boolean;
  role_type?: string | null;
};

const roleBadge = (rt?: string | null) => {
  if (rt === "admin") return { label: "أدمن", icon: Shield, cls: "bg-rose-100 text-rose-700" };
  if (rt === "supervisor") return { label: "مشرف", icon: Shield, cls: "bg-amber-100 text-amber-700" };
  if (rt === "teacher") return { label: "معلم", icon: BookOpen, cls: "bg-blue-100 text-blue-700" };
  if (rt === "student") return { label: "طالب", icon: GraduationCap, cls: "bg-emerald-100 text-emerald-700" };
  if (rt === "parent") return { label: "ولي أمر", icon: Heart, cls: "bg-pink-100 text-pink-700" };
  return null;
};

// ---- إعدادات وقت الشات (توقيت عُمان UTC+4) ----
const CHAT_OPEN_OMAN  = 17;
const CHAT_CLOSE_OMAN = 23;
function getOmanHour() { return (new Date().getUTCHours() + 4) % 24; }
function isChatOpenByTime() {
  const h = getOmanHour();
  return h >= CHAT_OPEN_OMAN && h < CHAT_CLOSE_OMAN;
}
// ------------------------------------------------

type RoleFilter = "all" | "student" | "parent" | "teacher";

function ChatPage() {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMod, setIsMod] = useState(false);
  const [canControlChat, setCanControlChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [text, setText] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [chatOverride, setChatOverride] = useState<'open' | 'closed' | null>(null);
  const [togglingChat, setTogglingChat] = useState(false);
  // تحديد جماعي
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatOpen = chatOverride === 'open' ? true : chatOverride === 'closed' ? false : isChatOpenByTime();

  useEffect(() => {
    if (chatOverride !== null) return;
    const t = setInterval(() => setChatOverride(prev => prev), 60_000);
    return () => clearInterval(t);
  }, [chatOverride]);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
      if (!session) navigate({ to: "/login" });
    });
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      setUser(data.session.user);
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      setIsMod(!!roles?.some((r) => ["admin","supervisor"].includes(String(r.role))));
      setCanControlChat(!!roles?.some((r) => ["admin","supervisor","teacher"].includes(String(r.role))));
      const { data: myProf } = await supabase.from("profiles").select("role_type").eq("id", data.session.user.id).maybeSingle();
      if (!myProf?.role_type) navigate({ to: "/profile" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  useEffect(() => {
    const fetchChatControl = async () => {
      const { data } = await supabase.from("messages").select("content").eq("category", "chat_control").order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (data?.content === "open" || data?.content === "closed") setChatOverride(data.content);
    };
    fetchChatControl();
  }, []);

  useEffect(() => {
    if (!user) return;
    const load = async () => {
      const { data: msgs } = await supabase.from("messages").select("*").eq("category", "chat").order("created_at", { ascending: true }).limit(200);
      setMessages(msgs || []);
      const ids = Array.from(new Set((msgs || []).map((m) => m.user_id)));
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("*").in("id", ids);
        const map: Record<string, Profile> = {};
        profs?.forEach((p) => (map[p.id] = p));
        setProfiles(map);
      }
    };
    load();

    const channel = supabase.channel("chat-room")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, async (payload) => {
        const m = payload.new as Message & { category?: string };
        if (m.category === "chat_control") {
          if (m.content === "open" || m.content === "closed") setChatOverride(m.content);
          return;
        }
        if (m.category && m.category !== "chat") return;
        setMessages((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev, m]);
        setProfiles((prev) => {
          if (prev[m.user_id]) return prev;
          supabase.from("profiles").select("*").eq("id", m.user_id).maybeSingle()
            .then(({ data: p }) => { if (p) setProfiles((pp) => ({ ...pp, [p.id]: p })); });
          return prev;
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (payload) => {
        const old = payload.old as Message;
        setMessages((prev) => prev.filter((m) => m.id !== old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error("الصورة كبيرة (الحد 5 ميجا)"); return; }
    setImageFile(f);
    setImagePreview(URL.createObjectURL(f));
  };

  const toggleChatOpen = async () => {
    if (!user || !canControlChat) return;
    setTogglingChat(true);
    const newState: 'open' | 'closed' = chatOpen ? 'closed' : 'open';
    try {
      const { error } = await supabase.from("messages").insert({ user_id: user.id, content: newState, image_url: null, category: "chat_control" });
      if (error) throw error;
      setChatOverride(newState);
      toast.success(newState === 'open' ? "✅ تم فتح الشات لجميع المستخدمين" : "🔒 تم قفل الشات");
    } catch { toast.error("فشل تغيير حالة الشات"); }
    finally { setTogglingChat(false); }
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || (!text.trim() && !imageFile)) return;
    setSending(true);
    try {
      let image_url: string | null = null;
      if (imageFile) {
        const ext = imageFile.name.split(".").pop();
        const path = `${user.id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from("chat-images").upload(path, imageFile);
        if (upErr) throw upErr;
        image_url = supabase.storage.from("chat-images").getPublicUrl(path).data.publicUrl;
      }
      const { data: inserted, error } = await supabase.from("messages").insert({ user_id: user.id, content: text.trim() || null, image_url, category: "chat" }).select().single();
      if (error) throw error;
      if (inserted) setMessages((prev) => prev.some((m) => m.id === inserted.id) ? prev : [...prev, inserted as Message]);
      setText(""); setImageFile(null); setImagePreview(null);
    } catch (err: any) {
      const msg = err.message || "فشل الإرسال";
      if (msg.includes("PROFANITY_BLOCKED")) toast.error("⚠️ تم حظر رسالتك لاحتوائها كلمات غير لائقة.");
      else toast.error(msg);
    } finally { setSending(false); }
  };

  const deleteMessage = async (id: string) => {
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) toast.error("لا يمكن الحذف");
    else toast.success("تم الحذف");
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!confirm(`حذف ${selected.size} رسالة؟`)) return;
    setDeleting(true);
    try {
      const ids = Array.from(selected);
      const { error } = await supabase.from("messages").delete().in("id", ids);
      if (error) throw error;
      setMessages((prev) => prev.filter((m) => !selected.has(m.id)));
      setSelected(new Set());
      setSelectMode(false);
      toast.success(`تم حذف ${ids.length} رسالة`);
    } catch { toast.error("فشل حذف الرسائل"); }
    finally { setDeleting(false); }
  };

  const banUser = async (uid: string, name: string) => {
    if (!confirm(`طرد ${name}؟`)) return;
    const { error } = await supabase.from("profiles").update({ is_banned: true }).eq("id", uid);
    if (error) toast.error("فشل الطرد");
    else { toast.success(`تم طرد ${name}`); setProfiles((p) => ({ ...p, [uid]: { ...p[uid], is_banned: true } })); }
  };

  const logout = async () => {
    playLogoutSound();
    await new Promise(r => setTimeout(r, 350));
    await supabase.auth.signOut();
    navigate({ to: "/" });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  // فلترة الرسائل حسب الدور عند التحديد
  const selectAllByRole = () => {
    const filtered = messages.filter((m) => {
      if (roleFilter === "all") return true;
      const p = profiles[m.user_id];
      if (roleFilter === "student") return p?.role_type === "student";
      if (roleFilter === "parent") return p?.role_type === "parent";
      if (roleFilter === "teacher") return p?.role_type === "teacher";
      return true;
    });
    setSelected(new Set(filtered.map((m) => m.id)));
  };

  if (!user) return null;

  return (
    <div dir="rtl" className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="bg-card border-b border-border px-4 py-3 flex items-center justify-between sticky top-0 z-10 backdrop-blur bg-card/90">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[image:var(--gradient-hero)] flex items-center justify-center text-white font-bold text-lg">ك</div>
          <div>
            <h1 className="font-bold leading-tight">مجتمع كلنا معك</h1>
            <p className="text-xs text-muted-foreground">شات تعليمي مباشر</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/profile" className="p-2 rounded-lg hover:bg-secondary text-muted-foreground" title="بياناتي">
            <UserIcon className="h-4 w-4" />
          </Link>
          <button onClick={logout} className="p-2 rounded-lg hover:bg-secondary text-muted-foreground" title="خروج">
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </header>

      {/* شريط التحديد الجماعي */}
      {selectMode && isMod && (
        <div className="sticky top-[73px] z-10 bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex flex-wrap items-center gap-2" dir="rtl">
          <span className="text-sm font-black text-rose-700">{selected.size} محدد</span>
          {/* فلتر حسب الدور */}
          <div className="flex gap-1 flex-wrap">
            {([
              { key: "all", label: "الكل" },
              { key: "student", label: "طلاب" },
              { key: "parent", label: "أولياء الأمور" },
              { key: "teacher", label: "معلمون" },
            ] as { key: RoleFilter; label: string }[]).map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setRoleFilter(key)}
                className={`px-2.5 py-1 rounded-full text-xs font-bold border transition-colors ${
                  roleFilter === key
                    ? "bg-rose-600 text-white border-rose-700"
                    : "bg-white text-rose-700 border-rose-300 hover:bg-rose-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <button
            onClick={selectAllByRole}
            className="px-3 py-1 rounded-lg text-xs font-bold bg-rose-200 text-rose-800 hover:bg-rose-300"
          >
            تحديد الكل
          </button>
          {selected.size > 0 && (
            <button
              onClick={deleteSelected}
              disabled={deleting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-black bg-rose-600 text-white hover:bg-rose-700 disabled:opacity-60 mr-auto"
            >
              <Trash2 className="h-3.5 w-3.5" />
              حذف {selected.size} رسالة
            </button>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 max-w-3xl w-full mx-auto">

        {/* ===== نص المواعيد في الأعلى ===== */}
        <div className="text-center py-3">
          <p className="text-xs text-muted-foreground bg-secondary/50 rounded-2xl px-4 py-2.5 leading-relaxed inline-block">
            📅 يفتح الشات يومياً الساعة <strong>5:00 مساءً</strong> حتى <strong>11:00 مساءً</strong> بتوقيت سلطنة عُمان
            <br />كما يفتح أثناء الاجتماعات المجدولة بين المعلمين والطلبة وأولياء الأمور
          </p>
        </div>

        {/* ===== زر فتح/قفل + زر التحديد ===== */}
        {(canControlChat || isMod) && (
          <div className="flex justify-center items-center gap-4 py-2 flex-wrap">
            {canControlChat && (
              <button
                onClick={toggleChatOpen}
                disabled={togglingChat}
                title={chatOpen ? "اضغط لقفل الشات" : "اضغط لفتح الشات"}
                className={`flex flex-col items-center justify-center w-14 h-14 rounded-full text-white font-black shadow border-2 transition-all disabled:opacity-60 active:scale-95 ${
                  chatOpen
                    ? "bg-emerald-500 border-emerald-300 hover:bg-emerald-600 shadow-emerald-200"
                    : "bg-red-500 border-red-300 hover:bg-red-600 shadow-red-200"
                }`}
              >
                {chatOpen
                  ? <><LockOpen className="h-4 w-4 mb-0.5" /><span className="text-[8px] leading-tight text-center">مفتوح</span></>
                  : <><Lock className="h-4 w-4 mb-0.5" /><span className="text-[8px] leading-tight text-center">مغلق</span></>
                }
              </button>
            )}
            {isMod && (
              <button
                onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
                className={`flex flex-col items-center justify-center w-14 h-14 rounded-full font-black shadow border-2 transition-all active:scale-95 ${
                  selectMode
                    ? "bg-rose-500 border-rose-300 text-white hover:bg-rose-600"
                    : "bg-secondary border-border text-foreground hover:bg-secondary/80"
                }`}
              >
                <ShieldAlert className="h-4 w-4 mb-0.5" />
                <span className="text-[8px] leading-tight text-center">{selectMode ? "إلغاء" : "تحديد"}</span>
              </button>
            )}
          </div>
        )}

        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-16 text-sm">لا توجد رسائل بعد. ابدأ الحوار! 👋</div>
        )}
        {messages.map((m) => {
          const isMe = m.user_id === user.id;
          const p = profiles[m.user_id];
          const name = p?.display_name || "مستخدم";
          const isSelected = selected.has(m.id);

          // في وضع التحديد: هل هذه الرسالة ضمن الفلتر المحدد؟
          const matchesFilter = roleFilter === "all"
            || (roleFilter === "student" && p?.role_type === "student")
            || (roleFilter === "parent" && p?.role_type === "parent")
            || (roleFilter === "teacher" && p?.role_type === "teacher");

          return (
            <div
              key={m.id}
              className={`flex gap-2 items-start ${isMe ? "flex-row-reverse" : ""} ${
                selectMode && matchesFilter ? "cursor-pointer rounded-xl p-1 -mx-1 transition-colors " + (isSelected ? "bg-rose-50 ring-2 ring-rose-300" : "hover:bg-secondary/50") : ""
              }`}
              onClick={selectMode && matchesFilter ? () => toggleSelect(m.id) : undefined}
            >
              {/* Checkbox في وضع التحديد */}
              {selectMode && matchesFilter && (
                <div className="flex-shrink-0 self-center">
                  {isSelected
                    ? <CheckSquare className="h-5 w-5 text-rose-600" />
                    : <Square className="h-5 w-5 text-muted-foreground" />
                  }
                </div>
              )}
              <div className="h-9 w-9 rounded-full bg-[image:var(--gradient-warm)] flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                {name.charAt(0)}
              </div>
              <div className={`group max-w-[75%] ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                <div className="text-xs text-muted-foreground mb-1 px-1 flex items-center gap-1.5">
                  <span>{name}</span>
                  {(() => {
                    const b = roleBadge(p?.role_type);
                    return b ? (
                      <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] ${b.cls}`}>
                        <b.icon className="h-2.5 w-2.5" /> {b.label}
                      </span>
                    ) : null;
                  })()}
                  {p?.is_banned && <span className="text-destructive">(محظور)</span>}
                </div>
                <div className={`rounded-2xl px-4 py-2.5 shadow-sm ${
                  isMe ? "bg-[image:var(--gradient-hero)] text-white rounded-tr-sm" : "bg-card border border-border rounded-tl-sm"
                }`}>
                  {m.image_url && <img src={m.image_url} alt="" className="rounded-xl mb-2 max-h-64 object-cover" />}
                  {m.content && <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{m.content}</p>}
                </div>
                {!selectMode && (
                  <div className="flex gap-2 mt-1 transition flex-wrap">
                    {!isMe && <ReportButton targetKind="chat_message" targetId={m.id} content={m.content} />}
                    {(isMe || isMod) && (
                      <button onClick={() => deleteMessage(m.id)} className="text-xs text-destructive flex items-center gap-1">
                        <Trash2 className="h-3 w-3" /> حذف
                      </button>
                    )}
                    {isAdmin && !isMe && !p?.is_banned && (
                      <button onClick={() => banUser(m.user_id, name)} className="text-xs text-amber-600 flex items-center gap-1">
                        <Ban className="h-3 w-3" /> طرد
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      {!chatOpen && !isMod && (
        <div className="bg-amber-50 border-t border-amber-200 px-4 py-5 sticky bottom-0 text-center" dir="rtl">
          <div className="text-3xl mb-2">🔒</div>
          <p className="font-black text-amber-800 text-base">الشات مغلق حالياً</p>
          <p className="text-amber-700 text-sm mt-2 font-semibold">
            يفتح يومياً الساعة <span className="bg-amber-200 px-1.5 py-0.5 rounded font-black">5:00 مساءً</span> بتوقيت سلطنة عُمان
          </p>
          <p className="text-amber-600 text-xs mt-1.5 leading-relaxed">
            كما يفتح أثناء الاجتماعات المجدولة بين المعلمين والطلبة وأولياء الأمور في الوقت المحدد للاجتماع
          </p>
        </div>
      )}
      {(chatOpen || isMod) && !selectMode && (
        <form onSubmit={sendMessage} className="bg-card border-t border-border p-3 sticky bottom-0">
          <div className="max-w-3xl mx-auto relative">
            {showEmoji && (
              <div className="absolute bottom-full mb-2 right-0 z-20">
                <EmojiPicker theme={Theme.AUTO} onEmojiClick={(e) => { setText((t) => t + e.emoji); setShowEmoji(false); }} width={300} height={380} />
              </div>
            )}
            {imagePreview && (
              <div className="relative inline-block mb-2">
                <img src={imagePreview} alt="" className="h-20 rounded-lg" />
                <button type="button" onClick={() => { setImageFile(null); setImagePreview(null); }} className="absolute -top-2 -left-2 bg-destructive text-white rounded-full p-1">
                  <X className="h-3 w-3" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <label className="p-2.5 rounded-xl bg-secondary hover:bg-secondary/80 cursor-pointer">
                <ImageIcon className="h-5 w-5 text-muted-foreground" />
                <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
              </label>
              <button type="button" onClick={() => setShowEmoji((v) => !v)} className="p-2.5 rounded-xl bg-secondary hover:bg-secondary/80" title="إيموجي">
                <Smile className="h-5 w-5 text-muted-foreground" />
              </button>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="اكتب رسالتك..."
                className="flex-1 px-4 py-3 rounded-xl bg-background border border-border focus:outline-none focus:ring-2 focus:ring-[var(--brand)]"
              />
              <button type="submit" disabled={sending || (!text.trim() && !imageFile)} className="p-3 rounded-xl bg-[image:var(--gradient-hero)] text-white shadow-[var(--shadow-soft)] disabled:opacity-50">
                <Send className="h-5 w-5" />
              </button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
