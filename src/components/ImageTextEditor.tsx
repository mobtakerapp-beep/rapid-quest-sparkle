import { useRef, useState, useEffect } from "react";
import { X, Download, Type, Image as ImageIcon, RefreshCw, Send } from "lucide-react";

type Props = {
  onClose: () => void;
  initialImageUrl?: string;
  onSend?: (dataUrl: string) => Promise<void>;
};

const FONT_SIZES = [20, 28, 36, 48, 60, 72, 90, 110];

const COLORS = [
  "#ffffff", "#000000", "#fbbf24", "#f87171", "#34d399",
  "#60a5fa", "#a78bfa", "#f472b6", "#fb923c", "#4ade80",
];

const BG_OPTIONS = [
  { label: "بدون خلفية", value: "none" },
  { label: "شفاف داكن", value: "dark" },
  { label: "شفاف فاتح", value: "light" },
  { label: "ملوّن", value: "colored" },
];

const FONTS: { label: string; family: string; googleName?: string; lang: "ar" | "en" | "both" }[] = [
  { label: "طجوال (عصري)", family: "Tajawal", googleName: "Tajawal:wght@400;700;900", lang: "ar" },
  { label: "القاهرة (أنيق)", family: "Cairo", googleName: "Cairo:wght@400;700;900", lang: "ar" },
  { label: "أميري (كلاسيك)", family: "Amiri", googleName: "Amiri:wght@400;700", lang: "ar" },
  { label: "شهرزاد", family: "Scheherazade New", googleName: "Scheherazade+New:wght@400;700", lang: "ar" },
  { label: "ليمونادا", family: "Lemonada", googleName: "Lemonada:wght@400;700", lang: "ar" },
  { label: "تشانجا", family: "Changa", googleName: "Changa:wght@400;700", lang: "ar" },
  { label: "ريدكس برو", family: "Readex Pro", googleName: "Readex+Pro:wght@400;700", lang: "ar" },
  { label: "عربي يدوي", family: "Aref Ruqaa", googleName: "Aref+Ruqaa:wght@400;700", lang: "ar" },
  { label: "خط كوفي", family: "Reem Kufi", googleName: "Reem+Kufi:wght@400;700", lang: "ar" },
  { label: "Pacifico (مرح)", family: "Pacifico", googleName: "Pacifico", lang: "en" },
  { label: "Lobster (أنيق)", family: "Lobster", googleName: "Lobster", lang: "en" },
  { label: "Dancing Script", family: "Dancing Script", googleName: "Dancing+Script:wght@400;700", lang: "en" },
  { label: "Bebas Neue (عريض)", family: "Bebas Neue", googleName: "Bebas+Neue", lang: "en" },
  { label: "Playfair Display", family: "Playfair Display", googleName: "Playfair+Display:wght@400;700", lang: "en" },
  { label: "Cinzel (روماني)", family: "Cinzel", googleName: "Cinzel:wght@400;700", lang: "en" },
];

function loadGoogleFont(googleName: string) {
  const id = `gf-${googleName.replace(/[^a-zA-Z]/g, "")}`;
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `https://fonts.googleapis.com/css2?family=${googleName}&display=swap`;
  document.head.appendChild(link);
}

export function ImageTextEditor({ onClose, initialImageUrl, onSend }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState("#ffffff");
  const [bgStyle, setBgStyle] = useState<"none" | "dark" | "light" | "colored">("dark");
  const [bgColor, setBgColor] = useState("#000000");
  const [bgOpacity, setBgOpacity] = useState(0.45);
  const [textPos, setTextPos] = useState<{ x: number; y: number }>({ x: 0.5, y: 0.82 });
  const [bold, setBold] = useState(true);
  const [selectedFont, setSelectedFont] = useState("Tajawal");
  const [fontTab, setFontTab] = useState<"ar" | "en">("ar");
  const [sending, setSending] = useState(false);
  const isDragging = useRef(false);

  useEffect(() => {
    FONTS.forEach((f) => { if (f.googleName) loadGoogleFont(f.googleName); });
    if (initialImageUrl) {
      fetch(initialImageUrl)
        .then((r) => r.blob())
        .then((blob) => {
          const reader = new FileReader();
          reader.onload = (ev) => setImgSrc(ev.target?.result as string);
          reader.readAsDataURL(blob);
        })
        .catch(() => setImgSrc(initialImageUrl));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imgSrc) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = new window.Image();
    img.onload = () => {
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      ctx.drawImage(img, 0, 0);
      if (!text.trim()) return;
      const W = canvas.width;
      const H = canvas.height;
      const scale = W / 600;
      const fs = Math.round(fontSize * scale);
      const fontFamily = `"${selectedFont}", Tajawal, Cairo, Arial`;
      ctx.font = `${bold ? "900" : "400"} ${fs}px ${fontFamily}`;
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      const lineH = fs * 1.45;
      const words = text.split(" ");
      const maxWidth = W * 0.88;
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const test = cur ? cur + " " + w : w;
        if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      const totalH = lines.length * lineH;

      const xCenter = textPos.x * W;
      const blockCenter = textPos.y * H;
      const blockTop = blockCenter - totalH / 2;
      const yStart = blockTop + fs * 0.85;

      if (bgStyle !== "none") {
        const padding = 24 * scale;
        ctx.font = `${bold ? "900" : "400"} ${fs}px ${fontFamily}`;
        const maxLineW = Math.max(...lines.map((l) => ctx.measureText(l).width));
        const boxW = Math.min(maxLineW + padding * 2, W * 0.97);
        const boxH = totalH + padding;
        const boxX = xCenter - boxW / 2;
        const boxY = blockTop - padding * 0.3;
        let hex = bgStyle === "colored" ? bgColor : bgStyle === "dark" ? "#000000" : "#ffffff";
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b2 = parseInt(hex.slice(5, 7), 16);
        ctx.fillStyle = `rgba(${r},${g},${b2},${bgOpacity})`;
        const radius = 16 * scale;
        ctx.beginPath();
        ctx.moveTo(boxX + radius, boxY);
        ctx.lineTo(boxX + boxW - radius, boxY);
        ctx.quadraticCurveTo(boxX + boxW, boxY, boxX + boxW, boxY + radius);
        ctx.lineTo(boxX + boxW, boxY + boxH - radius);
        ctx.quadraticCurveTo(boxX + boxW, boxY + boxH, boxX + boxW - radius, boxY + boxH);
        ctx.lineTo(boxX + radius, boxY + boxH);
        ctx.quadraticCurveTo(boxX, boxY + boxH, boxX, boxY + boxH - radius);
        ctx.lineTo(boxX, boxY + radius);
        ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
        ctx.closePath();
        ctx.fill();
      }

      ctx.shadowColor = bgStyle === "none" ? "rgba(0,0,0,0.8)" : "transparent";
      ctx.shadowBlur = bgStyle === "none" ? 8 * scale : 0;
      ctx.shadowOffsetX = bgStyle === "none" ? 2 * scale : 0;
      ctx.shadowOffsetY = bgStyle === "none" ? 2 * scale : 0;
      ctx.fillStyle = color;
      ctx.font = `${bold ? "900" : "400"} ${fs}px ${fontFamily}`;
      ctx.textAlign = "center";
      ctx.direction = "rtl";
      lines.forEach((line, i) => {
        ctx.fillText(line, xCenter, yStart + i * lineH);
      });
    };
    img.src = imgSrc;
  };

  useEffect(() => { draw(); }, [imgSrc, text, fontSize, color, textPos, bold, selectedFont, bgStyle, bgColor, bgOpacity]);

  const toNorm = (clientX: number, clientY: number, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0.02, Math.min(0.98, (clientX - rect.left) / rect.width)),
      y: Math.max(0.02, Math.min(0.98, (clientY - rect.top) / rect.height)),
    };
  };

  const onCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    isDragging.current = true;
    setTextPos(toNorm(e.clientX, e.clientY, canvas));
  };
  const onCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return;
    const canvas = canvasRef.current; if (!canvas) return;
    setTextPos(toNorm(e.clientX, e.clientY, canvas));
  };
  const onCanvasMouseUp = () => { isDragging.current = false; };

  const onCanvasTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const t = e.touches[0]; if (!t) return;
    isDragging.current = true;
    setTextPos(toNorm(t.clientX, t.clientY, canvas));
  };
  const onCanvasTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return;
    e.preventDefault();
    const canvas = canvasRef.current; if (!canvas) return;
    const t = e.touches[0]; if (!t) return;
    setTextPos(toNorm(t.clientX, t.clientY, canvas));
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => setImgSrc(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement("a");
    a.download = "صورة-مع-نص.png";
    a.href = canvas.toDataURL("image/png");
    a.click();
  };

  const handleSend = async () => {
    const canvas = canvasRef.current;
    if (!canvas || !onSend) return;
    setSending(true);
    try {
      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      await onSend(dataUrl);
      onClose();
    } finally {
      setSending(false);
    }
  };

  const filteredFonts = FONTS.filter((f) => f.lang === fontTab || f.lang === "both");

  return (
    <div className="fixed inset-0 z-[300] bg-black/70 flex items-center justify-center p-3" onClick={onClose}>
      <div dir="rtl" className="bg-card rounded-3xl max-w-2xl w-full max-h-[95vh] overflow-y-auto p-5 space-y-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 font-black text-lg">
            <Type className="h-5 w-5 text-[var(--brand)]" />
            كتابة على الصورة
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-secondary"><X className="h-4 w-4" /></button>
        </div>

        {!imgSrc ? (
          <label className="flex flex-col items-center justify-center gap-3 p-10 border-2 border-dashed border-border rounded-2xl cursor-pointer hover:bg-secondary/30 transition">
            <ImageIcon className="h-10 w-10 text-muted-foreground" />
            <span className="font-bold text-sm">اختر صورة من جهازك</span>
            <input type="file" accept="image/*" className="hidden" onChange={onFile} />
          </label>
        ) : (
          <>
            <div className="relative">
              <canvas
                ref={canvasRef}
                className="w-full rounded-2xl border border-border bg-secondary/20 cursor-crosshair touch-none"
                onMouseDown={onCanvasMouseDown}
                onMouseMove={onCanvasMouseMove}
                onMouseUp={onCanvasMouseUp}
                onMouseLeave={onCanvasMouseUp}
                onTouchStart={onCanvasTouchStart}
                onTouchMove={onCanvasTouchMove}
                onTouchEnd={onCanvasMouseUp}
              />
              {text && (
                <div className="absolute bottom-2 right-2 bg-black/50 text-white text-[10px] px-2 py-0.5 rounded-full pointer-events-none">
                  اسحب على الصورة لتحريك النص
                </div>
              )}
            </div>

            <div className="grid gap-3">
              <div>
                <label className="block text-sm font-bold mb-1">النص</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
                  placeholder="اكتب نصك هنا..."
                  className="w-full px-4 py-2 rounded-xl border border-border bg-background resize-none text-right font-bold text-lg" />
              </div>

              <div>
                <label className="block text-sm font-bold mb-2">الخط</label>
                <div className="flex gap-1 mb-2">
                  <button onClick={() => setFontTab("ar")} className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${fontTab === "ar" ? "bg-[image:var(--gradient-hero)] text-white" : "bg-secondary"}`}>عربي</button>
                  <button onClick={() => setFontTab("en")} className={`px-4 py-1.5 rounded-xl text-xs font-bold transition ${fontTab === "en" ? "bg-[image:var(--gradient-hero)] text-white" : "bg-secondary"}`}>English</button>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {filteredFonts.map((f) => (
                    <button key={f.family} onClick={() => setSelectedFont(f.family)}
                      style={{ fontFamily: `"${f.family}", Tajawal, sans-serif` }}
                      className={`px-3 py-2 rounded-xl border-2 text-sm text-center transition ${selectedFont === f.family ? "border-[var(--brand)] bg-[var(--brand)]/10 font-bold" : "border-border hover:border-[var(--brand)]/40"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <div>
                  <label className="text-xs font-bold mb-1 block">الحجم</label>
                  <select value={fontSize} onChange={(e) => setFontSize(+e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm">
                    {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex items-center gap-2 mt-4">
                  <input type="checkbox" id="bold-cb" checked={bold} onChange={(e) => setBold(e.target.checked)} className="h-4 w-4" />
                  <label htmlFor="bold-cb" className="text-sm font-bold">عريض</label>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold mb-1 block">لون النص</label>
                <div className="flex flex-wrap gap-2">
                  {COLORS.map((c) => (
                    <button key={c} onClick={() => setColor(c)}
                      className={`w-8 h-8 rounded-full border-2 transition ${color === c ? "border-primary scale-110" : "border-border"}`}
                      style={{ backgroundColor: c }} />
                  ))}
                  <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                    className="w-8 h-8 rounded-full border border-border cursor-pointer" title="لون مخصص" />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold mb-1 block">خلفية النص</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {BG_OPTIONS.map((b) => (
                    <button key={b.value} onClick={() => setBgStyle(b.value as any)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition border-2 ${bgStyle === b.value ? "border-[var(--brand)] bg-[var(--brand)]/10" : "border-border hover:bg-secondary"}`}>
                      {b.label}
                    </button>
                  ))}
                </div>
                {bgStyle !== "none" && (
                  <div className="flex items-center gap-3">
                    {bgStyle === "colored" && (
                      <input type="color" value={bgColor} onChange={(e) => setBgColor(e.target.value)}
                        className="w-8 h-8 rounded-full border border-border cursor-pointer" title="لون الخلفية" />
                    )}
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs font-bold whitespace-nowrap">الشفافية</span>
                      <input type="range" min={0.1} max={0.9} step={0.05} value={bgOpacity}
                        onChange={(e) => setBgOpacity(+e.target.value)}
                        className="flex-1" />
                      <span className="text-xs text-muted-foreground w-8">{Math.round(bgOpacity * 100)}%</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={download} disabled={!imgSrc}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-bold disabled:opacity-50 bg-secondary hover:bg-secondary/70">
                <Download className="h-4 w-4" /> تحميل
              </button>
              {onSend && (
                <button onClick={handleSend} disabled={sending || !imgSrc}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
                  <Send className="h-4 w-4" /> {sending ? "جاري الإرسال..." : "تعديل"}
                </button>
              )}
              <label className="px-4 py-2.5 rounded-xl bg-secondary font-bold text-sm cursor-pointer hover:bg-secondary/70 transition inline-flex items-center gap-1.5">
                <RefreshCw className="h-4 w-4" /> تغيير
                <input type="file" accept="image/*" className="hidden" onChange={onFile} />
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
