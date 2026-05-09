import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Sparkles, Bot, Image as ImageIcon, X, Palette, Pencil, Eraser, Trash2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MathToolbar } from "@/components/MathToolbar";
import { MathText } from "@/components/MathText";

export const Route = createFileRoute("/assistant")({ component: AssistantPage });

type Msg = { role: "user" | "assistant"; content: string; imageUrl?: string; generatedImage?: string };

// Render React children, wrapping any string segment with <MathText/> so
// math/Arabic-digit conversion works without flattening React nodes to "[object Object]".
function renderWithMath(children: any): any {
  if (children == null || typeof children === "boolean") return children;
  if (typeof children === "string") return <MathText text={children} />;
  if (typeof children === "number") return <MathText text={String(children)} />;
  if (Array.isArray(children)) return children.map((c, i) => <span key={i}>{renderWithMath(c)}</span>);
  return children;
}

function AssistantPage() {
  const navigate = useNavigate();
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingImage, setPendingImage] = useState<{ url: string; previewData: string } | null>(null);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [showDraw, setShowDraw] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      setUid(data.session.user.id);
    });
  }, [navigate]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("الصورة كبيرة (5 ميجا حد أقصى)"); return; }
    setUploadingImage(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${uid}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("chat-images").upload(path, file);
      if (upErr) throw upErr;
      const url = supabase.storage.from("chat-images").getPublicUrl(path).data.publicUrl;
      const reader = new FileReader();
      reader.onload = () => setPendingImage({ url, previewData: reader.result as string });
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error("فشل رفع الصورة: " + (err.message || ""));
    } finally { setUploadingImage(false); e.target.value = ""; }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || loading) return;
    const userMsg: Msg = { role: "user", content: text || (pendingImage ? "حلّل هذه المسألة." : ""), imageUrl: pendingImage?.url };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setPendingImage(null);
    setLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`;
      let token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed.session?.access_token;
      }
      if (!token) { toast.error("يجب تسجيل الدخول"); navigate({ to: "/login" }); setLoading(false); return; }
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ messages: next }),
      });
      if (r.status === 401) { toast.error("انتهت الجلسة، سجّل الدخول مرة أخرى"); navigate({ to: "/login" }); setLoading(false); return; }
      if (r.status === 429) { toast.error("تجاوزنا حد الاستخدام، حاول بعد قليل"); setLoading(false); return; }
      if (r.status === 402) { toast.error("نفد رصيد المساعد، تواصل مع المشرف"); setLoading(false); return; }
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => ({}));
        toast.error(d.error || "تعذّر الرد الآن");
        setLoading(false);
        return;
      }
      const reader = r.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let assistant = "";
      setMessages((m) => [...m, { role: "assistant", content: "" }]);
      let done = false;
      while (!done) {
        const { done: d, value } = await reader.read();
        if (d) break;
        buffer += decoder.decode(value, { stream: true });
        let idx;
        while ((idx = buffer.indexOf("\n")) !== -1) {
          let line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (line.endsWith("\r")) line = line.slice(0, -1);
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") { done = true; break; }
          try {
            const p = JSON.parse(json);
            const c = p.choices?.[0]?.delta?.content;
            if (c) {
              assistant += c;
              setMessages((m) => m.map((mm, i) => i === m.length - 1 ? { ...mm, content: assistant } : mm));
            }
          } catch { buffer = line + "\n" + buffer; break; }
        }
      }
    } catch { toast.error("خطأ في الاتصال"); }
    setLoading(false);
  };

  const generateImage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setMessages((m) => [...m, { role: "user", content: "🎨 توليد صورة: " + text }]);
    setInput("");
    setLoading(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-tutor`;
      let token = (await supabase.auth.getSession()).data.session?.access_token;
      if (!token) {
        const { data: refreshed } = await supabase.auth.refreshSession();
        token = refreshed.session?.access_token;
      }
      if (!token) { toast.error("يجب تسجيل الدخول"); navigate({ to: "/login" }); setLoading(false); return; }
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ mode: "image", messages: [{ role: "user", content: text }] }),
      });
      if (r.status === 429) { const d = await r.json().catch(()=>({})); toast.error(d.error || "تجاوزنا الحد"); setLoading(false); return; }
      if (r.status === 402) { toast.error("نفد الرصيد"); return; }
      if (r.status === 401) { toast.error("يجب تسجيل الدخول"); setLoading(false); return; }
      const data = await r.json();
      if (!data.imageUrl) { toast.error("تعذّر توليد الصورة"); return; }
      const remainTxt = typeof data.remaining === "number" ? `\n\n_متبقي اليوم: ${data.remaining}/2 صور مجانية_` : "";
      setMessages((m) => [...m, { role: "assistant", content: (data.text || "تم إنشاء الصورة 🎨") + remainTxt, generatedImage: data.imageUrl }]);
    } catch { toast.error("خطأ في الاتصال"); }
    setLoading(false);
  };

  return (
    <div dir="rtl" className="min-h-screen bg-background flex flex-col">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> الرئيسية
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white">
              <Bot className="h-5 w-5" />
            </div>
            <h1 className="font-bold">المساعد الذكي</h1>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-4 py-6 max-w-3xl flex flex-col">
        <div className="flex-1 space-y-3 mb-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Sparkles className="h-12 w-12 mx-auto text-[var(--brand)] mb-3" />
              <h2 className="text-xl font-bold mb-2">مرحباً! أنا مساعدك الذكي 🤖</h2>
              <p className="text-sm text-muted-foreground mb-1">اسألني أي سؤال في الرياضيات، أو ارفع صورة لمسألة لأحلها لك</p>
              <p className="text-xs text-muted-foreground mb-4">📷 يدعم الصور — 🔢 يدعم الكسور والجذور</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {["اشرح لي الكسور", "كيف أجمع الأعداد العشرية؟", "ما هي وحدات القياس؟"].map((q) => (
                  <button key={q} onClick={() => setInput(q)} className="text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/70">{q}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-[image:var(--gradient-hero)] text-white" : "bg-card border border-border"}`}>
                {m.imageUrl && <img src={m.imageUrl} alt="" className="mb-2 rounded-xl max-h-64 object-contain bg-white/20" />}
                {m.generatedImage && <img src={m.generatedImage} alt="" className="mb-2 rounded-xl max-h-80 object-contain bg-white/20" />}
                {m.role === "assistant" ? (
                  <div className="prose prose-sm max-w-none [&_p]:my-1 [&_ul]:my-1 [&_ol]:my-1" dir="rtl">
                    <ReactMarkdown
                      components={{
                        p: ({ children }) => <p>{renderWithMath(children)}</p>,
                        li: ({ children }) => <li>{renderWithMath(children)}</li>,
                      }}
                    >{m.content || "..."}</ReactMarkdown>
                  </div>
                ) : <div className="whitespace-pre-wrap"><MathText text={m.content} /></div>}
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        <div className="sticky bottom-0 bg-background pt-2 space-y-2">
          {pendingImage && (
            <div className="relative inline-block">
              <img src={pendingImage.previewData} alt="معاينة" className="max-h-32 rounded-xl border border-border" />
              <button onClick={() => setPendingImage(null)}
                className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          <MathToolbar targetRef={inputRef} onChange={setInput} />
          <div className="flex gap-2">
            <label className="px-3 py-3 rounded-2xl border border-border bg-card cursor-pointer hover:bg-secondary inline-flex items-center" title="إرفاق صورة">
              <ImageIcon className="h-4 w-4" />
              <input type="file" accept="image/*" onChange={onPickImage} className="hidden" disabled={uploadingImage || loading} />
            </label>
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder={uploadingImage ? "جاري رفع الصورة..." : "اكتب سؤالك بالعربي..."}
              disabled={loading || uploadingImage}
              className="flex-1 px-4 py-3 rounded-2xl border border-border bg-card"
            />
            <button onClick={() => setShowDraw(true)} disabled={loading || uploadingImage} title="ارسم بنفسك"
              className="px-3 py-3 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white disabled:opacity-50">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={generateImage} disabled={loading || uploadingImage || !input.trim()} title="توليد صورة من النص"
              className="px-3 py-3 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-violet-500 text-white disabled:opacity-50">
              <Palette className="h-4 w-4" />
            </button>
            <button onClick={send} disabled={loading || uploadingImage || (!input.trim() && !pendingImage)}
              className="px-5 py-3 rounded-2xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      </main>
      {showDraw && uid && (
        <DrawModal uid={uid} onClose={() => setShowDraw(false)}
          onAttach={(url, data) => { setPendingImage({ url, previewData: data }); setShowDraw(false); }} />
      )}
    </div>
  );
}

function DrawModal({ uid, onClose, onAttach }: { uid: string; onClose: () => void; onAttach: (url: string, dataUrl: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState("#7c3aed");
  const [size, setSize] = useState(4);
  const [erasing, setErasing] = useState(false);
  const drawing = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const c = ref.current!; const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height);
  }, []);

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (ref.current!.width / r.width), y: (e.clientY - r.top) * (ref.current!.height / r.height) };
  };
  const down = (e: React.PointerEvent) => { drawing.current = true; last.current = pos(e); };
  const move = (e: React.PointerEvent) => {
    if (!drawing.current || !last.current) return;
    const ctx = ref.current!.getContext("2d")!;
    const p = pos(e);
    ctx.strokeStyle = erasing ? "#ffffff" : color;
    ctx.lineWidth = erasing ? size * 4 : size;
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(p.x, p.y); ctx.stroke();
    last.current = p;
  };
  const up = () => { drawing.current = false; last.current = null; };
  const clear = () => { const c = ref.current!; const ctx = c.getContext("2d")!; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, c.width, c.height); };
  const send = async () => {
    setBusy(true);
    try {
      const dataUrl = ref.current!.toDataURL("image/png");
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${uid}/draw-${Date.now()}.png`;
      const { error } = await supabase.storage.from("chat-images").upload(path, blob, { contentType: "image/png" });
      if (error) throw error;
      const url = supabase.storage.from("chat-images").getPublicUrl(path).data.publicUrl;
      onAttach(url, dataUrl);
    } catch (e: any) { toast.error("فشل الإرسال: " + (e.message || "")); } finally { setBusy(false); }
  };

  return (
    <div dir="rtl" className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card rounded-3xl max-w-2xl w-full p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold flex items-center gap-2"><Pencil className="h-5 w-5" /> ارسم وأرسل للمساعد</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input type="color" value={color} onChange={(e) => { setColor(e.target.value); setErasing(false); }} className="h-9 w-12 rounded cursor-pointer" />
          <input type="range" min={2} max={20} value={size} onChange={(e) => setSize(parseInt(e.target.value))} />
          <button onClick={() => setErasing(!erasing)} className={`px-3 py-1.5 rounded-lg text-sm font-bold inline-flex items-center gap-1 ${erasing ? "bg-amber-500 text-white" : "bg-secondary"}`}>
            <Eraser className="h-3 w-3" /> ممحاة
          </button>
          <button onClick={clear} className="px-3 py-1.5 rounded-lg text-sm font-bold bg-rose-100 text-rose-700 inline-flex items-center gap-1">
            <Trash2 className="h-3 w-3" /> مسح
          </button>
        </div>
        <canvas ref={ref} width={800} height={500} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up}
          className="w-full bg-white rounded-2xl border border-border touch-none cursor-crosshair" />
        <button onClick={send} disabled={busy} className="w-full px-5 py-3 rounded-2xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
          {busy ? "..." : "إرسال للمساعد ✓"}
        </button>
      </div>
    </div>
  );
}
