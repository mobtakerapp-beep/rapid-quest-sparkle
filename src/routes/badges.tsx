import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Award, Download, User as UserIcon, Target } from "lucide-react";
import jsPDF from "jspdf";
import { MyBadges } from "@/components/MyBadges";
import { MyCertificates } from "@/components/MyCertificates";

export const Route = createFileRoute("/badges")({ component: BadgesPage });

type B = { id: string; name: string; description: string | null; icon: string; color: string; audience: string };
type Attempt = { id: string; quiz_id: string; score: number; total: number; created_at: string; quiz_title?: string };

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
      // Hydrate quiz titles
      const qids = [...new Set((at || []).map((a: any) => a.quiz_id))];
      const { data: quizzes } = qids.length ? await supabase.from("quizzes").select("id, title").in("id", qids) : { data: [] };
      const qmap: Record<string, string> = {};
      (quizzes || []).forEach((q: any) => { qmap[q.id] = q.title; });
      setAttempts((at || []).map((a: any) => ({ ...a, quiz_title: qmap[a.quiz_id] || "اختبار" })));
    });
  }, [navigate]);

  const certificate = async () => {
    // Render with browser canvas (native Arabic shaping), then embed in PDF.
    const W = 2480, H = 1754; // A4 landscape @ 300dpi
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d")!;
    ctx.direction = "rtl";
    ctx.textAlign = "center";

    // Background gradient
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, "#fdf4ff"); g.addColorStop(1, "#eef2ff");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    // Decorative borders
    ctx.strokeStyle = "#8b5cf6"; ctx.lineWidth = 24;
    ctx.strokeRect(60, 60, W - 120, H - 120);
    ctx.strokeStyle = "#ec4899"; ctx.lineWidth = 6;
    ctx.strokeRect(120, 120, W - 240, H - 240);

    // Corner ornaments
    ctx.fillStyle = "#fbbf24"; ctx.font = "bold 90px serif";
    ctx.fillText("✦", 200, 220); ctx.fillText("✦", W - 200, 220);
    ctx.fillText("✦", 200, H - 160); ctx.fillText("✦", W - 200, H - 160);

    const arabicFont = "'Tajawal','Cairo','Amiri','Segoe UI','Arial'";

    // Header
    ctx.fillStyle = "#7c3aed"; ctx.font = `bold 90px ${arabicFont}`;
    ctx.fillText("شهادة تقدير", W / 2, 320);

    ctx.fillStyle = "#6b7280"; ctx.font = `40px ${arabicFont}`;
    ctx.fillText("مبادرة « كلنا معاً » – محافظة الوسطى", W / 2, 400);

    // Body
    ctx.fillStyle = "#374151"; ctx.font = `46px ${arabicFont}`;
    ctx.fillText("تُمنح هذه الشهادة إلى", W / 2, 600);

    ctx.fillStyle = "#111827"; ctx.font = `bold 110px ${arabicFont}`;
    ctx.fillText(name || "—", W / 2, 770);

    // Underline name
    ctx.strokeStyle = "#a78bfa"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(W / 2 - 700, 805); ctx.lineTo(W / 2 + 700, 805); ctx.stroke();

    ctx.fillStyle = "#374151"; ctx.font = `42px ${arabicFont}`;
    ctx.fillText("تقديراً لتميّزه ومشاركته الفاعلة في أنشطة المبادرة", W / 2, 920);
    ctx.fillText(`وحصوله على ${points} نقطة و ${Object.keys(counts).length} شارة من شارات الإنجاز`, W / 2, 990);

    // Date
    ctx.fillStyle = "#6b7280"; ctx.font = `36px ${arabicFont}`;
    const date = new Date().toLocaleDateString("ar-EG", { year: "numeric", month: "long", day: "numeric" });
    ctx.fillText(`التاريخ: ${date}`, W / 2, 1180);

    // Signature line + title (centered)
    ctx.strokeStyle = "#9ca3af"; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(W / 2 - 450, 1430); ctx.lineTo(W / 2 + 450, 1430); ctx.stroke();
    ctx.fillStyle = "#7c3aed"; ctx.font = `bold 44px ${arabicFont}`;
    ctx.fillText("المديرة العامة للتعليم بمحافظة الوسطى", W / 2, 1500);

    // Footer brand
    ctx.fillStyle = "#6b7280"; ctx.font = `30px ${arabicFont}`;
    ctx.fillText("منصة كلنا معاً للمتابعة الإلكترونية", W / 2, 1640);

    const img = c.toDataURL("image/jpeg", 0.95);
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    doc.addImage(img, "JPEG", 0, 0, 297, 210);
    doc.save(`شهادة-تقدير-${name || "بدون-اسم"}.pdf`);
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
          <Link to="/" className="inline-flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" /> الرئيسية</Link>
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center text-white"><Award className="h-5 w-5" /></div>
            <h1 className="font-bold">شاراتي وإنجازاتي</h1>
          </div>
        </div>
      </header>
      <main className="container mx-auto px-4 py-6 max-w-3xl">
        {/* Profile header with avatar */}
        <div className="bg-card rounded-3xl border border-border p-6 mb-6 text-center">
          <div className="mx-auto h-24 w-24 rounded-3xl overflow-hidden bg-[image:var(--gradient-hero)] text-white flex items-center justify-center mb-3 shadow-[var(--shadow-soft)]">
            {avatar ? <img src={avatar} alt="avatar" className="h-full w-full object-cover" /> : <UserIcon className="h-10 w-10" />}
          </div>
          <div className="font-black text-xl mb-1">{name || "—"}</div>
          <div className="text-5xl font-black bg-[image:var(--gradient-hero)] bg-clip-text text-transparent mb-1">{points}</div>
          <div className="text-sm text-muted-foreground mb-4">نقطة</div>
          <div className="text-sm mb-4">حصلت على <strong>{Object.keys(counts).length}</strong> من أصل <strong>{all.filter(b => b.audience === audience).length}</strong> شارة</div>
          <button onClick={certificate} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold">
            <Download className="h-4 w-4" /> تحميل شهادة تقدير عامة
          </button>
        </div>

        {/* Quiz scores — أولاً */}
        {attempts.length > 0 && (
          <div className="bg-card rounded-3xl border border-border p-6 shadow-[var(--shadow-card)] mt-6">
            <h3 className="font-bold mb-4 flex items-center gap-2"><Target className="h-5 w-5 text-rose-500" /> درجات اختباراتي ({attempts.length})</h3>
            <div className="space-y-2">
              {attempts.map((a) => {
                const pct = a.total > 0 ? Math.round((a.score / a.total) * 100) : 0;
                const color = pct >= 75 ? "emerald" : pct >= 50 ? "amber" : "rose";
                return (
                  <div key={a.id} className={`flex items-center justify-between p-3 rounded-xl border border-${color}-200 bg-${color}-50/50`}>
                    <div className="flex-1 min-w-0">
                      <div className="font-bold text-sm truncate">{a.quiz_title}</div>
                      <div className="text-[11px] text-muted-foreground">{new Date(a.created_at).toLocaleDateString("ar-EG")}</div>
                    </div>
                    <div className={`text-base font-black text-${color}-700`}>{a.score} / {a.total}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Earned certificates — ثانياً */}
        {uid && <MyCertificates uid={uid} />}

        {/* Earned badges — أخيراً */}
        {uid && <MyBadges uid={uid} />}

        {/* Catalog of all available badges */}
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
