import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Image, BookOpen, Trophy, Users, MessageCircle, Sparkles, Zap, GraduationCap, Bot, Calendar as CalIcon, ClipboardList, Award, Target, Shield, Info, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { roleLabelFor, adminBadgeFor } from "@/lib/greeting";
import { InstallPWA } from "@/components/InstallPWA";
import logo from "@/assets/original-logo-reference.jpg";
import omanEmblem from "@/assets/oman-emblem.png";
import { HonorBoard } from "@/components/HonorBoard";
import { LiveClock } from "@/components/LiveClock";
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
  { icon: Bot, title: "المساعد الذكي المتقدم", desc: "اسأل أي سؤال في الرياضيات — يدعم الصور والكسور والجذور", color: "from-violet-500 to-pink-500", to: "/assistant" as const },
  { icon: Users, title: "مجتمع تعليمي", desc: "شات مباشر بين المعلمين والطلاب وأولياء الأمور", color: "from-emerald-500 to-teal-500", to: "/chat" as const },
  { icon: Image, title: "معرض الإبداعات", desc: "شارك صورك وفيديوهاتك وإبداعاتك مع زملائك", color: "from-pink-500 to-rose-500", to: "/gallery" as const },
  { icon: Zap, title: "المسابقات السريعة", desc: "تنافس على السرعة والإجابة الصحيحة", color: "from-yellow-500 to-orange-500", to: "/competitions" as const },
  { icon: Trophy, title: "مسابقات معرض الإبداعات", desc: "أحسن رسمة وفيديو وصورة", color: "from-amber-500 to-orange-600", to: "/gallery-contests" as const },
  { icon: BookOpen, title: "بنك الأنشطة", desc: "أنشطة وأوراق عمل متنوعة للصف الخامس", color: "from-blue-500 to-cyan-500", to: "/activities" as const },
  { icon: ClipboardList, title: "الواجبات", desc: "حل واجباتك واحصل على تقييم المعلم", color: "from-blue-500 to-indigo-500", to: "/assignments" as const },
  { icon: Target, title: "اختبارات تفاعلية", desc: "اختبر معلوماتك واكسب نقاطاً", color: "from-rose-500 to-pink-500", to: "/quizzes" as const },
  { icon: CalIcon, title: "التقويم", desc: "مواعيد المسابقات والفعاليات", color: "from-cyan-500 to-blue-500", to: "/calendar" as const },
  { icon: Trophy, title: "لوحة المتصدرين", desc: "أعلى معلم وأعلى طالب مشارك", color: "from-amber-500 to-orange-500", to: "/leaderboard" as const },
  { icon: Award, title: "شاراتي", desc: "شاراتك وشهادة التقدير", color: "from-amber-500 to-yellow-500", to: "/badges" as const },
  // الرسائل الخاصة متاحة من أيقونة الشريط العلوي
  { icon: GraduationCap, title: "لوحة المعلم", desc: "متابعة إحصائيات الطلاب", color: "from-emerald-600 to-teal-600", to: "/teacher" as const },
  { icon: Shield, title: "لوحة الإدارة", desc: "نظرة شاملة على المنصة (للمشرف)", color: "from-amber-700 to-red-600", to: "/admin" as const },
];

function Index() {
  const { isAr } = useLang();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [roleType, setRoleType] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [school, setSchool] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAbout, setShowAbout] = useState(false);

  useEffect(() => {
    // Hydrate instantly from localStorage cache
    try {
      const cached = localStorage.getItem("home-greeting-v1");
      if (cached) {
        const c = JSON.parse(cached);
        setDisplayName(c.display_name || null);
        setRoleType(c.role_type || null);
        setCountry(c.country || null);
        setSchool(c.school || null);
        setGender(c.gender || null);
        setIsAdmin(!!c.isAdmin);
      }
    } catch {}

    let userId: string | null = null;
    const fetchProfile = async (id: string) => {
      const [{ data: profile }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("display_name, role_type, country, school, gender").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
      ]);
      const admin = !!roles?.some((r) => r.role === "admin");
      setDisplayName(profile?.display_name || null);
      setRoleType((profile as any)?.role_type || null);
      setCountry((profile as any)?.country || null);
      setSchool((profile as any)?.school || null);
      setGender((profile as any)?.gender || null);
      setIsAdmin(admin);
      try {
        localStorage.setItem("home-greeting-v1", JSON.stringify({
          display_name: profile?.display_name || null,
          role_type: (profile as any)?.role_type || null,
          country: (profile as any)?.country || null,
          school: (profile as any)?.school || null,
          gender: (profile as any)?.gender || null,
          isAdmin: admin,
        }));
      } catch {}
    };
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!id) { localStorage.removeItem("home-greeting-v1"); return; }
      userId = id;
      fetchProfile(id);
    });
    // Realtime: refresh greeting if profile changes
    const ch = supabase.channel("home-profile-rt")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles" }, (payload: any) => {
        if (userId && payload.new?.id === userId) fetchProfile(userId);
      }).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const roleLabel = roleLabelFor(roleType, gender);

  return (
    <div dir="rtl" className="min-h-screen bg-background overflow-hidden">
      <div className="absolute inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-[var(--brand)] opacity-20 blur-3xl" />
        <div className="absolute top-40 -left-40 h-96 w-96 rounded-full bg-[var(--brand-2)] opacity-20 blur-3xl" />
        <div className="absolute bottom-0 right-1/3 h-96 w-96 rounded-full bg-[var(--brand-3)] opacity-15 blur-3xl" />
      </div>

      {/* Top bar — static, appears only at top of page */}
      <div className="bg-background/90 backdrop-blur border-b border-border/40">
        <div className="container mx-auto px-6 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <img src={omanEmblem} alt="شعار سلطنة عمان" className="h-10 w-10 object-contain" width={40} height={40} />
            <div className="text-right leading-tight">
              <div className="text-xs text-muted-foreground">{isAr ? "سلطنة عُمان" : "Sultanate of Oman"}</div>
              <div className="font-bold text-sm">{isAr ? "محافظة الوسطى" : "Al Wusta Governorate"}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Hero */}
      <section className="container mx-auto px-6 pt-10 pb-16 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/60 backdrop-blur border border-border mb-6 shadow-sm">
          <Sparkles className="h-4 w-4 text-[var(--brand)]" />
          <span className="text-sm font-medium">{isAr ? "منصة تعليمية تفاعلية" : "Interactive Learning Platform"}</span>
        </div>

        <div className="mx-auto mb-4 h-40 w-40 md:h-52 md:w-52 rounded-full overflow-hidden flex items-center justify-center shadow-xl ring-4 ring-[var(--brand)]/20 bg-white">
          <img src={logo} alt="شعار مبادرة كلنا معاً" className="h-full w-full object-cover" width={400} height={400} />
        </div>

        <h1 className="text-5xl md:text-7xl font-black tracking-tight mb-3 bg-[image:var(--gradient-hero)] bg-clip-text text-transparent leading-[1.2]">
          {isAr ? "مبادرة كلنا معاً" : "Kulluna Maaan Initiative"}
        </h1>
        <p className="text-2xl md:text-3xl font-extrabold mb-2" style={{ fontFamily: "'Tajawal', sans-serif", letterSpacing: "0.05em" }}>
          <span className="bg-gradient-to-r from-amber-500 via-rose-500 to-violet-500 bg-clip-text text-transparent">
            {isAr ? "للصف الخامس" : "Grade 5"}
          </span>
        </p>
        <p className="text-lg md:text-xl font-bold text-[var(--brand)] mb-6">{isAr ? "رياضيات" : "Mathematics"}</p>

        <p className="text-lg text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed">
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

        {displayName && (
          <div className="mx-auto mb-6 max-w-xl rounded-2xl border border-border bg-card px-5 py-4 shadow-[var(--shadow-card)]">
            <div className="text-sm text-muted-foreground">{isAr ? "مرحباً بك 👋" : "Welcome 👋"}</div>
            <div className="mt-1 text-xl font-black text-foreground flex items-center justify-center gap-2 flex-wrap">
              <span>{roleLabel ? `${roleLabel} ` : ""}{displayName}</span>
              {isAdmin && (
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                  {adminBadgeFor(gender)}
                </span>
              )}
            </div>
            {(country || school) && (
              <div className="mt-1 text-sm text-muted-foreground flex items-center justify-center gap-1 flex-wrap">
                {country && (
                  <span className="inline-flex items-center gap-1">
                    {getCountryFlag(country) && <span className="text-base leading-none">{getCountryFlag(country)}</span>}
                    <span>{country}</span>
                  </span>
                )}
                {roleType === "teacher" && school ? ` • ${school}` : ""}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-center gap-3 flex-wrap">
          <Link to="/login" className="group inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-[image:var(--gradient-hero)] text-white font-bold text-lg shadow-[var(--shadow-soft)] hover:scale-105 transition-transform">
            <MessageCircle className="h-5 w-5" />
            {isAr ? "انضم إلى المجتمع" : "Join the Community"}
          </Link>
          <button onClick={() => setShowAbout(true)} className="inline-flex items-center gap-2 px-6 py-4 rounded-2xl bg-white/80 backdrop-blur border border-border font-bold hover:scale-105 transition-transform">
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

      {/* Features */}
      <section className="container mx-auto px-6 pb-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-black mb-3">{isAr ? "ماذا نقدم لك؟" : "What We Offer"}</h2>
          <p className="text-muted-foreground">{isAr ? "كل ما تحتاجه لرحلة تعليمية ممتعة في مكان واحد" : "Everything you need for an enjoyable learning journey in one place"}</p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((f) => (
            <Link key={f.title} to={f.to}
              className="group relative bg-card rounded-3xl p-7 border border-border shadow-[var(--shadow-card)] hover:-translate-y-2 hover:shadow-[var(--shadow-soft)] transition-all duration-300 text-right">
              <div className={`h-14 w-14 rounded-2xl bg-gradient-to-br ${f.color} flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform`}>
                <f.icon className="h-7 w-7 text-white" />
              </div>
              <h3 className="font-bold text-xl mb-2">{f.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{f.desc}</p>
            </Link>
          ))}
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

      {/* Credits Footer */}
      <footer className="container mx-auto px-6 py-8 border-t border-border">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-center md:text-right text-sm">
          <div>
            <div className="text-xs text-muted-foreground mb-1">إعداد المبادرة</div>
            <div className="font-bold">الأستاذ محمد النعمان</div>
          </div>
          <div className="md:text-left">
            <div className="text-xs text-muted-foreground mb-1">تصميم الموقع</div>
            <div className="font-bold">الأستاذة مروة أبوبكر</div>
          </div>
        </div>
        <div className="text-center text-xs text-muted-foreground mt-6">
          © مبادرة كلنا معاً • محافظة الوسطى • سلطنة عُمان
        </div>
      </footer>
    </div>
  );
}
