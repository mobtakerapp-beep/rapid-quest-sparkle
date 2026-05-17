import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { toAr } from "@/lib/utils";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Award, Download, User as UserIcon, Target, Palette, Type as TypeIcon, Copy, Check, Users, Search } from "lucide-react";
import jsPDF from "jspdf";
import { MyBadges } from "@/components/MyBadges";
import { MyCertificates } from "@/components/MyCertificates";
import { CERT_THEMES, CERT_FONTS, loadGoogleFont } from "@/lib/certThemes";
import type { CertTheme, CertFont } from "@/lib/certThemes";

export const Route = createFileRoute("/badges")({ component: BadgesPage });

type B = { id: string; name: string; description: string | null; icon: string; color: string; audience: string };
type Attempt = { id: string; quiz_id: string; score: number; total: number; created_at: string; quiz_title?: string; subject?: string };
type GradedSub = { id: string; assignment_id: string; grade: number | null; feedback: string | null; graded_at: string | null; title?: string; subject?: string };

function BadgesPage() {
  const navigate = useNavigate();
  const [uid, setUid] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [all, setAll] = useState<B[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [points, setPoints] = useState(0);
  const [audience, setAudience] = useState<"student" | "teacher">("student");
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [gradedSubs, setGradedSubs] = useState<GradedSub[]>([]);
  const [generatingReport, setGeneratingReport] = useState(false);
  const [isParent, setIsParent] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Parent portal state
  const [parentCodeInput, setParentCodeInput] = useState("");
  const [linking, setLinking] = useState(false);
  const [linkedStudent, setLinkedStudent] = useState<{
    uid: string; name: string; points: number; counts: Record<string,number>;
    attempts: Attempt[]; gradedSubs: GradedSub[];
  } | null>(null);
  const [linkError, setLinkError] = useState("");
  const [generatingParentReport, setGeneratingParentReport] = useState(false);

  const [selectedTheme, setSelectedTheme] = useState(CERT_THEMES[0]);
  const [selectedFont, setSelectedFont] = useState(CERT_FONTS[0]);
  const [generating, setGenerating] = useState(false);
  const [showCertCustomizer, setShowCertCustomizer] = useState(false);

  // ── ريل تايم: تحديث فوري عند منح شارة ──────────────────────────────────
  useEffect(() => {
    let ch: ReturnType<typeof supabase.channel> | null = null;
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!id) return;
      ch = supabase
        .channel(`badges-rt-${id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "user_badges", filter: `user_id=eq.${id}` }, async () => {
          const { data: ub } = await supabase.from("user_badges").select("badge_id").eq("user_id", id);
          const c: Record<string, number> = {};
          (ub || []).forEach((x: any) => { c[x.badge_id] = (c[x.badge_id] || 0) + 1; });
          setCounts(c);
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${id}` }, async () => {
          const { data: p } = await supabase.from("profiles").select("points").eq("id", id).maybeSingle();
          if (p) setPoints(p.points || 0);
        })
        .subscribe();
    });
    return () => { if (ch) supabase.removeChannel(ch); };
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const id = data.session.user.id;
      setUid(id);
      const [{ data: p }, { data: roles }, { data: bs }, { data: ub }, { data: at }] = await Promise.all([
        supabase.from("profiles").select("display_name, points, role_type, avatar_url").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("badges").select("*"),
        supabase.from("user_badges").select("badge_id").eq("user_id", id),
        supabase.from("quiz_attempts").select("id, quiz_id, score, total, created_at").eq("user_id", id).order("created_at", { ascending: false }),
      ]);
      setName(p?.display_name || ""); setPoints(p?.points || 0); setAvatar((p as any)?.avatar_url || null);

      if ((p as any)?.role_type === "parent") { setIsParent(true); return; }

      const isTeacher = p?.role_type === "teacher" || p?.role_type === "supervisor" || !!roles?.some((r) => r.role === "admin");
      setAudience(isTeacher ? "teacher" : "student");
      setAll((bs || []) as B[]);
      const c: Record<string, number> = {};
      (ub || []).forEach((x: any) => { c[x.badge_id] = (c[x.badge_id] || 0) + 1; });
      setCounts(c);
      const qids = [...new Set((at || []).map((a: any) => a.quiz_id))];
      const { data: quizzes } = qids.length ? await supabase.from("quizzes").select("id, title, subject").in("id", qids) : { data: [] };
      const qmap: Record<string, { title: string; subject: string }> = {};
      (quizzes || []).forEach((q: any) => { qmap[q.id] = { title: q.title, subject: q.subject }; });
      setAttempts((at || []).map((a: any) => ({ ...a, quiz_title: qmap[a.quiz_id]?.title || "اختبار", subject: qmap[a.quiz_id]?.subject })));

      // Load graded assignments
      const { data: subs } = await supabase
        .from("assignment_submissions")
        .select("id, assignment_id, grade, feedback, graded_at")
        .eq("student_id", id)
        .not("grade", "is", null)
        .order("graded_at", { ascending: false });
      const aids = [...new Set((subs || []).map((s: any) => s.assignment_id))];
      const { data: asgs } = aids.length ? await supabase.from("assignments").select("id, title, subject").in("id", aids) : { data: [] };
      const amap: Record<string, { title: string; subject: string }> = {};
      (asgs || []).forEach((a: any) => { amap[a.id] = { title: a.title, subject: a.subject }; });
      setGradedSubs((subs || []).map((s: any) => ({ ...s, title: amap[s.assignment_id]?.title || "واجب", subject: amap[s.assignment_id]?.subject })));
    });
  }, [navigate]);

  const lookupStudent = async () => {
    const code = parentCodeInput.trim();
    if (!code) { setLinkError("أدخل كود الطالب"); return; }
    setLinking(true); setLinkError(""); setLinkedStudent(null);
    const { data: prof } = await supabase
      .from("profiles")
      .select("id, display_name, points, role_type")
      .eq("id", code)
      .eq("role_type", "student")
      .maybeSingle();
    if (!prof) {
      setLinkError("لم يُعثر على طالب بهذا الكود — تأكد من الكود وأعد المحاولة");
      setLinking(false); return;
    }
    const sid = prof.id;
    const [{ data: ub }, { data: at }] = await Promise.all([
      supabase.from("user_badges").select("badge_id").eq("user_id", sid),
      supabase.from("quiz_attempts").select("id, quiz_id, score, total, created_at").eq("user_id", sid).order("created_at", { ascending: false }),
    ]);
    const c: Record<string, number> = {};
    (ub || []).forEach((x: any) => { c[x.badge_id] = (c[x.badge_id] || 0) + 1; });
    const qids = [...new Set((at || []).map((a: any) => a.quiz_id))];
    const { data: quizzes } = qids.length ? await supabase.from("quizzes").select("id, title, subject").in("id", qids) : { data: [] };
    const qmap: Record<string, { title: string; subject: string }> = {};
    (quizzes || []).forEach((q: any) => { qmap[q.id] = { title: q.title, subject: q.subject }; });
    const mappedAt: Attempt[] = (at || []).map((a: any) => ({ ...a, quiz_title: qmap[a.quiz_id]?.title || "اختبار", subject: qmap[a.quiz_id]?.subject }));
    const { data: subs } = await supabase.from("assignment_submissions").select("id, assignment_id, grade, feedback, graded_at").eq("student_id", sid).not("grade", "is", null).order("graded_at", { ascending: false });
    const aids = [...new Set((subs || []).map((s: any) => s.assignment_id))];
    const { data: asgs } = aids.length ? await supabase.from("assignments").select("id, title, subject").in("id", aids) : { data: [] };
    const amap: Record<string, { title: string; subject: string }> = {};
    (asgs || []).forEach((a: any) => { amap[a.id] = { title: a.title, subject: a.subject }; });
    const mappedSubs: GradedSub[] = (subs || []).map((s: any) => ({ ...s, title: amap[s.assignment_id]?.title || "واجب", subject: amap[s.assignment_id]?.subject }));
    setLinkedStudent({ uid: sid, name: prof.display_name || "—", points: prof.points || 0, counts: c, attempts: mappedAt, gradedSubs: mappedSubs });
    setLinking(false);
  };

  const certificate = async () => {
    setGenerating(true);
    try {
      await loadGoogleFont(selectedFont.family);
      const W = 2480, H = 1754;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d")!;
      ctx.direction = "rtl";
      ctx.textAlign = "center";

      const theme = selectedTheme;
      const fontFamily = `"${selectedFont.family}", Tajawal, Cairo, Arial`;

      // Background gradient
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, theme.bg1); g.addColorStop(1, theme.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Decorative pattern dots
      ctx.fillStyle = theme.accent + "30";
      for (let x = 80; x < W; x += 80) {
        for (let y = 80; y < H; y += 80) {
          ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2); ctx.fill();
        }
      }

      // Outer border
      ctx.strokeStyle = theme.border1; ctx.lineWidth = 28;
      ctx.strokeRect(60, 60, W - 120, H - 120);
      // Inner border
      ctx.strokeStyle = theme.border2; ctx.lineWidth = 6;
      ctx.strokeRect(120, 120, W - 240, H - 240);

      // Corner ornaments
      ctx.fillStyle = theme.accent; ctx.font = "bold 90px serif";
      ctx.fillText("✦", 200, 220); ctx.fillText("✦", W - 200, 220);
      ctx.fillText("✦", 200, H - 160); ctx.fillText("✦", W - 200, H - 160);

      // Header
      ctx.fillStyle = theme.title; ctx.font = `bold 90px ${fontFamily}`;
      ctx.fillText("شهادة تقدير", W / 2, 320);
      ctx.fillStyle = theme.body + "bb"; ctx.font = `40px ${fontFamily}`;
      ctx.fillText("مبادرة « كلنا معاً » – محافظة الوسطى", W / 2, 400);

      // Divider
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(W / 2 - 600, 440); ctx.lineTo(W / 2 + 600, 440); ctx.stroke();

      // Body
      ctx.fillStyle = theme.body; ctx.font = `46px ${fontFamily}`;
      ctx.fillText("تُمنح هذه الشهادة إلى", W / 2, 600);

      ctx.fillStyle = theme.name; ctx.font = `bold 120px ${fontFamily}`;
      ctx.fillText(name || "—", W / 2, 780);

      // Underline name
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(W / 2 - 750, 820); ctx.lineTo(W / 2 + 750, 820); ctx.stroke();

      ctx.fillStyle = theme.body; ctx.font = `42px ${fontFamily}`;
      ctx.fillText("تقديراً لتميّزه ومشاركته الفاعلة في أنشطة المبادرة", W / 2, 940);
      ctx.fillText(`وحصوله على ${toAr(points)} نقطة و ${toAr(Object.keys(counts).length)} شارة من شارات الإنجاز`, W / 2, 1010);

      // Stars decoration
      ctx.fillStyle = theme.accent; ctx.font = "60px serif";
      ctx.fillText("⭐⭐⭐", W / 2, 1080);

      // Date
      ctx.fillStyle = theme.body + "99"; ctx.font = `34px ${fontFamily}`;
      const date = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
      ctx.fillText(`التاريخ: ${date}`, W / 2, 1170);

      // Decorative separator before footer
      ctx.strokeStyle = theme.accent + "80"; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 700, 1290); ctx.lineTo(W / 2 - 60, 1290);
      ctx.moveTo(W / 2 + 60, 1290); ctx.lineTo(W / 2 + 700, 1290);
      ctx.stroke();
      ctx.fillStyle = theme.accent; ctx.font = "36px serif";
      ctx.fillText("❖", W / 2, 1302);

      // Footer – signature area
      ctx.strokeStyle = theme.border2; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(W / 2 - 480, 1400); ctx.lineTo(W / 2 + 480, 1400); ctx.stroke();

      ctx.fillStyle = theme.title; ctx.font = `bold 52px ${fontFamily}`;
      ctx.fillText("كلنا معاً", W / 2, 1470);

      ctx.fillStyle = theme.body + "90"; ctx.font = `32px ${fontFamily}`;
      ctx.fillText("مبادرة كلنا معاً – محافظة الوسطى", W / 2, 1540);

      ctx.fillStyle = theme.accent; ctx.font = "32px serif";
      ctx.fillText("✦  ✦  ✦", W / 2, 1610);

      const img = c.toDataURL("image/jpeg", 0.95);
      const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
      doc.addImage(img, "JPEG", 0, 0, 297, 210);
      doc.save(`شهادة-تقدير-${name || "بدون-اسم"}.pdf`);
    } finally {
      setGenerating(false);
    }
  };

  // ── Report card (كشف الدرجات) for parents ──────────────────────────────
  const downloadReport = async () => {
    setGeneratingReport(true);
    try {
      await loadGoogleFont(selectedFont.family);
      const theme = selectedTheme;
      const af = `"${selectedFont.family}", Tajawal, Cairo, Arial`;

      const W = 1240, H = 1754; // A4 portrait at ~150dpi
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d")!;
      ctx.direction = "rtl";

      // Background
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, theme.bg1); g.addColorStop(1, theme.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

      // Borders
      ctx.strokeStyle = theme.border1; ctx.lineWidth = 18;
      ctx.strokeRect(40, 40, W - 80, H - 80);
      ctx.strokeStyle = theme.border2; ctx.lineWidth = 4;
      ctx.strokeRect(80, 80, W - 160, H - 160);

      // Title
      ctx.textAlign = "center";
      ctx.fillStyle = theme.title; ctx.font = `bold 56px ${af}`;
      ctx.fillText("كشف درجات الطالب", W / 2, 170);
      ctx.fillStyle = theme.body + "bb"; ctx.font = `26px ${af}`;
      ctx.fillText("مبادرة « كلنا معاً » – محافظة الوسطى", W / 2, 215);

      ctx.strokeStyle = theme.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(140, 240); ctx.lineTo(W - 140, 240); ctx.stroke();

      // Student info
      ctx.fillStyle = theme.body; ctx.font = `28px ${af}`;
      ctx.textAlign = "right";
      const date = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
      ctx.fillText(`اسم الطالب: ${name || "—"}`, W - 110, 290);
      ctx.fillText(`النقاط: ${toAr(points)}`, W - 110, 330);
      ctx.textAlign = "left";
      ctx.fillText(`التاريخ: ${date}`, 110, 290);
      ctx.fillText(`عدد الشارات: ${toAr(Object.keys(counts).length)}`, 110, 330);

      // Helper: draw a section
      let y = 380;
      const drawSection = (title: string, rows: string[][], headers: string[]) => {
        if (y > H - 220) return; // page guard
        ctx.textAlign = "right";
        ctx.fillStyle = theme.title; ctx.font = `bold 32px ${af}`;
        ctx.fillText(title, W - 110, y);
        y += 20;
        // Header row
        ctx.fillStyle = theme.accent + "40";
        ctx.fillRect(110, y, W - 220, 44);
        ctx.fillStyle = theme.title; ctx.font = `bold 22px ${af}`;
        const colCount = headers.length;
        const colW = (W - 220) / colCount;
        headers.forEach((h, i) => {
          // Right-aligned columns from right
          const cx = W - 110 - colW * i - colW / 2;
          ctx.textAlign = "center";
          ctx.fillText(h, cx, y + 30);
        });
        y += 44;
        ctx.font = `22px ${af}`; ctx.fillStyle = theme.body;
        rows.forEach((r, ri) => {
          if (y > H - 200) return;
          if (ri % 2 === 0) {
            ctx.fillStyle = theme.bg2 + "80";
            ctx.fillRect(110, y, W - 220, 40);
          }
          ctx.fillStyle = theme.body;
          r.forEach((cell, i) => {
            const cx = W - 110 - colW * i - colW / 2;
            ctx.textAlign = "center";
            ctx.fillText(cell.length > 30 ? cell.slice(0, 28) + "…" : cell, cx, y + 28);
          });
          y += 40;
        });
        y += 30;
      };

      // Quizzes section
      if (attempts.length) {
        const rows = attempts.slice(0, 12).map((a) => {
          const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
          return [
            new Date(a.created_at).toLocaleDateString("ar-EG"),
            `${toAr(pct)}%`,
            `${toAr(a.score)}/${toAr(a.total)}`,
            a.subject || "عام",
            a.quiz_title || "اختبار",
          ];
        });
        drawSection(`📝 درجات الاختبارات (${toAr(attempts.length)})`, rows,
          ["الاختبار", "المادة", "الدرجة", "النسبة", "التاريخ"]);
      }

      // Assignments section
      if (gradedSubs.length) {
        const rows = gradedSubs.slice(0, 12).map((s) => [
          s.graded_at ? new Date(s.graded_at).toLocaleDateString("ar-EG") : "—",
          s.grade != null ? toAr(s.grade) : "—",
          s.subject || "عام",
          s.title || "واجب",
        ]);
        drawSection(`📚 درجات الواجبات (${toAr(gradedSubs.length)})`, rows,
          ["الواجب", "المادة", "الدرجة", "التاريخ"]);
      }

      if (!attempts.length && !gradedSubs.length) {
        ctx.fillStyle = theme.body; ctx.font = `28px ${af}`;
        ctx.textAlign = "center";
        ctx.fillText("لا توجد درجات مسجّلة بعد", W / 2, y + 40);
      }

      // Footer
      ctx.fillStyle = theme.accent; ctx.font = "26px serif";
      ctx.textAlign = "center";
      ctx.fillText("✦  كلنا معاً  ✦", W / 2, H - 110);
      ctx.fillStyle = theme.body + "99"; ctx.font = `20px ${af}`;
      ctx.fillText("توقيع ولي الأمر: ____________________", W / 2, H - 60);

      const img = c.toDataURL("image/jpeg", 0.95);
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.addImage(img, "JPEG", 0, 0, 210, 297);
      doc.save(`كشف-درجات-${name || "طالب"}.pdf`);
    } finally {
      setGeneratingReport(false);
    }
  };

  const downloadStudentReport = async (
    sName: string, sPoints: number, sCounts: Record<string,number>,
    sAttempts: Attempt[], sGradedSubs: GradedSub[], setLoading: (v: boolean) => void
  ) => {
    setLoading(true);
    try {
      await loadGoogleFont(selectedFont.family);
      const theme = selectedTheme;
      const af = `"${selectedFont.family}", Tajawal, Cairo, Arial`;
      const W = 1240, H = 1754;
      const c = document.createElement("canvas");
      c.width = W; c.height = H;
      const ctx = c.getContext("2d")!;
      ctx.direction = "rtl";
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, theme.bg1); g.addColorStop(1, theme.bg2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = theme.border1; ctx.lineWidth = 18;
      ctx.strokeRect(40, 40, W - 80, H - 80);
      ctx.strokeStyle = theme.border2; ctx.lineWidth = 4;
      ctx.strokeRect(80, 80, W - 160, H - 160);
      ctx.textAlign = "center";
      ctx.fillStyle = theme.title; ctx.font = `bold 56px ${af}`;
      ctx.fillText("كشف درجات الطالب", W / 2, 170);
      ctx.fillStyle = theme.body + "bb"; ctx.font = `26px ${af}`;
      ctx.fillText("مبادرة « كلنا معاً » – محافظة الوسطى", W / 2, 215);
      ctx.strokeStyle = theme.accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(140, 240); ctx.lineTo(W - 140, 240); ctx.stroke();
      ctx.fillStyle = theme.body; ctx.font = `28px ${af}`;
      ctx.textAlign = "right";
      const date = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
      ctx.fillText(`اسم الطالب: ${sName || "—"}`, W - 110, 290);
      ctx.fillText(`النقاط: ${toAr(sPoints)}`, W - 110, 330);
      ctx.textAlign = "left";
      ctx.fillText(`التاريخ: ${date}`, 110, 290);
      ctx.fillText(`عدد الشارات: ${toAr(Object.keys(sCounts).length)}`, 110, 330);
      let y = 380;
      const drawSection = (title: string, rows: string[][], headers: string[]) => {
        if (y > H - 220) return;
        ctx.textAlign = "right";
        ctx.fillStyle = theme.title; ctx.font = `bold 32px ${af}`;
        ctx.fillText(title, W - 110, y); y += 20;
        ctx.fillStyle = theme.accent + "40"; ctx.fillRect(110, y, W - 220, 44);
        ctx.fillStyle = theme.title; ctx.font = `bold 22px ${af}`;
        const colW = (W - 220) / headers.length;
        headers.forEach((h, i) => { ctx.textAlign = "center"; ctx.fillText(h, W - 110 - colW * i - colW / 2, y + 30); });
        y += 44; ctx.font = `22px ${af}`; ctx.fillStyle = theme.body;
        rows.forEach((r, ri) => {
          if (y > H - 200) return;
          if (ri % 2 === 0) { ctx.fillStyle = theme.bg2 + "80"; ctx.fillRect(110, y, W - 220, 40); }
          ctx.fillStyle = theme.body;
          r.forEach((cell, i) => { ctx.textAlign = "center"; ctx.fillText(cell.length > 30 ? cell.slice(0, 28) + "…" : cell, W - 110 - colW * i - colW / 2, y + 28); });
          y += 40;
        }); y += 30;
      };
      if (sAttempts.length) {
        const rows = sAttempts.slice(0, 12).map((a) => {
          const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
          return [new Date(a.created_at).toLocaleDateString("ar-EG"), `${toAr(pct)}%`, `${toAr(a.score)}/${toAr(a.total)}`, a.subject || "عام", a.quiz_title || "اختبار"];
        });
        drawSection(`📝 درجات الاختبارات (${toAr(sAttempts.length)})`, rows, ["الاختبار", "المادة", "الدرجة", "النسبة", "التاريخ"]);
      }
      if (sGradedSubs.length) {
        const rows = sGradedSubs.slice(0, 12).map((s) => [
          s.graded_at ? new Date(s.graded_at).toLocaleDateString("ar-EG") : "—", s.grade != null ? toAr(s.grade) : "—", s.subject || "عام", s.title || "واجب",
        ]);
        drawSection(`📚 درجات الواجبات (${toAr(sGradedSubs.length)})`, rows, ["الواجب", "المادة", "الدرجة", "التاريخ"]);
      }
      if (!sAttempts.length && !sGradedSubs.length) {
        ctx.fillStyle = theme.body; ctx.font = `28px ${af}`; ctx.textAlign = "center";
        ctx.fillText("لا توجد درجات مسجّلة بعد", W / 2, y + 40);
      }
      ctx.fillStyle = theme.accent; ctx.font = "26px serif"; ctx.textAlign = "center";
      ctx.fillText("✦  كلنا معاً  ✦", W / 2, H - 110);
      ctx.fillStyle = theme.body + "99"; ctx.font = `20px ${af}`;
      ctx.fillText("توقيع ولي الأمر: ____________________", W / 2, H - 60);
      const img = c.toDataURL("image/jpeg", 0.95);
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.addImage(img, "JPEG", 0, 0, 210, 297);
      doc.save(`كشف-درجات-${sName || "طالب"}.pdf`);
    } finally { setLoading(false); }
  };

  const colors: Record<string, string> = {
    amber: "from-amber-400 to-orange-500", emerald: "from-emerald-400 to-teal-500",
    rose: "from-rose-400 to-pink-500", violet: "from-violet-400 to-purple-500",
    cyan: "from-cyan-400 to-blue-500",
  };

  // ── Parent portal view ──────────────────────────────────────────────────
  if (isParent) return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-2">
          <Link to="/"><ArrowLeft className="h-5 w-5" /></Link>
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center text-white"><Users className="h-5 w-5" /></div>
          <h1 className="font-bold">بوابة ولي الأمر</h1>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-xl space-y-6">
        <div className="bg-card rounded-3xl border border-border p-6 space-y-4">
          <div className="text-center">
            <div className="text-4xl mb-2">👨‍👧‍👦</div>
            <h2 className="text-xl font-black">ادخل كود ابنك / ابنتك</h2>
            <p className="text-xs text-muted-foreground mt-1">اطلب من الطالب نسخ كوده من صفحة "شاراتي وإنجازاتي" وأرسله لك</p>
          </div>
          <div className="flex gap-2">
            <input
              value={parentCodeInput}
              onChange={(e) => { setParentCodeInput(e.target.value.replace(/[^\x20-\x7E]/g, "")); setLinkError(""); }}
              placeholder="الصق كود الطالب هنا..."
              dir="ltr"
              lang="en"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              className="flex-1 px-4 py-3 rounded-xl border-2 border-border bg-background font-mono text-sm focus:border-[var(--brand)] outline-none transition"
              onKeyDown={(e) => e.key === "Enter" && lookupStudent()}
            />
            <button onClick={lookupStudent} disabled={linking}
              className="px-5 py-3 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50 inline-flex items-center gap-2">
              <Search className="h-4 w-4" />
              {linking ? "..." : "بحث"}
            </button>
          </div>
          {linkError && <p className="text-sm text-rose-600 font-bold text-center">{linkError}</p>}
        </div>

        {linkedStudent && (
          <div className="space-y-4">
            <div className="bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-300 rounded-3xl p-6 text-center">
              <div className="text-4xl mb-2">✅</div>
              <h3 className="text-2xl font-black">{linkedStudent.name}</h3>
              <div className="text-5xl font-black bg-[image:var(--gradient-hero)] bg-clip-text text-transparent mt-2">{toAr(linkedStudent.points)}</div>
              <div className="text-sm text-muted-foreground">نقطة • {Object.keys(linkedStudent.counts).length} شارة</div>
            </div>

            {linkedStudent.attempts.length > 0 && (
              <div className="bg-card rounded-3xl border border-border p-5">
                <h3 className="font-bold mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-rose-500" /> درجات الاختبارات <span className="text-xs font-normal text-muted-foreground">({linkedStudent.attempts.length})</span></h3>
                <div className="overflow-y-auto max-h-64 space-y-1.5">
                  {linkedStudent.attempts.map((a) => {
                    const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
                    const bar = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-500";
                    const txt = pct >= 75 ? "text-emerald-700" : pct >= 50 ? "text-amber-700" : "text-rose-700";
                    return (
                      <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/50">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0 ${bar}`}>{pct}%</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-bold text-xs truncate">{a.quiz_title}</div>
                          <div className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString("ar-EG")}</div>
                        </div>
                        <div className={`text-sm font-black ${txt} shrink-0`}>{toAr(a.score)}/{toAr(a.total)}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {linkedStudent.gradedSubs.length > 0 && (
              <div className="bg-card rounded-3xl border border-border p-5">
                <h3 className="font-bold mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-violet-500" /> درجات الواجبات <span className="text-xs font-normal text-muted-foreground">({linkedStudent.gradedSubs.length})</span></h3>
                <div className="overflow-y-auto max-h-48 space-y-1.5">
                  {linkedStudent.gradedSubs.map((s) => (
                    <div key={s.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/50">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-violet-500 text-white text-[10px] font-black shrink-0">{s.grade ?? "—"}</div>
                      <div className="flex-1 min-w-0">
                        <div className="font-bold text-xs truncate">{s.title}</div>
                        <div className="text-[10px] text-muted-foreground">{s.graded_at ? new Date(s.graded_at).toLocaleDateString("ar-EG") : "—"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-card rounded-3xl border border-border p-5 space-y-3">
              <div className="font-bold flex items-center gap-2"><Palette className="h-4 w-4 text-[var(--brand)]" /> تخصيص كشف الدرجات</div>
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {CERT_THEMES.map((t) => (
                  <button key={t.id} type="button" onClick={() => setSelectedTheme(t)}
                    className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition ${selectedTheme.id === t.id ? "border-[var(--brand)] shadow-md" : "border-border"}`}>
                    <div className="w-8 h-8 rounded-lg" style={{ background: `linear-gradient(135deg, ${t.bg1}, ${t.border1})` }} />
                    <span className="text-[9px] font-bold text-center">{t.label}</span>
                  </button>
                ))}
              </div>
              <button
                onClick={() => downloadStudentReport(linkedStudent.name, linkedStudent.points, linkedStudent.counts, linkedStudent.attempts, linkedStudent.gradedSubs, setGeneratingParentReport)}
                disabled={generatingParentReport}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold disabled:opacity-50 transition">
                <Download className="h-4 w-4" /> {generatingParentReport ? "جاري التحضير..." : "طباعة كشف درجات الطالب PDF"}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white"><Award className="h-5 w-5" /></div>
            <h1 className="font-bold">شاراتي وإنجازاتي</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* Profile header */}
        <div className="bg-card rounded-3xl border border-border p-6 mb-6 text-center">
          <div className="mx-auto h-24 w-24 rounded-3xl overflow-hidden bg-[image:var(--gradient-hero)] text-white flex items-center justify-center mb-3 shadow-[var(--shadow-soft)]">
            {avatar ? <img src={avatar} alt="avatar" className="h-full w-full object-cover" /> : <UserIcon className="h-10 w-10" />}
          </div>
          <div className="font-black text-xl mb-1">{name || "—"}</div>
          <div className="text-5xl font-black bg-[image:var(--gradient-hero)] bg-clip-text text-transparent mb-1">{toAr(points)}</div>
          <div className="text-sm text-muted-foreground mb-4">نقطة</div>
          <div className="text-sm mb-4">حصلت على <strong>{Object.keys(counts).length}</strong> من أصل <strong>{all.filter(b => b.audience === audience).length}</strong> شارة</div>
        </div>

        {/* كود ولي الأمر */}
        {uid && audience === "student" && (
          <div className="bg-teal-50 dark:bg-teal-950/30 border-2 border-teal-300 dark:border-teal-700 rounded-3xl p-5 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-5 w-5 text-teal-600" />
              <h3 className="font-bold text-teal-700 dark:text-teal-400">كود ولي الأمر</h3>
            </div>
            <p className="text-xs text-teal-600 dark:text-teal-500 mb-3">
              أرسل هذا الكود لولي أمرك حتى يتمكن من متابعة درجاتك وطباعة كشف الدرجات
            </p>
            <div className="bg-white dark:bg-teal-950/60 rounded-2xl border border-teal-200 dark:border-teal-700 p-3 flex items-center gap-3">
              <code className="flex-1 font-mono text-xs break-all text-teal-800 dark:text-teal-300 select-all">{uid}</code>
              <button
                onClick={() => { navigator.clipboard.writeText(uid); setCodeCopied(true); setTimeout(() => setCodeCopied(false), 2000); }}
                className="shrink-0 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold transition">
                {codeCopied ? <><Check className="h-3.5 w-3.5" /> تم النسخ</> : <><Copy className="h-3.5 w-3.5" /> نسخ</>}
              </button>
            </div>
          </div>
        )}

        {/* ① درجات الاختبارات — أولاً */}
        {attempts.length > 0 && (
          <div className="bg-card rounded-3xl border border-border p-5 shadow-[var(--shadow-card)] mb-6">
            <h3 className="font-bold mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-rose-500" /> درجات اختباراتي <span className="text-xs font-normal text-muted-foreground">({toAr(attempts.length)})</span></h3>
            <div className="overflow-y-auto max-h-64 space-y-1.5 pl-1 scrollbar-thin">
              {attempts.map((a) => {
                const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
                const bar = pct >= 75 ? "bg-emerald-500" : pct >= 50 ? "bg-amber-400" : "bg-rose-500";
                const txt = pct >= 75 ? "text-emerald-700" : pct >= 50 ? "text-amber-700" : "text-rose-700";
                return (
                  <div key={a.id} className="flex items-center gap-2 px-3 py-2 rounded-xl bg-secondary/50 hover:bg-secondary transition">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white text-[10px] font-black shrink-0 ${bar}`}>{pct}%</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-xs truncate">{a.quiz_title}</div>
                      <div className="text-[10px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString("ar-EG")}</div>
                    </div>
                    <div className={`text-sm font-black ${txt} shrink-0`}>{toAr(a.score)}/{toAr(a.total)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ② زر طباعة الدرجات — ثانياً */}
        {(attempts.length > 0 || gradedSubs.length > 0) && (
          <div className="bg-card rounded-3xl border border-border p-5 shadow-[var(--shadow-card)] mb-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <h3 className="font-bold flex items-center gap-2"><Target className="h-5 w-5 text-emerald-600" /> كشف الدرجات لولي الأمر</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  درجات الاختبارات ({toAr(attempts.length)}) والواجبات ({toAr(gradedSubs.length)})
                </p>
              </div>
              <button onClick={downloadReport} disabled={generatingReport}
                className="shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold disabled:opacity-50 transition whitespace-nowrap">
                <Download className="h-3.5 w-3.5" /> {generatingReport ? "جاري..." : "طباعة PDF"}
              </button>
            </div>
          </div>
        )}

        {/* ③ شهادة التقدير — قبل الشهادات — مع زر تعديل/طباعة */}
        <div className="bg-card rounded-3xl border border-border p-5 mb-6">
          <div className="flex items-center justify-between gap-3">
            <div className="font-bold flex items-center gap-2"><Download className="h-4 w-4 text-[var(--brand)]" /> شهادة التقدير</div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setShowCertCustomizer((v) => !v)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition ${showCertCustomizer ? "border-[var(--brand)] bg-[var(--brand)]/10 text-[var(--brand)]" : "border-border hover:bg-secondary"}`}
              >
                <Palette className="h-3.5 w-3.5" /> تعديل الشهادة
              </button>
              <button onClick={certificate} disabled={generating}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[image:var(--gradient-hero)] text-white text-xs font-bold disabled:opacity-50">
                <Download className="h-3.5 w-3.5" /> {generating ? "جاري..." : "طباعة PDF"}
              </button>
            </div>
          </div>

          {showCertCustomizer && (
            <div className="mt-4 space-y-4 border-t border-border pt-4">
              <div>
                <div className="text-xs font-bold mb-2 text-muted-foreground">اللون / الثيم</div>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {CERT_THEMES.map((t) => (
                    <button key={t.id} type="button" onClick={() => setSelectedTheme(t)}
                      title={t.label}
                      className={`flex flex-col items-center gap-1 p-1.5 rounded-xl border-2 transition ${selectedTheme.id === t.id ? "border-[var(--brand)] shadow-md" : "border-border hover:border-[var(--brand)]/50"}`}>
                      <div className="w-8 h-8 rounded-lg shadow-sm border border-white/20"
                        style={{ background: `linear-gradient(135deg, ${t.bg1}, ${t.border1})` }} />
                      <span className="text-[9px] font-bold text-center leading-tight">{t.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-xs font-bold mb-2 text-muted-foreground flex items-center gap-1"><TypeIcon className="h-3.5 w-3.5" /> الخط</div>
                <div className="grid grid-cols-3 gap-1.5">
                  {CERT_FONTS.map((f) => (
                    <button key={f.family} type="button" onClick={() => setSelectedFont(f)}
                      style={{ fontFamily: `"${f.family}", Tajawal, sans-serif` }}
                      className={`px-2 py-1.5 rounded-xl border-2 text-xs text-center transition ${selectedFont.family === f.family ? "border-[var(--brand)] bg-[var(--brand)]/10 font-bold" : "border-border hover:border-[var(--brand)]/40"}`}>
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border-4 p-4 text-center"
                style={{
                  background: `linear-gradient(135deg, ${selectedTheme.bg1}, ${selectedTheme.bg2})`,
                  borderColor: selectedTheme.border1,
                  fontFamily: `"${selectedFont.family}", Tajawal, sans-serif`,
                }}>
                <div className="text-2xl mb-1">🏆</div>
                <div className="text-xs font-black mb-0.5" style={{ color: selectedTheme.title }}>شهادة تقدير</div>
                <div className="text-base font-black" style={{ color: selectedTheme.name }}>{name || "اسمك"}</div>
                <div className="text-[10px] mt-0.5 opacity-70" style={{ color: selectedTheme.body }}>مبادرة كلنا معاً – {points} نقطة</div>
              </div>
              <button onClick={() => { certificate(); setShowCertCustomizer(false); }} disabled={generating}
                className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
                <Download className="h-4 w-4" /> {generating ? "جاري التحضير..." : "طباعة الشهادة PDF"}
              </button>
            </div>
          )}
        </div>

        {/* شهادات الموقع */}
        {uid && <MyCertificates uid={uid} />}
        {/* الشارات */}
        {uid && <MyBadges uid={uid} />}
        {/* ملصقات المعلم */}
        {uid && audience === "student" && <TeacherStickersSection uid={uid} />}

        <div className="text-center text-sm font-bold mb-3 mt-8 text-muted-foreground">
          {audience === "teacher" ? "🎓 كل شارات المعلمين" : "🌟 كل شارات الطلاب"}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          {all.filter(b => b.audience === audience).map((b) => {
            const count = counts[b.id] || 0;
            const got = count > 0;
            return (
              <div key={b.id} className={`bg-card rounded-2xl border border-border p-5 text-center transition relative ${got ? "" : "opacity-40 grayscale"}`}>
                {count > 1 && (
                  <span className="absolute top-2 left-2 text-[10px] font-black px-2 py-0.5 rounded-full bg-violet-600 text-white">×{count}</span>
                )}
                <div className={`mx-auto h-16 w-16 rounded-2xl bg-gradient-to-br ${colors[b.color] || colors.amber} flex items-center justify-center text-3xl mb-3 shadow-lg`}>{b.icon}</div>
                <div className="font-bold text-sm mb-1">{b.name}</div>
                <div className="text-xs text-muted-foreground">{b.description}</div>
                {got && <div className="text-[10px] text-emerald-600 font-bold mt-2">✓ حصلت عليها {count > 1 ? `(${count} مرات)` : ""}</div>}
              </div>
            );
          })}
        </div>
      </main>

    </div>
  );
}

// ── ملصقات المعلم — قسم الطالب ──────────────────────────────────────────────
function TeacherStickersSection({ uid }: { uid: string }) {
  const [stickers, setStickers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data } = await (supabase as any)
      .from("teacher_stickers")
      .select("id, teacher_id, image_url, title, message, created_at")
      .eq("student_id", uid)
      .order("created_at", { ascending: false });
    setStickers(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [uid]);

  // ريل تايم — يظهر الملصق فور إرساله
  useEffect(() => {
    const ch = (supabase as any)
      .channel(`stickers-rt-${uid}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "teacher_stickers",
        filter: `student_id=eq.${uid}`,
      }, (payload: any) => {
        setStickers((prev) => [payload.new, ...prev]);
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid]);

  if (loading) return null;
  if (stickers.length === 0) return null;

  const filtered = search.trim()
    ? stickers.filter((s: any) => (s.title || "").includes(search) || (s.message || "").includes(search))
    : stickers;

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-2xl">🌟</span>
        <h3 className="font-black text-lg">ملصقاتي</h3>
        <span className="text-xs text-muted-foreground font-normal bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-2 py-0.5 rounded-full">
          {stickers.length}
        </span>
      </div>
      {stickers.length > 2 && (
        <div className="relative mb-3">
          <Search className="absolute right-3 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث في الملصقات..."
            className="w-full pr-9 pl-4 py-2 rounded-xl border border-border bg-background text-sm"
          />
        </div>
      )}
      {filtered.length === 0 ? (
        <p className="text-sm text-center text-muted-foreground py-4">لا توجد نتائج</p>
      ) : (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {filtered.map((s: any) => (
          <div
            key={s.id}
            className="rounded-2xl overflow-hidden border-2 border-amber-200 dark:border-amber-800 shadow-md hover:shadow-lg transition group"
            style={{ background: "linear-gradient(135deg, #fffbeb, #fff7ed)" }}
          >
            <div className="relative">
              <img
                src={s.image_url}
                alt={s.title}
                className="w-full h-36 object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            </div>
            <div className="p-3">
              <div className="font-black text-sm text-amber-800 dark:text-amber-300 mb-0.5">{s.title}</div>
              {s.message && (
                <div className="text-xs text-amber-700/80 dark:text-amber-500 italic line-clamp-2">
                  "{s.message}"
                </div>
              )}
              <div className="text-[10px] text-muted-foreground mt-1.5">
                {new Date(s.created_at).toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" })}
              </div>
            </div>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
