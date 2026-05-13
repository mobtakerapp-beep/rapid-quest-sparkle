import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Award, Download } from "lucide-react";
import jsPDF from "jspdf";
import { toast } from "sonner";
import { CERT_THEMES, CERT_FONTS, themeById, loadGoogleFont } from "@/lib/certThemes";

type Cert = { id: string; teacher_id: string; title: string; body: string | null; image_url: string | null; bg: string | null; created_at: string; teacher_name?: string; teacher_gender?: string | null; student_name?: string };

export function MyCertificates({ uid }: { uid: string }) {
  const [list, setList] = useState<Cert[]>([]);
  const [downloading, setDownloading] = useState<string | null>(null);
  const [studentName, setStudentName] = useState<string>("");

  useEffect(() => {
    (async () => {
      const [{ data }, { data: me }] = await Promise.all([
        supabase.from("certificates").select("*").eq("student_id", uid).order("created_at", { ascending: false }),
        supabase.from("profiles").select("display_name").eq("id", uid).maybeSingle(),
      ]);
      setStudentName(me?.display_name || "");
      const ids = [...new Set((data || []).map((c: any) => c.teacher_id))];
      const { data: profs } = ids.length ? await supabase.from("profiles").select("id, display_name, gender").in("id", ids) : { data: [] };
      const map: Record<string, { name: string; gender: string | null }> = {};
      (profs || []).forEach((p: any) => { map[p.id] = { name: p.display_name || "—", gender: p.gender || null }; });
      setList((data || []).map((c: any) => ({ ...c, teacher_name: map[c.teacher_id]?.name, teacher_gender: map[c.teacher_id]?.gender })));
    })();
  }, [uid]);

  const loadImage = (url: string): Promise<HTMLImageElement | null> => new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });

  const parseBg = (bg: string | null) => {
    const themeId = bg?.match(/theme:([^|]+)/)?.[1] ?? "gold";
    const fontFamily = bg?.match(/font:([^|]+)/)?.[1] ?? "Tajawal";
    const theme = themeById(themeId);
    const font = CERT_FONTS.find((f) => f.family === fontFamily) ?? CERT_FONTS[0];
    return { theme, font };
  };

  const downloadPdf = async (c: Cert) => {
    setDownloading(c.id);
    try {
      const { theme, font } = parseBg(c.bg);
      await loadGoogleFont(font.family);

      const W = 2480, H = 1754;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.direction = "rtl";
      ctx.textAlign = "center";

      const af = `"${font.family}", Tajawal, Cairo, Arial`;

      // Background
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, theme.bg1); g.addColorStop(1, theme.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Dot pattern
      ctx.fillStyle = theme.accent + "28";
      for (let x = 80; x < W; x += 80)
        for (let y = 80; y < H; y += 80) {
          ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        }

      // Borders
      ctx.strokeStyle = theme.border1; ctx.lineWidth = 28;
      ctx.strokeRect(60, 60, W - 120, H - 120);
      ctx.strokeStyle = theme.border2; ctx.lineWidth = 6;
      ctx.strokeRect(120, 120, W - 240, H - 240);

      // Corner ornaments
      ctx.fillStyle = theme.accent; ctx.font = "bold 90px serif";
      ctx.fillText("✦", 200, 220); ctx.fillText("✦", W - 200, 220);
      ctx.fillText("✦", 200, H - 160); ctx.fillText("✦", W - 200, H - 160);

      // Trophy
      ctx.font = "140px serif"; ctx.fillText("🏆", W / 2, 320);

      // Title
      ctx.fillStyle = theme.title; ctx.font = `bold 80px ${af}`;
      ctx.fillText("شهادة تقدير", W / 2, 440);

      ctx.fillStyle = theme.body + "bb"; ctx.font = `36px ${af}`;
      ctx.fillText("مبادرة « كلنا معاً » – محافظة الوسطى", W / 2, 510);

      // Divider
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(W / 2 - 600, 550); ctx.lineTo(W / 2 + 600, 550); ctx.stroke();

      ctx.fillStyle = theme.body; ctx.font = `42px ${af}`;
      ctx.fillText("تُمنح هذه الشهادة إلى", W / 2, 660);

      ctx.fillStyle = theme.name; ctx.font = `bold 100px ${af}`;
      ctx.fillText(studentName || "—", W / 2, 800);

      ctx.strokeStyle = theme.accent; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(W / 2 - 700, 840); ctx.lineTo(W / 2 + 700, 840); ctx.stroke();

      ctx.fillStyle = theme.title; ctx.font = `bold 60px ${af}`;
      ctx.fillText(c.title, W / 2, 950);

      if (c.body) {
        ctx.fillStyle = theme.body; ctx.font = `38px ${af}`;
        const words = c.body.split(/\s+/);
        let line = ""; let y = 1050;
        for (const w of words) {
          const test = line ? line + " " + w : w;
          if (ctx.measureText(test).width > W - 600 && line) {
            ctx.fillText(line, W / 2, y); y += 60; line = w;
          } else line = test;
        }
        if (line) ctx.fillText(line, W / 2, y);
      }

      // Optional embedded image
      if (c.image_url) {
        const img = await loadImage(c.image_url);
        if (img) {
          const maxW = 600, maxH = 280;
          const ratio = Math.min(maxW / img.width, maxH / img.height);
          const w = img.width * ratio, h = img.height * ratio;
          ctx.drawImage(img, (W - w) / 2, 1230, w, h);
        }
      }

      // Stars
      ctx.fillStyle = theme.accent; ctx.font = "60px serif";
      ctx.fillText("⭐⭐⭐", W / 2, 1490);

      // Date + signer
      ctx.fillStyle = theme.body + "99"; ctx.font = `34px ${af}`;
      const date = new Date(c.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
      ctx.fillText(`التاريخ: ${date}`, W / 2, 1570);

      ctx.fillStyle = theme.title; ctx.font = `bold 38px ${af}`;
      const role = c.teacher_gender === "female" ? "المعلمة" : "المعلم";
      ctx.fillText(`${role}: ${c.teacher_name || "—"}`, W / 2, 1640);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
      const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      pdf.addImage(dataUrl, "JPEG", 0, 0, 297, 210);
      pdf.save(`شهادة-${c.title}.pdf`);
      toast.success("تم تنزيل الشهادة 📄");
    } catch (e: any) {
      toast.error("فشل التنزيل: " + (e.message || ""));
    } finally { setDownloading(null); }
  };

  if (list.length === 0) return null;

  return (
    <div className="bg-card rounded-3xl border border-border p-6 shadow-[var(--shadow-card)] mt-6">
      <h3 className="font-bold mb-4 flex items-center gap-2"><Award className="h-5 w-5 text-amber-500" /> شهاداتي ({list.length})</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {list.map((c) => {
          const { theme, font } = parseBg(c.bg);
          return (
          <div key={c.id} className="space-y-2">
            <div
              style={{
                background: `linear-gradient(135deg, ${theme.bg1}, ${theme.bg2})`,
                borderColor: theme.border1,
                fontFamily: `"${font.family}", Tajawal, sans-serif`,
              }}
              className="rounded-2xl border-4 p-5 text-center relative overflow-hidden"
            >
              <div className="text-4xl mb-2">🏆</div>
              <div className="text-xs font-bold mb-1" style={{ color: theme.title }}>شهادة تقدير</div>
              <div className="font-black text-lg mb-2" style={{ color: theme.name }}>{c.title}</div>
              {c.body && <p className="text-sm mb-2 leading-relaxed" style={{ color: theme.body }}>{c.body}</p>}
              {c.image_url && <img src={c.image_url} alt="" className="w-full max-h-48 object-contain rounded-xl my-2" />}
              <div className="text-xs mt-3 pt-2 border-t" style={{ color: theme.body, borderColor: theme.accent + "40" }}>
                من {c.teacher_gender === "female" ? "المعلمة" : "المعلم"}: <b>{c.teacher_name}</b>
                <div>{new Date(c.created_at).toLocaleDateString("ar")}</div>
              </div>
            </div>
            <button
              onClick={() => downloadPdf(c)}
              disabled={downloading === c.id}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-sm font-bold disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> {downloading === c.id ? "جاري التحضير..." : "تنزيل PDF"}
            </button>
          </div>
          );
        })}
      </div>
    </div>
  );
}
