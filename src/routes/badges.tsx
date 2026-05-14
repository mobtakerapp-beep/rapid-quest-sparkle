import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Award, Download, User as UserIcon, Target, Palette, Type as TypeIcon } from "lucide-react";
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

  const [selectedTheme, setSelectedTheme] = useState(CERT_THEMES[0]);
  const [selectedFont, setSelectedFont] = useState(CERT_FONTS[0]);
  const [generating, setGenerating] = useState(false);

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
      const isTeacher = p?.role_type === "teacher" || p?.role_type === "supervisor" || !!roles?.some((r) => r.role === "admin");
      setAudience(isTeacher ? "teacher" : "student");
      setAll((bs || []) as B[]);
      const c: Record<string, number> = {};
      (ub || []).forEach((x: any) => { c[x.badge_id] = (c[x.badge_id] || 0) + 1; });
      setCounts(c);
      const qids = [...new Set((at || []).map((a: any) => a.quiz_id))];
      const { data: quizzes } = qids.length ? await supabase.from("quizzes").select("id, title").in("id", qids) : { data: [] };
      const qmap: Record<string, string> = {};
      (quizzes || []).forEach((q: any) => { qmap[q.id] = q.title; });
      setAttempts((at || []).map((a: any) => ({ ...a, quiz_title: qmap[a.quiz_id] || "اختبار" })));
    });
  }, [navigate]);

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
      ctx.fillText(`وحصوله على ${points} نقطة و ${Object.keys(counts).length} شارة من شارات الإنجاز`, W / 2, 1010);

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

  const colors: Record<string, string> = {
    amber: "from-amber-400 to-orange-500", emerald: "from-emerald-400 to-teal-500",
    rose: "from-rose-400 to-pink-500", violet: "from-violet-400 to-purple-500",
    cyan: "from-cyan-400 to-blue-500",
  };

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
          <div className="text-5xl font-black bg-[image:var(--gradient-hero)] bg-clip-text text-transparent mb-1">{points}</div>
          <div className="text-sm text-muted-foreground mb-4">نقطة</div>
          <div className="text-sm mb-4">حصلت على <strong>{Object.keys(counts).length}</strong> من أصل <strong>{all.filter(b => b.audience === audience).length}</strong> شارة</div>
        </div>

        {/* ── منتقي الثيم والشهادة inline ── */}
        <div className="bg-card rounded-3xl border border-border p-5 mb-6 space-y-4">
          <div className="font-bold flex items-center gap-2"><Palette className="h-4 w-4 text-[var(--brand)]" /> تخصيص شهادة التقدير</div>

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

          <button onClick={certificate} disabled={generating}
            className="w-full inline-flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50">
            <Download className="h-4 w-4" /> {generating ? "جاري التحضير..." : "تحميل الشهادة PDF"}
          </button>
        </div>

        {/* Quiz scores – compact scrollable */}
        {attempts.length > 0 && (
          <div className="bg-card rounded-3xl border border-border p-5 shadow-[var(--shadow-card)] mt-6">
            <h3 className="font-bold mb-3 flex items-center gap-2"><Target className="h-5 w-5 text-rose-500" /> درجات اختباراتي <span className="text-xs font-normal text-muted-foreground">({attempts.length})</span></h3>
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
                    <div className={`text-sm font-black ${txt} shrink-0`}>{a.score}/{a.total}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* شهادات الموقع */}
        {uid && <MyCertificates uid={uid} />}
        {/* الشارات */}
        {uid && <MyBadges uid={uid} />}

        <div className="text-center text-sm font-bold mb-3 mt-6 text-muted-foreground">
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
