import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Image, BookOpen, Trophy, Users, MessageCircle, Sparkles, Zap, GraduationCap, Bot, Calendar as CalIcon, ClipboardList, Award, Target, Shield, Info, X, MapPin, Heart, Star, ArrowUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { roleLabelFor, adminBadgeFor } from "@/lib/greeting";
import { InstallPWA } from "@/components/InstallPWA";
import logo from "@/assets/original-logo-reference.jpg";
import { HonorBoard } from "@/components/HonorBoard";
import { getCountryFlag } from "@/lib/countryFlag";
import { useLang } from "@/contexts/LanguageContext";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "مبادرة كلنا معاً - محافظة الوسطى" },
      { name: "description", content: "منصة تعليمية تفاعلية تجمع بين المعلمين والطلاب وأولياء الأمور لتعزيز التعلم والإبداع" },
    ],
    links: [
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700;900&display=swap" },
    ],
  }),
  component: Index,
});

const features = [
  { icon: Bot, title: "المساعد الذكي المتقدم", desc: "اسأل أي سؤال في الرياضيات — يدعم الصور والكسور والجذور", color: "from-violet-500 to-pink-500", to: "/assistant" as const, badgeKey: null },
  { icon: Users, title: "مجتمع تعليمي", desc: "شات مباشر بين المعلمين والطلاب وأولياء الأمور", color: "from-emerald-500 to-teal-500", to: "/chat" as const, badgeKey: null },
  { icon: Image, title: "معرض الإبداعات", desc: "شارك صورك وفيديوهاتك وإبداعاتك مع زملائك", color: "from-pink-500 to-rose-500", to: "/gallery" as const, badgeKey: null },
  { icon: Zap, title: "المسابقات السريعة", desc: "تنافس على السرعة والإجابة الصحيحة", color: "from-yellow-500 to-orange-500", to: "/competitions" as const, badgeKey: null },
  { icon: Trophy, title: "مسابقات معرض الإبداعات", desc: "أحسن رسمة وفيديو وصورة", color: "from-amber-500 to-orange-600", to: "/gallery-contests" as const, badgeKey: null },
  { icon: BookOpen, title: "بنك الأنشطة", desc: "أنشطة وأوراق عمل متنوعة للصف الخامس", color: "from-blue-500 to-cyan-500", to: "/activities" as const, badgeKey: null },
  { icon: ClipboardList, title: "الواجبات", desc: "حل واجباتك واحصل على تقييم المعلم", color: "from-blue-500 to-indigo-500", to: "/assignments" as const, badgeKey: "assignments" },
  { icon: Target, title: "اختبارات تفاعلية", desc: "اختبر معلوماتك واكسب نقاطاً", color: "from-rose-500 to-pink-500", to: "/quizzes" as const, badgeKey: null },
  { icon: CalIcon, title: "التقويم", desc: "مواعيد المسابقات والفعاليات", color: "from-cyan-500 to-blue-500", to: "/calendar" as const, badgeKey: null },
  { icon: Trophy, title: "لوحة المتصدرين", desc: "أعلى معلم وأعلى طالب مشارك", color: "from-amber-500 to-orange-500", to: "/leaderboard" as const, badgeKey: null },
  { icon: Award, title: "شاراتي وإنجازاتي", desc: "شاراتك وشهادة التقدير وكشف درجاتك", color: "from-amber-500 to-yellow-500", to: "/badges" as const, badgeKey: null },
  { icon: GraduationCap, title: "لوحة المعلم", desc: "متابعة إحصائيات الطلاب", color: "from-emerald-600 to-teal-600", to: "/teacher" as const, badgeKey: null },
  { icon: Shield, title: "لوحة الإدارة", desc: "نظرة شاملة على المنصة (للمشرف)", color: "from-amber-700 to-red-600", to: "/admin" as const, badgeKey: null },
];

function Index() {
  const { isAr } = useLang();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [roleType, setRoleType] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [school, setSchool] = useState<string | null>(null);
  const [grade, setGrade] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  const [badges, setBadges] = useState<Record<string, number>>({});
  const [userId, setUserId] = useState<string | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const el = document.querySelector(".app-content-with-nav");
    if (!el) return;
    const onScroll = () => setShowScrollTop(el.scrollTop > 400);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    try {
      const cached = localStorage.getItem("home-greeting-v2");
      if (cached) {
        const c = JSON.parse(cached);
        setDisplayName(c.display_name || null);
        setRoleType(c.role_type || null);
        setCountry(c.country || null);
        setSchool(c.school || null);
        setGrade(c.grade || null);
        setGender(c.gender || null);
        setIsAdmin(!!c.isAdmin);
      }
    } catch {}

    let uid: string | null = null;

    const fetchProfile = async (id: string) => {
      const [{ data: profile }, { data: roles }, { data: priv }] = await Promise.all([
        supabase.from("profiles").select("display_name, role_type, country, school, gender").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("profiles_private" as any).select("grade").eq("user_id", id).maybeSingle(),
      ]);
      const admin = !!roles?.some((r) => r.role === "admin");
      const g = (priv as any)?.grade || null;
      setDisplayName(profile?.display_name || null);
      setRoleType((profile as any)?.role_type || null);
      setCountry((profile as any)?.country || null);
      setSchool((profile as any)?.school || null);
      setGrade(g);
      setGender((profile as any)?.gender || null);
      setIsAdmin(admin);
      try {
        localStorage.setItem("home-greeting-v2", JSON.stringify({
          display_name: profile?.display_name || null,
          role_type: (profile as any)?.role_type || null,
          country: (profile as any)?.country || null,
          school: (profile as any)?.school || null,
          grade: g,
          gender: (profile as any)?.gender || null,
          isAdmin: admin,
        }));
      } catch {}

      // Fetch section badges (unread notifications + unread DMs)
      const [{ count: notifCount }, { data: dms }] = await Promise.all([
        supabase.from("notifications").select("id", { count: "exact", head: true }).eq("user_id", id).eq("is_read", false),
        supabase.from("direct_messages" as any).select("id").eq("to_user_id", id).is("read_at", null),
      ]);
      const b: Record<string, number> = {};
      if (notifCount && notifCount > 0) b["notifications"] = notifCount;
      if ((dms || []).length > 0) b["messages"] = (dms || []).length;
      setBadges(b);
    };

    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!id) { localStorage.removeItem("home-greeting-v2"); return; }
      uid = id;
      setUserId(id);
      fetchProfile(id);
    });

    const ch = supabase.channel("home-profile-rt")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload: any) => {
        if (uid && payload.new?.id === uid) fetchProfile(uid);
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, (payload: any) => {
        if (uid && (payload.new as any)?.user_id === uid) {
          setBadges((b) => ({ ...b, notifications: (b.notifications || 0) + 1 }));
        }
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload: any) => {
        if (uid && (payload.new as any)?.to_user_id === uid) {
          setBadges((b) => ({ ...b, messages: (b.messages || 0) + 1 }));
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const roleLabel = roleLabelFor(roleType, gender);
  const isTeacher = roleType === "teacher" || roleType === "supervisor" || roleType === "admin" || isAdmin;
  const isStudent = roleType === "student" && !isAdmin;

  return (
    <div dir="rtl" className="min-h-screen bg-background overflow-hidden">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-[var(--brand)] opacity-20 blur-3xl" />
        <div className="absolute top-40 -left-40 h-96 w-96 rounded-full bg-[var(--brand-2)] opacity-20 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-96 w-96 rounded-full bg-[var(--brand-3)] opacity-15 blur-3xl" />
      </div>

      {/* Hero */}
      <section className="container mx-auto px-6 pt-6 pb-16 text-center">
        {/* Badge pill */}
        <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/70 dark:bg-card/80 backdrop-blur border border-border mb-8 shadow-sm">
          <Sparkles className="h-4 w-4 text-[var(--brand)] animate-[sparkle-spin_3s_ease-in-out_infinite]" />
          <span className="text-sm font-bold bg-[image:var(--gradient-hero)] bg-clip-text text-transparent">
            {isAr ? "منصة تعليمية تفاعلية" : "Interactive Learning Platform"}
          </span>
        </div>

        {/* Logo with animated pulse rings */}
        <div className="animate-fade-in-up delay-100 relative mx-auto mb-8 h-40 w-40 md:h-52 md:w-52 flex items-center justify-center">
          <span className="animate-pulse-ring absolute inset-0 rounded-full bg-[var(--brand)] opacity-30" />
          <span className="animate-pulse-ring delay-300 absolute inset-0 rounded-full bg-[var(--brand-2)] opacity-20" />
          <span className="animate-pulse-ring delay-600 absolute inset-0 rounded-full bg-[var(--brand-3)] opacity-15" />
          <div className="relative h-40 w-40 md:h-52 md:w-52 rounded-full overflow-hidden shadow-2xl ring-4 ring-[var(--brand)]/30 bg-white animate-float">
            <img src={logo} alt="شعار مبادرة كلنا معاً" className="h-full w-full object-cover" width={400} height={400} />
          </div>
        </div>

        {/* Shimmer title */}
        <h1 className="animate-fade-in-up delay-200 animate-shimmer text-5xl md:text-7xl font-black tracking-tight mb-3 leading-[1.2]"
          style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
          {isAr ? "مبادرة كلنا معاً" : "Kulluna Maaan Initiative"}
        </h1>
        <p className="animate-fade-in-up delay-300 text-2xl md:text-3xl font-extrabold mb-2" style={{ fontFamily: "'Tajawal', sans-serif", letterSpacing: "0.05em" }}>
          <span className="bg-gradient-to-r from-amber-500 via-rose-500 to-violet-500 bg-clip-text text-transparent">
            {isAr ? "للصف الخامس" : "Grade 5"}
          </span>
        </p>
        <p className="animate-fade-in-up delay-400 text-lg md:text-xl font-bold text-[var(--brand)] mb-6">{isAr ? "رياضيات" : "Mathematics"}</p>

        <p className="animate-fade-in-up delay-500 text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
          {isAr ? (
            <>
              منصة تعليمية تفاعلية تجمع بين المعلمين والطلاب وأولياء الأمور
              <br className="hidden md:block" />
              لتعزيز التعلم والإبداع في رحلة ممتعة وملهمة
            </>
          ) : (
            <>
              An interactive educational platform connecting teachers, students, and parents
              <br className="hidden md:block" />
              to enhance learning and creativity in a fun and inspiring journey.
            </>
          )}
        </p>

        {/* Welcome card with animated gradient border */}
        {displayName && (
          <div className="animated-border animate-fade-in-up delay-300 mx-auto mb-6 max-w-xl rounded-2xl px-5 py-4 shadow-[var(--shadow-soft)]">
            <div className="text-sm text-muted-foreground">{isAr ? "مرحباً بك 👋" : "Welcome 👋"}</div>
            <div className="mt-1 text-xl font-black text-foreground flex items-center justify-center gap-2 flex-wrap"
              style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}>
              <span className="bg-[image:var(--gradient-hero)] bg-clip-text text-transparent">{roleLabel ? `${roleLabel} ` : ""}{displayName}</span>
              {isAdmin && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {adminBadgeFor(gender)}
                </span>
              )}
            </div>
            <div className="mt-2 text-sm text-muted-foreground flex items-center justify-center gap-2 flex-wrap">
              {country && (
                <span className="inline-flex items-center gap-1">
                  {getCountryFlag(country) && <span className="text-base leading-none">{getCountryFlag(country)}</span>}
                  <span>{country}</span>
                </span>
              )}
              {school && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium text-xs border border-blue-100">
                  🏫 {school}
                </span>
              )}
              {isStudent && grade && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-bold text-xs border border-emerald-100">
                  📚 الصف {grade}
                </span>
              )}
              {isTeacher && grade && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-violet-50 text-violet-700 font-bold text-xs border border-violet-100">
                  🎓 {grade}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="animate-fade-in-up delay-600 flex items-center justify-center gap-3 flex-wrap">
          <Link to="/login" className="group inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-[image:var(--gradient-hero)] text-white font-bold text-lg shadow-[var(--shadow-soft)] hover:scale-105 hover:shadow-2xl transition-all duration-300">
            <MessageCircle className="h-5 w-5 group-hover:rotate-12 transition-transform" />
            {isAr ? "انضم إلى المجتمع" : "Join the Community"}
          </Link>
          <button onClick={() => setShowAbout(true)} className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl bg-white/80 dark:bg-card/80 backdrop-blur border border-border font-bold hover:scale-105 hover:border-[var(--brand)] transition-all duration-300">
            <Info className="h-5 w-5 text-[var(--brand)]" /> {isAr ? "نبذة عن المبادرة" : "About"}
          </button>
          <InstallPWA />
        </div>

        {showAbout && (
          <div dir="rtl" className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={() => setShowAbout(false)}>
            <div className="bg-card rounded-3xl max-w-lg w-full p-6 shadow-xl relative" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => setShowAbout(false)} className="absolute top-4 left-4 p-1.5 rounded-lg hover:bg-secondary"><X className="h-4 w-4" /></button>
              <div className="text-center">
                <div className="inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-[image:var(--gradient-hero)] text-white mb-3"><Info className="h-7 w-7" /></div>
                <h3 className="text-2xl font-black mb-2">نبذة عن المبادرة</h3>
                <p className="text-sm leading-relaxed text-muted-foreground mb-5">
                  مبادرة <b>«كلنا معاً»</b> مبادرة تعليمية تربوية تهدف إلى رفع مستوى التحصيل في أساسيات
                  مادة الرياضيات لطلاب الصف الخامس بمحافظة الوسطى، عبر بيئة تفاعلية تجمع المعلم
                  والطالب وولي الأمر في منصة واحدة ميسّرة وآمنة.
                </p>
                <div className="rounded-2xl bg-secondary/50 p-4 text-right space-y-2">
                  <div className="text-xs text-muted-foreground">منفّذ المبادرة</div>
                  <div className="font-black">الأستاذ محمد النعمان</div>
                  <div className="text-xs text-muted-foreground">مشرف مادة الرياضيات بمحافظة الوسطى</div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="mt-6 text-sm text-muted-foreground">
          {isAr ? "مجاني بالكامل • سهل الاستخدام • آمن للأطفال" : "100% Free • Easy to Use • Safe for Kids"}
        </div>
      </section>

      {/* Honor Board */}
      <HonorBoard />

      {/* Features with badges */}
      <section className="container mx-auto px-6 pb-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-black mb-3">{isAr ? "ماذا نقدم لك؟" : "What We Offer"}</h2>
          <p className="text-muted-foreground">{isAr ? "كل ما تحتاجه لرحلة تعليمية ممتعة في مكان واحد" : "Everything you need for an enjoyable learning journey in one place"}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f, i) => {
            const badgeCount = f.badgeKey ? (badges[f.badgeKey] || 0) : 0;
            return (
              <Link key={f.title} to={f.to}
                className="feature-card animate-fade-in-up group relative bg-card rounded-3xl p-7 border border-border shadow-[var(--shadow-card)] text-right"
                style={{ animationDelay: `${0.05 * i}s`, "--card-glow": `color-mix(in oklch, ${f.color.includes("violet") ? "oklch(0.6 0.22 290)" : f.color.includes("emerald") ? "oklch(0.55 0.18 150)" : f.color.includes("rose") ? "oklch(0.65 0.2 10)" : f.color.includes("amber") ? "oklch(0.75 0.18 60)" : f.color.includes("cyan") ? "oklch(0.65 0.18 200)" : "oklch(0.62 0.19 265)"} 40%, transparent)` } as React.CSSProperties}>
                {badgeCount > 0 && (
                  <span className="absolute top-3 left-3 min-w-[22px] h-[22px] rounded-full bg-rose-500 text-white text-[11px] font-black flex items-center justify-center px-1 shadow-lg animate-pulse">
                    {badgeCount > 99 ? "99+" : badgeCount}
                  </span>
                )}
                <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 group-hover:rotate-3 transition-all duration-300`}>
                  <f.icon className="h-7 w-7 text-white" />
                </div>
                <h3 className="font-bold text-xl mb-2">{f.title}</h3>
                <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
              </Link>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 pb-16">
        <div className="relative overflow-hidden rounded-[2rem] bg-[image:var(--gradient-hero)] p-10 md:p-16 text-center text-white shadow-[var(--shadow-soft)]">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.3),transparent_50%)]" />
          <div className="relative">
            <h3 className="text-3xl md:text-4xl font-black mb-4">{isAr ? "جاهز لبدء رحلتك التعليمية؟" : "Ready to Start Your Learning Journey?"}</h3>
            <p className="text-white/90 mb-8 max-w-xl mx-auto">{isAr ? "انضم لمئات الطلاب الذين يتعلمون ويبدعون يومياً معنا" : "Join hundreds of students who learn and create with us daily"}</p>
            <Link to="/login" className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-white text-[var(--brand)] font-bold hover:scale-105 transition-transform">
              <MessageCircle className="h-5 w-5" />
              {isAr ? "ابدأ الآن مجاناً" : "Start for Free"}
            </Link>
          </div>
        </div>
      </section>

      {/* Professional Footer */}
      <footer className="bg-card border-t border-border" dir="rtl">
        <div className="container mx-auto px-6 py-12">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {/* Brand column */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <img src={logo} alt="شعار" className="h-12 w-12 rounded-xl object-cover shadow" />
                <div>
                  <div
                    className="font-black text-lg leading-tight bg-[image:var(--gradient-hero)] bg-clip-text text-transparent"
                    style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}
                  >
                    مبادرة كلنا معاً
                  </div>
                  <div className="text-xs text-muted-foreground">محافظة الوسطى — سلطنة عُمان</div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">
                منصة تعليمية تفاعلية تجمع المعلم والطالب وولي الأمر في بيئة آمنة وممتعة لتعزيز تعلّم الرياضيات.
              </p>
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Heart className="h-3.5 w-3.5 text-rose-400 fill-rose-400" />
                <span>مصنوع بحب لأبنائنا الطلاب</span>
              </div>
            </div>

            {/* Quick links */}
            <div>
              <div
                className="font-black mb-4 text-sm bg-[image:var(--gradient-hero)] bg-clip-text text-transparent"
                style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}
              >
                روابط سريعة
              </div>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { label: "الرئيسية", to: "/" },
                  { label: "المساعد الذكي", to: "/assistant" },
                  { label: "المجتمع", to: "/chat" },
                  { label: "المعرض", to: "/gallery" },
                  { label: "المسابقات", to: "/competitions" },
                  { label: "الواجبات", to: "/assignments" },
                  { label: "الاختبارات", to: "/quizzes" },
                  { label: "شاراتي وإنجازاتي", to: "/badges" },
                ].map((l) => (
                  <Link key={l.to} to={l.to as any} className="text-sm text-muted-foreground hover:text-foreground hover:font-medium transition flex items-center gap-1">
                    <Star className="h-2.5 w-2.5 text-amber-400" /> {l.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Names bar */}
        <div className="border-t border-border/60">
          <div className="container mx-auto px-6 py-5 flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-12">
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">منفّذ المبادرة</span>
              <span
                className="text-base font-black bg-[image:var(--gradient-hero)] bg-clip-text text-transparent"
                style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif", letterSpacing: "0.06em" }}
              >
                ✦ الأستاذ محمد النعمان ✦
              </span>
            </div>
            <div className="hidden sm:block w-px h-8 bg-border/60" />
            <div className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60 font-semibold">تصميم الموقع</span>
              <span
                className="text-base font-black bg-gradient-to-r from-violet-500 via-pink-500 to-rose-500 bg-clip-text text-transparent"
                style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif", letterSpacing: "0.06em" }}
              >
                ✦ الأستاذة مروة أبوبكر ✦
              </span>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-border">
          <div className="container mx-auto px-6 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>© {new Date().getFullYear()} مبادرة كلنا معاً — جميع الحقوق محفوظة</span>
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> آمن للأطفال</span>
              <span className="flex items-center gap-1">🇴🇲 سلطنة عُمان</span>
              <span>مجاني 100%</span>
            </div>
          </div>
        </div>
      </footer>

      {/* زر العودة للأعلى */}
      {showScrollTop && (
        <button
          onClick={() => document.querySelector(".app-content-with-nav")?.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[180] inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-[image:var(--gradient-hero)] text-white font-bold shadow-[var(--shadow-soft)] hover:scale-110 transition-all duration-300 animate-fade-in"
          aria-label="العودة للأعلى"
        >
          <ArrowUp className="h-4 w-4" />
          <span className="text-sm">للأعلى</span>
        </button>
      )}
    </div>
  );
}
