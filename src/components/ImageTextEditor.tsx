import { useRef, useState, useEffect } from "react";
import { X, Download, Type, Image as ImageIcon } from "lucide-react";

type Props = { onClose: () => void };

const FONT_SIZES = [24, 32, 40, 48, 60, 72, 90];
const COLORS = ["#ffffff", "#000000", "#fbbf24", "#f87171", "#34d399", "#60a5fa", "#a78bfa", "#f472b6"];
const POSITIONS = [
  { label: "أعلى", value: "top" },
  { label: "وسط", value: "center" },
  { label: "أسفل", value: "bottom" },
];

export function ImageTextEditor({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [imgSrc, setImgSrc] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [fontSize, setFontSize] = useState(48);
  const [color, setColor] = useState("#ffffff");
  const [position, setPosition] = useState<"top" | "center" | "bottom">("bottom");
  const [bold, setBold] = useState(true);

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
      ctx.font = `${bold ? "bold" : "normal"} ${fs}px Tajawal, Cairo, Arial`;
      ctx.direction = "rtl";
      ctx.textAlign = "center";
      const lineH = fs * 1.4;
      const words = text.split(" ");
      const maxWidth = W * 0.9;
      const lines: string[] = [];
      let cur = "";
      for (const w of words) {
        const test = cur ? cur + " " + w : w;
        if (ctx.measureText(test).width > maxWidth && cur) { lines.push(cur); cur = w; }
        else cur = test;
      }
      if (cur) lines.push(cur);
      const totalH = lines.length * lineH;
      let yStart: number;
      if (position === "top") yStart = fs + 20 * scale;
      else if (position === "center") yStart = (H - totalH) / 2 + fs;
      else yStart = H - totalH - 20 * scale + fs;
      ctx.shadowColor = "rgba(0,0,0,0.7)";
      ctx.shadowBlur = 10 * scale;
      ctx.shadowOffsetX = 2 * scale;
      ctx.shadowOffsetY = 2 * scale;
      ctx.fillStyle = color;
      lines.forEach((line, i) => {
        ctx.fillText(line, W / 2, yStart + i * lineH);
      });
    };
    img.src = imgSrc;
  };

  useEffect(() => { draw(); }, [imgSrc, text, fontSize, color, position, bold]);

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
            <span className="font-bold text-sm">اختر صورة</span>
            <input type="file" accept="image/*" className="hidden" onChange={onFile} />
          </label>
        ) : (
          <>
            <canvas ref={canvasRef} className="w-full rounded-2xl border border-border bg-secondary/20" />

            <div className="grid gap-3">
              <label className="block text-sm font-bold">النص العربي</label>
              <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2}
                placeholder="اكتب نصك هنا بالعربية..."
                className="w-full px-4 py-2 rounded-xl border border-border bg-background resize-none text-right font-bold text-lg" />

              <div className="flex flex-wrap gap-3 items-center">
                <div>
                  <label className="text-xs font-bold mb-1 block">الحجم</label>
                  <select value={fontSize} onChange={(e) => setFontSize(+e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm">
                    {FONT_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold mb-1 block">الموضع</label>
                  <select value={position} onChange={(e) => setPosition(e.target.value as any)}
                    className="px-3 py-1.5 rounded-xl border border-border bg-background text-sm">
                    {POSITIONS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
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
            </div>

            <div className="flex gap-2 pt-2">
              <button onClick={download}
                className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold">
                <Download className="h-4 w-4" /> تحميل الصورة
              </button>
              <label className="px-4 py-2.5 rounded-xl bg-secondary font-bold text-sm cursor-pointer hover:bg-secondary/70 transition">
                صورة أخرى
                <input type="file" accept="image/*" className="hidden" onChange={onFile} />
              </label>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
