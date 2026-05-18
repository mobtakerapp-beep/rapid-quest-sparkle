import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { FullPageLoader } from "@/components/LoadingSpinner";
import { ArrowLeft, TrendingUp, Award, BookOpen, ClipboardList, Zap, Target, Star } from "lucide-react";
import { toAr } from "@/lib/utils";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, BarChart, Bar,
} from "recharts";

export const Route = createFileRoute("/progress")({ component: StudentProgressPage });

function StudentProgressPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [quizAttempts, setQuizAttempts] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);
  const [competitions, setCompetitions] = useState<any[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const uid = data.session.user.id;

      const [
        { data: prof },
        { data: attempts },
        { data: subs },
        { data: acts },
        { data: compSubs },
      ] = await Promise.all([
        supabase.from("profiles").select("display_name, points, level, role_type, gender").eq("id", uid).maybeSingle(),
        supabase.from("quiz_attempts").select("score, total, created_at, quiz_id").eq("user_id", uid).order("created_at"),
        supabase.from("assignment_submissions").select("grade, created_at, assignment_id").eq("student_id", uid).order("created_at"),
        supabase.from("activities").select("id, title, created_at, subject").eq("user_id", uid).order("created_at"),
        supabase.from("competition_submissions" as any).select("score, is_correct, created_at").eq("user_id", uid).order("created_at"),
      ]);

      setProfile(prof);
      setQuizAttempts(attempts || []);
      setAssignments(subs || []);
      setActivities(acts || []);
      setCompetitions(compSubs || []);
      setLoading(false);
    });
  }, [navigate]);

  if (loading) return <FullPageLoader />;

  const totalQuizzes = quizAttempts.length;
  const avgScore = totalQuizzes
    ? Math.round(quizAttempts.reduce((s, a) => s + (a.total ? (a.score / a.total) * 100 : 0), 0) / totalQuizzes)
    : 0;
  const gradedAssignments = assignments.filter((a) => a.grade !== null && a.grade !== undefined);
  const avgGrade = gradedAssignments.length
    ? Math.round(gradedAssignments.reduce((s, a) => s + Number(a.grade || 0), 0) / gradedAssignments.length)
    : 0;
  const compCorrect = competitions.filter((c) => c.is_correct).length;
  const compTotal = competitions.length;
  const compRate = compTotal ? Math.round((compCorrect / compTotal) * 100) : 0;

  // chart: quiz scores over time (last 15)
  const quizChartData = quizAttempts.slice(-15).map((a, i) => ({
    name: toAr(i + 1),
    النسبة: a.total ? Math.round((a.score / a.total) * 100) : 0,
  }));

  // radar: overall performance
  const radarData = [
    { subject: "الاختبارات", A: avgScore },
    { subject: "الواجبات",   A: avgGrade },
    { subject: "المسابقات",  A: compRate },
    { subject: "الأنشطة",   A: Math.min(activities.length * 10, 100) },
    { subject: "النقاط",     A: Math.min((profile?.points || 0) / 10, 100) },
  ];

  // subject performance bar chart (quizzes by subject)
  const subjectMap: Record<string, { total: number; count: number }> = {};
  quizAttempts.forEach((a) => {
    const sub = "رياضيات";
    if (!subjectMap[sub]) subjectMap[sub] = { total: 0, count: 0 };
    subjectMap[sub].total += a.total ? (a.score / a.total) * 100 : 0;
    subjectMap[sub].count++;
  });
  const subjectData = Object.entries(subjectMap).map(([name, v]) => ({
    name, النسبة: Math.round(v.total / v.count),
  }));

  const STAT_CARDS = [
    { icon: Zap,          label: "محاولات الاختبارات", value: toAr(totalQuizzes),          sub: `متوسط ${toAr(avgScore)}٪`,      color: "from-violet-500 to-purple-600" },
    { icon: ClipboardList, label: "الواجبات المُسلّمة",  value: toAr(assignments.length),    sub: gradedAssignments.length ? `متوسط ${toAr(avgGrade)}٪` : "لم تُصحَّح بعد", color: "from-sky-500 to-blue-600" },
    { icon: BookOpen,      label: "الأنشطة المشاركة",   value: toAr(activities.length),     sub: "نشاط",                           color: "from-emerald-500 to-teal-600" },
    { icon: Target,        label: "إجابات المسابقات",   value: `${toAr(compCorrect)}/${toAr(compTotal)}`, sub: `${toAr(compRate)}٪ صحيحة`, color: "from-amber-500 to-orange-600" },
    { icon: Star,          label: "إجمالي النقاط",      value: toAr(profile?.points || 0),  sub: `المستوى ${toAr(profile?.level || 1)}`, color: "from-rose-500 to-pink-600" },
  ];

  return (
    <div dir="rtl" className="min-h-screen bg-background pb-20">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="p-2 rounded-xl hover:bg-secondary transition">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white shrink-0">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-black text-base">تقدمي الشخصي</h1>
            <p className="text-[11px] text-muted-foreground">{profile?.display_name || "—"}</p>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-4xl space-y-6">

        {/* بطاقات الإحصاء */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {STAT_CARDS.map((card) => (
            <div key={card.label} className="bg-card rounded-2xl border border-border p-4 flex flex-col gap-2">
              <div className={`h-8 w-8 rounded-xl bg-gradient-to-br ${card.color} flex items-center justify-center text-white shrink-0`}>
                <card.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-black">{card.value}</p>
                <p className="text-[10px] text-muted-foreground leading-tight">{card.label}</p>
                <p className="text-[10px] text-[var(--brand)] font-bold mt-0.5">{card.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* الرادار */}
        <div className="bg-card rounded-2xl border border-border p-5">
          <h2 className="font-black mb-1 flex items-center gap-2">
            <Award className="h-5 w-5 text-violet-500" /> الأداء العام
          </h2>
          <p className="text-xs text-muted-foreground mb-4">نظرة شاملة على جميع مجالات التعلم</p>
          <div className="flex justify-center">
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart data={radarData} margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                <PolarGrid stroke="rgba(139,92,246,0.2)" />
                <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11, fill: "var(--muted-foreground)", fontFamily: "Tajawal" }} />
                <Radar name="الأداء" dataKey="A" stroke="#7c3aed" fill="#7c3aed" fillOpacity={0.25} strokeWidth={2} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}
                  formatter={(v: any) => [`${v}٪`, "الأداء"]}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* منحنى الاختبارات */}
        {quizChartData.length > 1 && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-black mb-1 flex items-center gap-2">
              <Zap className="h-5 w-5 text-violet-500" /> تطور درجاتي في الاختبارات
            </h2>
            <p className="text-xs text-muted-foreground mb-4">آخر {toAr(quizChartData.length)} محاولة</p>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={quizChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Tajawal" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} unit="٪" />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}
                  formatter={(v: any) => [`${v}٪`, "النسبة"]}
                />
                <Line
                  type="monotone" dataKey="النسبة" stroke="#7c3aed" strokeWidth={2.5}
                  dot={{ fill: "#7c3aed", r: 4 }} activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* مقارنة المواد */}
        {subjectData.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-black mb-1 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-emerald-500" /> الأداء حسب المادة
            </h2>
            <p className="text-xs text-muted-foreground mb-4">متوسط النسبة في كل مادة</p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={subjectData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fontFamily: "Tajawal" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} unit="٪" />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 12 }}
                  formatter={(v: any) => [`${v}٪`, "النسبة"]}
                />
                <defs>
                  <linearGradient id="barGreen" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#059669" />
                  </linearGradient>
                </defs>
                <Bar dataKey="النسبة" fill="url(#barGreen)" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* الأنشطة الأخيرة */}
        {activities.length > 0 && (
          <div className="bg-card rounded-2xl border border-border p-5">
            <h2 className="font-black mb-4 flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-sky-500" /> آخر أنشطتي
            </h2>
            <div className="space-y-2">
              {activities.slice(-5).reverse().map((a: any) => (
                <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-secondary/50">
                  <div className="h-7 w-7 rounded-lg bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
                    <BookOpen className="h-3.5 w-3.5 text-sky-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{a.title}</p>
                    <p className="text-[11px] text-muted-foreground">{a.subject || "عام"}</p>
                  </div>
                  <span className="text-[10px] text-muted-foreground shrink-0">
                    {new Date(a.created_at).toLocaleDateString("ar-OM", { month: "short", day: "numeric" })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* حالة فارغة */}
        {totalQuizzes === 0 && assignments.length === 0 && activities.length === 0 && (
          <div className="text-center py-16">
            <TrendingUp className="h-16 w-16 text-muted-foreground mx-auto mb-4 opacity-30" />
            <p className="text-lg font-bold text-muted-foreground">لا توجد بيانات بعد</p>
            <p className="text-sm text-muted-foreground mt-1">شارك في الأنشطة والاختبارات لترى تقدمك هنا</p>
            <Link to="/quizzes" className="inline-flex mt-4 px-4 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white text-sm font-bold">
              ابدأ اختباراً الآن
            </Link>
          </div>
        )}

      </main>
    </div>
  );
}
