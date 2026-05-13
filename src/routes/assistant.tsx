import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Send, Sparkles, Bot, Image as ImageIcon, X, Palette, Pencil, Eraser, Trash2, Download } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { MathToolbar } from "@/components/MathToolbar";
import { MathText } from "@/components/MathText";
import { useLang } from "@/contexts/LanguageContext";

export const Route = createFileRoute("/assistant")({ component: AssistantPage });

type Msg = { role: "user" | "assistant"; content: string; imageUrl?: string; generatedImage?: string };

function renderWithMath(children: any): any {
  if (children == null || typeof children === "boolean") return children;
  if (typeof children === "string") return <MathText text={children} />;
  if (typeof children === "number") return <MathText text={String(children)} />;
  if (Array.isArray(children)) return children.map((c, i) => <span key={i}>{renderWithMath(c)}</span>);
  return children;
}

function downloadImage(url: string) {
  const a = document.createElement("a");
  a.href = url;
  a.download = `assistant-image-${Date.now()}.png`;
  a.target = "_blank";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

function AssistantPage() {
  const navigate = useNavigate();
  // ← must be before any conditional returns
  const { lang } = useLang();
  const isAr = lang === "ar";

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
      if (data.session) setUid(data.session.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setUid(session?.user?.id ?? null);
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const onPickImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    if (file.size > 5 * 1024 * 1024) { toast.error(isAr ? "الصورة كبيرة (5 ميجا حد أقصى)" : "Image too large (5 MB max)"); return; }
    setUploadingImage(true);
    try {
      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${uid}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("chat-images").upload(path, file, { contentType: file.type || "image/png", upsert: false });
      if (upErr) throw upErr;
      const url = supabase.storage.from("chat-images").getPublicUrl(path).data.publicUrl;
      const reader = new FileReader();
      reader.onload = () => setPendingImage({ url, previewData: reader.result as string });
      reader.readAsDataURL(file);
    } catch (err: any) {
      toast.error((isAr ? "فشل رفع الصورة: " : "Upload failed: ") + (err.message || ""));
    } finally { setUploadingImage(false); e.target.value = ""; }
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || loading) return;
    const userMsg: Msg = { role: "user", content: text || (pendingImage ? (isAr ? "حلّل هذه المسألة." : "Analyze this problem.") : ""), imageUrl: pendingImage?.url };
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
      if (!token) { toast.error(isAr ? "سجّل الدخول لاستخدام المساعد" : "Please log in to use the assistant"); setLoading(false); return; }
      // System prompt: always reply in the SAME language the user writes in (auto-detect)
      const systemMsg = {
        role: "system",
        content: isAr
          ? "أنت مساعد تعليمي متخصص في الرياضيات لطلاب الصف الخامس في سلطنة عُمان. اكتشف لغة رسالة المستخدم وأجب دائماً بنفس اللغة: إذا كتب عربياً فأجب بالعربية الفصحى البسيطة، وإذا كتب إنجليزياً فأجب بالإنجليزية البسيطة. استخدم أمثلة من الحياة اليومية وكن مشجعاً وإيجابياً."
          : "You are an educational math assistant for 5th grade students in Oman. Detect the language the user writes in and ALWAYS reply in that same language: if they write in Arabic respond in simple Arabic, if they write in English respond in simple English. Use everyday examples and be encouraging and positive.",
      };
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ messages: [systemMsg, ...next] }),
      });
      if (r.status === 401) { toast.error("سجّل الدخول لاستخدام المساعد"); setLoading(false); return; }
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

  // Detect if text contains Arabic characters
  const containsArabic = (s: string) => /[\u0600-\u06FF]/.test(s);

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
      if (!token) { toast.error("سجّل الدخول لاستخدام المساعد"); setLoading(false); return; }
      // Always force Arabic text inside the generated image
      const arabicHint = containsArabic(text)
        ? `Educational illustration for: "${text}". Write ALL text, numbers, and labels inside the image in Arabic calligraphy only — no English or Latin characters anywhere. Colorful, child-friendly, 5th grade math style.`
        : `Educational illustration for: "${text}". Write all labels, numbers, and captions inside the image in Arabic language only. Use Arabic numerals (٠١٢٣٤٥٦٧٨٩). Colorful, child-friendly, 5th grade math style.`;
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ mode: "image", messages: [{ role: "user", content: arabicHint }] }),
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

  const dir = isAr ? "rtl" : "ltr";

  const suggestions = isAr
    ? ["اشرح لي الكسور", "كيف أجمع الأعداد العشرية؟", "ما هي وحدات القياس؟"]
    : ["Explain fractions", "How do I add decimals?", "What are units of measurement?"];

  return (
    <div dir={dir} className="min-h-screen bg-background flex flex-col">
      {/* Header — sticky at top (math toolbar moved above the input box below) */}
      <div className="sticky top-0 z-10 bg-card border-b border-border">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> {isAr ? "الرئيسية" : "Home"}
          </Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-violet-500 to-pink-500 flex items-center justify-center text-white">
              <Bot className="h-5 w-5" />
            </div>
            <h1 className="font-bold">{isAr ? "المساعد الذكي" : "AI Assistant"}</h1>
          </div>
        </div>
      </div>

      <main className="flex-1 container mx-auto px-4 py-6 max-w-3xl flex flex-col">
        <div className="flex-1 space-y-3 mb-4">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Sparkles className="h-12 w-12 mx-auto text-[var(--brand)] mb-3" />
              <h2 className="text-xl font-bold mb-2">{isAr ? "مرحباً! أنا مساعدك الذكي 🤖" : "Hello! I'm your AI Assistant 🤖"}</h2>
              <p className="text-sm text-muted-foreground mb-1">
                {isAr ? "اسألني أي سؤال في الرياضيات، أو ارفع صورة لمسألة لأحلها لك" : "Ask me any math question, or upload a photo of a problem and I'll solve it for you"}
              </p>
              <p className="text-xs text-muted-foreground mb-4">📷 {isAr ? "يدعم الصور — 🔢 يدعم الكسور والجذور" : "Supports images — 🔢 Supports fractions & roots"}</p>
              <div className="flex flex-wrap gap-2 justify-center">
                {suggestions.map((q) => (
                  <button key={q} onClick={() => setInput(q)} className="text-xs px-3 py-1.5 rounded-full bg-secondary hover:bg-secondary/70">{q}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-start" : "justify-end"}`}>
              <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${m.role === "user" ? "bg-[image:var(--gradient-hero)] text-white" : "bg-card border border-border"}`}>
                {m.imageUrl && <img src={m.imageUrl} alt="" className="mb-2 rounded-xl max-h-64 object-contain bg-white/20" />}
                {m.generatedImage && (
                  <div className="relative mb-2 group">
                    <img src={m.generatedImage} alt="" className="rounded-xl max-h-80 object-contain bg-white/20 w-full" />
                    <button
                      onClick={() => downloadImage(m.generatedImage!)}
                      className="absolute top-2 left-2 opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 hover:bg-black text-white p-2 rounded-xl flex items-center gap-1.5 text-xs font-bold"
                      title="تحميل الصورة"
                    >
                      <Download className="h-4 w-4" />
                      تحميل
                    </button>
                  </div>
                )}
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
          {/* Math toolbar — pinned directly above the input box */}
          <MathToolbar targetRef={inputRef} onChange={setInput} />
          {pendingImage && (
            <div className="relative inline-block">
              <img src={pendingImage.previewData} alt="معاينة" className="max-h-32 rounded-xl border border-border" />
              <button onClick={() => setPendingImage(null)}
                className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-destructive text-white flex items-center justify-center">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
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
              placeholder={uploadingImage ? (isAr ? "جاري رفع الصورة..." : "Uploading image...") : (isAr ? "اكتب سؤالك هنا..." : "Type your question here...")}
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
