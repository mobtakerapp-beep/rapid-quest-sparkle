import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Image as ImageIcon, Upload, Trash2, Sparkles, Video, Send, Smile, X, Type, CheckSquare, Square, ShieldAlert } from "lucide-react";
import EmojiPicker, { Theme } from "emoji-picker-react";
import { ReportButton } from "@/components/ReportButton";
import { Reactions } from "@/components/Reactions";
import { ImageTextEditor } from "@/components/ImageTextEditor";

export const Route = createFileRoute("/gallery")({ component: GalleryPage });

type Item = { id: string; user_id: string; content: string | null; image_url: string | null; created_at: string };
type Profile = { id: string; display_name: string | null };
type Comment = { id: string; item_id: string; user_id: string; content: string; created_at: string };

const isVideo = (url: string) => /\.(mp4|webm|mov|m4v|ogg)(\?|$)/i.test(url);

function GalleryPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isMod, setIsMod] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [openItem, setOpenItem] = useState<Item | null>(null);
  const [showImageEditor, setShowImageEditor] = useState(false);

  // Bulk select/delete
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      setUid(data.session.user.id);
      const { data: roles } = await supabase.from("user_roles").select("role").eq("user_id", data.session.user.id);
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      setIsMod(!!roles?.some((r) => ["admin", "supervisor"].includes(String(r.role))));
      load();
    });
  }, [navigate]);

  const [offset, setOffset] = useState(0);
  const PAGE = 30;

  const load = async (reset = true) => {
    const off = reset ? 0 : offset;
    const { data } = await supabase.from("messages").select("*").eq("category", "gallery")
      .order("created_at", { ascending: false }).range(off, off + PAGE - 1);
    const list = (data || []) as Item[];
    if (reset) { setItems(list); setOffset(PAGE); }
    else {
      setItems((prev) => {
        const ids = new Set(prev.map((i) => i.id));
        return [...prev, ...list.filter((i) => !ids.has(i.id))];
      });
      setOffset(off + PAGE);
    }
    const ids = Array.from(new Set(list.map((i) => i.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      const map: Record<string, Profile> = {};
      profs?.forEach((p) => (map[p.id] = p));
      setProfiles((prev) => ({ ...prev, ...map }));
    }
  };

  useEffect(() => {
    const ch = supabase.channel("gallery-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: "category=eq.gallery" }, (payload) => {
        const newItem = payload.new as Item;
        setItems((prev) => {
          if (prev.some((i) => i.id === newItem.id)) return prev;
          return [newItem, ...prev];
        });
        supabase.from("profiles").select("id, display_name").eq("id", newItem.user_id).maybeSingle().then(({ data }) => {
          if (data) setProfiles((p) => ({ ...p, [data.id]: data }));
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages", filter: "category=eq.gallery" }, (payload) => {
        setItems((prev) => prev.filter((i) => i.id !== (payload.old as any).id));
      })
      .subscribe();
    const poll = setInterval(() => load(true), 30000);
    return () => { supabase.removeChannel(ch); clearInterval(poll); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onPick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const isImg = f.type.startsWith("image/");
    const isVid = f.type.startsWith("video/");
    if (!isImg && !isVid) return toast.error("فقط صور أو فيديوهات");
    const limit = isVid ? 50 : 10;
    if (f.size > limit * 1024 * 1024) return toast.error(`الملف كبير (الحد ${limit} ميجا)`);
    setFile(f);
    setPreview(URL.createObjectURL(f));
  };

  const upload = async () => {
    if (!uid) return;
    if (!file && !caption.trim()) { toast.error("اكتب نصاً أو اختر ملفاً"); return; }
    setUploading(true);
    try {
      let publicUrl: string | null = null;
      if (file) {
        const ext = file.name.split(".").pop();
        const path = `${uid}/${Date.now()}.${ext}`;
        const bucket = file.type.startsWith("video/") ? "gallery-media" : "chat-images";
        const { error: upErr } = await supabase.storage.from(bucket).upload(path, file);
        if (upErr) throw upErr;
        publicUrl = supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
      }
      const { error } = await supabase.from("messages").insert({
        user_id: uid, content: caption.trim() || null, image_url: publicUrl, category: "gallery",
      });
      if (error) throw error;
      toast.success("تم النشر ✨");
      setFile(null); setPreview(null); setCaption("");
      load(true);
    } catch (e: any) {
      toast.error(e.message || "فشل النشر");
    } finally { setUploading(false); }
  };

  const delFromStorage = async (url: string) => {
    for (const bucket of ["chat-images", "gallery-media"]) {
      const marker = `/storage/v1/object/public/${bucket}/`;
      const idx = url.indexOf(marker);
      if (idx !== -1) {
        const path = decodeURIComponent(url.slice(idx + marker.length).split("?")[0]);
        await supabase.storage.from(bucket).remove([path]);
        break;
      }
    }
  };

  const del = async (id: string) => {
    const item = items.find((i) => i.id === id);
    const { error } = await supabase.from("messages").delete().eq("id", id);
    if (error) return toast.error("لا يمكن الحذف");
    if (item?.image_url) await delFromStorage(item.image_url);
    setItems((p) => p.filter((i) => i.id !== id));
    if (openItem?.id === id) setOpenItem(null);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const bulkDelete = async () => {
    if (selected.size === 0) return;
    if (!confirm(`حذف ${selected.size} عنصر نهائياً من الأرشيف والتخزين؟`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    for (const item of items.filter((i) => ids.includes(i.id) && i.image_url)) {
      if (item.image_url) await delFromStorage(item.image_url);
    }
    const { error } = await supabase.from("messages").delete().in("id", ids);
    setBulkDeleting(false);
    if (error) return toast.error("فشل الحذف: " + error.message);
    toast.success(`تم حذف ${ids.length} عنصر وتحرير المساحة ✨`);
    setItems((p) => p.filter((i) => !ids.includes(i.id)));
    setSelected(new Set());
    setSelectMode(false);
  };

  const selectAll = () => setSelected(new Set(items.map((i) => i.id)));
  const clearSelect = () => { setSelected(new Set()); setSelectMode(false); };

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10 backdrop-blur bg-card/90">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> الرئيسية
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 flex items-center justify-center text-white">
              <ImageIcon className="h-5 w-5" />
            </div>
            <h1 className="font-bold">معرض الإبداعات</h1>
          </div>
          {isMod && (
            <button onClick={() => { setSelectMode((v) => !v); setSelected(new Set()); }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold transition ${selectMode ? "bg-rose-100 text-rose-700" : "bg-secondary hover:bg-secondary/70"}`}>
              <ShieldAlert className="h-4 w-4" />
              {selectMode ? "إلغاء" : "تحديد للحذف"}
            </button>
          )}
        </div>
      </header>

      {/* Bulk delete bar */}
      {selectMode && isMod && (
        <div className="sticky top-[57px] z-20 bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center gap-3" dir="rtl">
          <span className="text-sm font-bold text-rose-700">{selected.size} محدد</span>
          <button onClick={selectAll} className="text-xs px-3 py-1 rounded-lg bg-rose-100 text-rose-700 font-bold hover:bg-rose-200">تحديد الكل ({items.length})</button>
          <button onClick={clearSelect} className="text-xs px-3 py-1 rounded-lg bg-secondary font-bold hover:bg-secondary/70">إلغاء التحديد</button>
          <button onClick={bulkDelete} disabled={selected.size === 0 || bulkDeleting}
            className="mr-auto inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-rose-600 text-white text-sm font-bold disabled:opacity-50">
            <Trash2 className="h-4 w-4" /> {bulkDeleting ? "جاري الحذف..." : `حذف (${selected.size})`}
          </button>
        </div>
      )}

      <main className="container mx-auto px-4 py-6 max-w-5xl">
        <div className="bg-card rounded-3xl border border-border p-5 mb-6 shadow-[var(--shadow-card)] relative">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="h-4 w-4 text-[var(--brand)]" />
            <h2 className="font-bold">شارك إبداعك (صورة أو فيديو)</h2>
          </div>
          {preview && (
            file?.type.startsWith("video/")
              ? <video src={preview} controls className="rounded-2xl max-h-60 mb-3" />
              : <img src={preview} alt="" className="rounded-2xl max-h-60 mb-3 object-cover" />
          )}
          <div className="relative mb-3">
            <textarea value={caption} onChange={(e) => setCaption(e.target.value)}
              placeholder="اكتب وصفاً قصيراً... 😊" rows={2}
              className="w-full px-4 py-2 rounded-xl border border-border bg-background resize-none pl-10" />
            <button type="button" onClick={() => setShowEmoji((v) => !v)}
              className="absolute bottom-2 left-2 p-1.5 rounded-lg hover:bg-secondary">
              <Smile className="h-4 w-4 text-muted-foreground" />
            </button>
            {showEmoji && (
              <div className="absolute bottom-full mb-2 left-0 z-30">
                <EmojiPicker theme={Theme.AUTO} width={300} height={350}
                  onEmojiClick={(e) => { setCaption((t) => t + e.emoji); setShowEmoji(false); }} />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <label className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary hover:bg-secondary/80 text-sm">
              <Upload className="h-4 w-4" /> اختر صورة أو فيديو
              <input type="file" accept="image/*,video/*" onChange={onPick} className="hidden" />
            </label>
            <button type="button" onClick={() => setShowImageEditor(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-violet-100 text-violet-700 hover:bg-violet-200 text-sm font-bold transition">
              <Type className="h-4 w-4" /> اكتب على صورة
            </button>
            <button onClick={upload} disabled={(!file && !caption.trim()) || uploading}
              className="px-5 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
              {uploading ? "جاري الرفع..." : "نشر"}
            </button>
          </div>
        </div>

        {items.length === 0 ? (
          <div className="text-center text-muted-foreground py-20 text-sm">لا توجد إبداعات بعد. كن أول من يشارك! 🎨</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {items.map((it) => {
              const isMine = it.user_id === uid;
              const name = profiles[it.user_id]?.display_name || "مستخدم";
              const vid = it.image_url ? isVideo(it.image_url) : false;
              const isSelected = selected.has(it.id);
              return (
                <div key={it.id}
                  className={`group relative rounded-2xl overflow-hidden border bg-card cursor-pointer transition ${isSelected ? "border-rose-500 ring-2 ring-rose-400" : "border-border"}`}
                  onClick={() => selectMode ? toggleSelect(it.id) : setOpenItem(it)}>
                  {it.image_url ? (
                    vid ? (
                      <div className="relative">
                        <video src={it.image_url} className="w-full aspect-square object-cover" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                          <Video className="h-10 w-10 text-white" />
                        </div>
                      </div>
                    ) : (
                      <img src={it.image_url} alt="" className="w-full aspect-square object-cover" loading="lazy" />
                    )
                  ) : (
                    <div className="w-full aspect-square p-4 flex items-center justify-center bg-[image:var(--gradient-warm)] text-white text-center text-sm font-semibold">
                      {it.content}
                    </div>
                  )}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-white text-xs">
                    <div className="font-bold">{name}</div>
                    {it.image_url && it.content && <div className="opacity-90 line-clamp-2">{it.content}</div>}
                  </div>
                  {/* Selection indicator */}
                  {selectMode && (
                    <div className="absolute top-2 right-2">
                      {isSelected
                        ? <CheckSquare className="h-6 w-6 text-rose-500 drop-shadow" />
                        : <Square className="h-6 w-6 text-white drop-shadow opacity-80" />}
                    </div>
                  )}
                  {!selectMode && (
                    <div className="absolute top-2 left-2 flex gap-1">
                      <ReportButton targetKind="gallery" targetId={it.id} content={it.content} className="bg-white/90 px-1.5 py-1 rounded-lg" label="" />
                      {(isMine || isMod) && (
                        <button onClick={(e) => { e.stopPropagation(); del(it.id); }}
                          className="bg-destructive/90 text-white p-1.5 rounded-lg">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        {items.length >= PAGE && (
          <div className="flex justify-center mt-6">
            <button onClick={() => load(false)} className="px-6 py-2.5 rounded-xl border-2 border-border hover:bg-secondary font-bold text-sm">
              تحميل المزيد
            </button>
          </div>
        )}
      </main>

      {openItem && uid && (
        <ItemModal
          item={openItem}
          uid={uid}
          isAdmin={isMod}
          authorName={profiles[openItem.user_id]?.display_name || "مستخدم"}
          onClose={() => setOpenItem(null)}
        />
      )}
      {showImageEditor && <ImageTextEditor onClose={() => setShowImageEditor(false)} />}
    </div>
  );
}

function ItemModal({ item, uid, isAdmin, authorName, onClose }: { item: Item; uid: string; isAdmin: boolean; authorName: string; onClose: () => void }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [sending, setSending] = useState(false);
  const vid = item.image_url ? isVideo(item.image_url) : false;

  const loadComments = async () => {
    const { data } = await supabase.from("gallery_comments").select("*").eq("item_id", item.id).order("created_at");
    const list = (data || []) as Comment[];
    setComments(list);
    const ids = Array.from(new Set(list.map((c) => c.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
      const map: Record<string, Profile> = {};
      profs?.forEach((p) => (map[p.id] = p));
      setProfiles(map);
    }
  };

  useEffect(() => {
    loadComments();
    const ch = supabase.channel(`gallery-comments-${item.id}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gallery_comments", filter: `item_id=eq.${item.id}` }, (payload) => {
        const newComment = payload.new as Comment;
        setComments((prev) => {
          if (prev.some((c) => c.id === newComment.id)) return prev;
          return [...prev, newComment];
        });
        supabase.from("profiles").select("id, display_name").eq("id", newComment.user_id).maybeSingle().then(({ data }) => {
          if (data) setProfiles((p) => ({ ...p, [data.id]: data }));
        });
      })
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "gallery_comments", filter: `item_id=eq.${item.id}` }, (payload) => {
        setComments((prev) => prev.filter((c) => c.id !== (payload.old as any).id));
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item.id]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    const { error } = await supabase.from("gallery_comments").insert({ item_id: item.id, user_id: uid, content: text.trim() });
    setSending(false);
    if (error) return toast.error(`فشل الإرسال: ${error.message}`);
    setText("");
    loadComments();
  };

  const delComment = async (id: string) => {
    const { error } = await supabase.from("gallery_comments").delete().eq("id", id);
    if (error) return toast.error("لا يمكن الحذف");
    setComments((p) => p.filter((c) => c.id !== id));
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col md:flex-row" onClick={(e) => e.stopPropagation()}>
        {item.image_url && (
          <div className="md:w-1/2 bg-black flex items-center justify-center max-h-[40vh] md:max-h-none">
            {vid
              ? <video src={item.image_url} controls autoPlay className="max-h-full max-w-full" />
              : <img src={item.image_url} alt="" className="max-h-full max-w-full object-contain" />}
          </div>
        )}
        <div className="md:w-1/2 flex flex-col min-h-0">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <div className="font-bold">{authorName}</div>
              {item.content && <div className="text-sm text-muted-foreground">{item.content}</div>}
            </div>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
          </div>
          <div className="px-4 pt-3 pb-1 border-b border-border">
            <Reactions targetType="gallery" targetId={item.id} uid={uid} />
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {comments.length === 0 && <div className="text-center text-muted-foreground text-sm py-8">لا توجد تعليقات بعد</div>}
            {comments.map((c) => {
              const name = profiles[c.user_id]?.display_name || "مستخدم";
              const canDel = c.user_id === uid || isAdmin;
              return (
                <div key={c.id} className="group flex gap-2">
                  <div className="h-8 w-8 rounded-full bg-[image:var(--gradient-warm)] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                    {name.charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold mb-0.5">{name}</div>
                    <div className="bg-secondary rounded-2xl px-3 py-2 text-sm break-words">{c.content}</div>
                  </div>
                  <div className="flex flex-col gap-1 items-end">
                    <ReportButton targetKind="gallery_comment" targetId={c.id} content={c.content} label="" />
                    {canDel && (
                      <button onClick={() => delComment(c.id)} className="text-destructive p-1">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <form onSubmit={send} className="p-3 border-t border-border relative">
            {showEmoji && (
              <div className="absolute bottom-full mb-2 left-2 z-10">
                <EmojiPicker theme={Theme.AUTO} width={280} height={320}
                  onEmojiClick={(e) => { setText((t) => t + e.emoji); setShowEmoji(false); }} />
              </div>
            )}
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setShowEmoji((v) => !v)} className="p-2 rounded-xl bg-secondary">
                <Smile className="h-4 w-4 text-muted-foreground" />
              </button>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="أضف تعليقاً..."
                className="flex-1 px-4 py-2 rounded-xl border border-border bg-background text-sm" />
              <button type="submit" disabled={sending || !text.trim()}
                className="p-2 rounded-xl bg-[image:var(--gradient-hero)] text-white disabled:opacity-50">
                <Send className="h-4 w-4" />
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
