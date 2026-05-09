import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Award, Download } from "lucide-react";
import jsPDF from "jspdf";
import { toast } from "sonner";

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

  const downloadPdf = async (c: Cert) => {
    setDownloading(c.id);
    try {
      const W = 2480, H = 1754; // A4 landscape @300dpi
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.direction = "rtl";
      ctx.textAlign = "center";

      // Background gradient
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, "#fff8e1"); g.addColorStop(0.5, "#fff3c4"); g.addColorStop(1, "#ffecb3");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Borders
      ctx.strokeStyle = "#d97706"; ctx.lineWidth = 28;
      ctx.strokeRect(60, 60, W - 120, H - 120);
      ctx.strokeStyle = "#f59e0b"; ctx.lineWidth = 6;
      ctx.strokeRect(120, 120, W - 240, H - 240);

      // Corner stars
      ctx.fillStyle = "#d97706"; ctx.font = "bold 90px serif";
      ctx.fillText("✦", 200, 220); ctx.fillText("✦", W - 200, 220);
      ctx.fillText("✦", 200, H - 160); ctx.fillText("✦", W - 200, H - 160);

      const af = "'Tajawal','Cairo','Amiri','Segoe UI','Arial'";

      // 🏆 trophy
      ctx.font = "140px serif"; ctx.fillText("🏆", W / 2, 320);

      ctx.fillStyle = "#92400e"; ctx.font = `bold 80px ${af}`;
      ctx.fillText("شهادة تقدير", W / 2, 440);

      ctx.fillStyle = "#a16207"; ctx.font = `36px ${af}`;
      ctx.fillText("مبادرة « كلنا معاً » – محافظة الوسطى", W / 2, 510);

      ctx.fillStyle = "#78350f"; ctx.font = `42px ${af}`;
      ctx.fillText("تُمنح هذه الشهادة إلى", W / 2, 660);

      ctx.fillStyle = "#451a03"; ctx.font = `bold 100px ${af}`;
      ctx.fillText(studentName || "—", W / 2, 800);

      ctx.strokeStyle = "#d97706"; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(W / 2 - 700, 835); ctx.lineTo(W / 2 + 700, 835); ctx.stroke();

      ctx.fillStyle = "#92400e"; ctx.font = `bold 60px ${af}`;
      ctx.fillText(c.title, W / 2, 950);

      if (c.body) {
        ctx.fillStyle = "#78350f"; ctx.font = `38px ${af}`;
        // wrap body in lines
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

      // Date + signer
      ctx.fillStyle = "#78350f"; ctx.font = `34px ${af}`;
      const date = new Date(c.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
      ctx.fillText(`التاريخ: ${date}`, W / 2, 1560);

      ctx.fillStyle = "#92400e"; ctx.font = `bold 38px ${af}`;
      const role = c.teacher_gender === "female" ? "المعلمة" : "المعلم";
      ctx.fillText(`${role}: ${c.teacher_name || "—"}`, W / 2, 1630);

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
        {list.map((c) => (
          <div key={c.id} className="space-y-2">
            <div
              style={{ background: "linear-gradient(135deg, #fff8e1, #fff3c4, #ffecb3)" }}
              className="rounded-2xl border-4 border-amber-300 p-5 text-center relative overflow-hidden"
            >
              <div className="text-4xl mb-2">🏆</div>
              <div className="text-xs text-amber-700 font-bold mb-1">شهادة تقدير</div>
              <div className="font-black text-lg mb-2 text-amber-900">{c.title}</div>
              {c.body && <p className="text-sm text-amber-800 mb-2 leading-relaxed">{c.body}</p>}
              {c.image_url && <img src={c.image_url} alt="" className="w-full max-h-48 object-contain rounded-xl my-2" />}
              <div className="text-xs text-amber-700 mt-3 border-t border-amber-200 pt-2">
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
        ))}
      </div>
    </div>
  );
}
