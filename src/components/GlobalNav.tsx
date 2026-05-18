import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { User as UserIcon, Moon, Sun, MessageSquare, Home, LogOut, BadgeCheck, Clock, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "./NotificationBell";
import { roleLabelFor, adminBadgeFor } from "@/lib/greeting";
import omanEmblem from "@/assets/oman-emblem.png";

function InlineClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const timeStr = time.toLocaleTimeString("ar-OM", { hour: "2-digit", minute: "2-digit", hour12: true });

  const gregorian = time.toLocaleDateString("ar-OM", { day: "numeric", month: "short", year: "numeric" });

  let hijri = "";
  try {
    hijri = time.toLocaleDateString("ar-OM-u-ca-islamic-umalqura", { day: "numeric", month: "short", year: "numeric" });
  } catch {
    hijri = "";
  }

  return (
    <div className="flex flex-col items-center leading-none select-none gap-px" dir="rtl">
      <span className="text-[11px] font-black tabular-nums text-foreground">{timeStr}</span>
      <span className="text-[9px] text-muted-foreground opacity-80 whitespace-nowrap">{gregorian}</span>
      {hijri && <span className="text-[8px] text-amber-600 dark:text-amber-400 opacity-90 whitespace-nowrap">{hijri}</span>}
    </div>
  );
}

export function GlobalNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isHome = pathname === "/";
  const [uid, setUid] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [roleType, setRoleType] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dark, setDark] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [unreadMsgs, setUnreadMsgs] = useState(0);

  useEffect(() => {
    const saved = localStorage.getItem("theme-mode");
    const isDark = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
    // Try cache first for instant display
    try {
      const cached = localStorage.getItem("home-greeting-v2");
      if (cached) {
        const c = JSON.parse(cached);
        if (c.display_name) {
          setName(c.display_name);
          setRoleType(c.role_type || null);
          setGender(c.gender || null);
          setIsAdmin(!!c.isAdmin);
        }
      }
    } catch {}

    const loadUnreadMsgs = async (id: string) => {
      const { data } = await supabase
        .from("direct_messages" as any)
        .select("id")
        .eq("to_user_id", id)
        .is("read_at", null);
      setUnreadMsgs((data || []).length);
    };

    const load = async (id: string) => {
      const [{ data: p }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("avatar_url, display_name, role_type, gender").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
      ]);
      setAvatar(p?.avatar_url || null);
      setName(p?.display_name || null);
      setGender((p as any)?.gender || null);
      const rolesList = (roles || []).map((r: any) => String(r.role));
      const hasAdmin = rolesList.includes("admin");
      const hasSupervisor = rolesList.includes("supervisor");
      const hasTeacher = rolesList.includes("teacher");
      let effectiveRole = p?.role_type || null;
      if (hasAdmin) effectiveRole = "admin";
      else if (hasSupervisor && effectiveRole !== "supervisor") effectiveRole = "supervisor";
      else if (hasTeacher && effectiveRole !== "teacher") effectiveRole = "teacher";
      setRoleType(effectiveRole);
      setIsAdmin(hasAdmin);
      setLoaded(true);
    };

    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id || null;
      setUid(id);
      if (id) { load(id); loadUnreadMsgs(id); }
      else setLoaded(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => {
      const id = s?.user.id || null;
      setUid(id);
      if (id) { load(id); loadUnreadMsgs(id); }
      else {
        setAvatar(null); setName(null); setRoleType(null);
        setGender(null); setIsAdmin(false); setLoaded(true);
        setUnreadMsgs(0);
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  // Subscribe to new direct messages for badge count
  useEffect(() => {
    if (!uid) return;
    const ch = supabase
      .channel("globalnav-dm-rt")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, (payload: any) => {
        if ((payload.new as any)?.to_user_id === uid) {
          setUnreadMsgs((n) => n + 1);
        }
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [uid]);

  // Clear messages badge when on /messages page
  useEffect(() => {
    if (pathname === "/messages" && unreadMsgs > 0) {
      setUnreadMsgs(0);
    }
  }, [pathname]);

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme-mode", next ? "dark" : "light");
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem("home-greeting-v2");
    window.location.href = "/";
  };

  const roleLabel = roleLabelFor(roleType, gender);
  const roleColor: Record<string, string> = {
    admin: "text-amber-600 dark:text-amber-400",
    supervisor: "text-violet-600 dark:text-violet-400",
    teacher: "text-emerald-600 dark:text-emerald-400",
    student: "text-sky-600 dark:text-sky-400",
    parent: "text-rose-600 dark:text-rose-400",
  };
  const nameColor = roleColor[roleType || ""] || "text-foreground";

  return (
    <div
      className="fixed top-[32px] left-0 right-0 z-[190] bg-card/97 backdrop-blur border-b border-border shadow-sm"
      dir="rtl"
    >
      <div className="flex items-center px-2 py-1 gap-1">

        {/* يمين: صورة + مرحبا بك + اللقب + الاسم */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0">
          {uid ? (
            <Link to="/profile" className="flex items-center gap-1.5 group min-w-0">
              {/* الصورة أو الأيقونة */}
              {avatar ? (
                <img
                  src={avatar}
                  alt=""
                  className="h-7 w-7 rounded-lg object-cover ring-2 ring-[var(--brand)]/30 group-hover:ring-[var(--brand)] transition shrink-0"
                />
              ) : (
                <div className="h-7 w-7 rounded-lg bg-[image:var(--gradient-hero)] flex items-center justify-center text-white shrink-0">
                  <UserIcon className="h-3.5 w-3.5" />
                </div>
              )}
              {/* النص: مرحبا بك + اللقب + الاسم */}
              <div className="flex flex-col min-w-0 leading-none gap-0.5">
                <span className="text-[9px] text-muted-foreground">مرحباً بك 👋</span>
                <div className="flex items-center gap-1 min-w-0">
                  {roleLabel && (
                    <span className={`text-[10px] font-bold truncate shrink-0 ${nameColor}`}>
                      {roleLabel}
                    </span>
                  )}
                  {name && (
                    <span
                      className={`text-[10px] font-black truncate ${nameColor}`}
                      style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}
                    >
                      {name}
                    </span>
                  )}
                </div>
                {isAdmin && (
                  <span className="text-[8px] px-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-black w-fit">
                    {adminBadgeFor(gender)}
                  </span>
                )}
                {(roleType === "teacher" || roleType === "supervisor") && !isAdmin && (
                  <span className="text-[8px] text-emerald-600 dark:text-emerald-400 font-bold flex items-center gap-0.5 w-fit">
                    <BadgeCheck className="h-2 w-2" /> معتمد
                  </span>
                )}
              </div>
            </Link>
          ) : (
            <Link to="/login" className="flex items-center gap-1.5 text-[10px] font-bold text-[var(--brand)]">
              <div className="h-7 w-7 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <UserIcon className="h-3.5 w-3.5" />
              </div>
              <span>تسجيل الدخول</span>
            </Link>
          )}
        </div>

        {/* وسط: شعار السلطنة + الأسطر الثلاثة */}
        <div className="flex items-center justify-center gap-1.5 px-2 shrink-0">
          <img src={omanEmblem} alt="شعار عمان" className="h-8 w-8 object-contain shrink-0 drop-shadow-sm" />
          <div className="flex flex-col items-center leading-none gap-px select-none">
            <span
              className="text-[10px] font-black tracking-wide text-foreground whitespace-nowrap"
              style={{ fontFamily: "'Tajawal','Cairo',sans-serif" }}
            >
              سلطنة عُمان
            </span>
            <span
              className="text-[9px] font-bold text-muted-foreground whitespace-nowrap"
              style={{ fontFamily: "'Tajawal','Cairo',sans-serif" }}
            >
              وزارة التعليم
            </span>
            <span
              className="text-[9px] font-bold whitespace-nowrap"
              style={{ fontFamily: "'Tajawal','Cairo',sans-serif", color: "var(--brand)" }}
            >
              محافظة الوسطى
            </span>
          </div>
        </div>

        {/* يسار: الساعة + الأيقونات */}
        <div className="flex items-center gap-0 shrink-0">
          <div className="px-1.5 border-l border-border">
            <InlineClock />
          </div>
          {/* ايقونة الرئيسية تختفي لما تكون في الرئيسية */}
          {!isHome && (
            <Link
              to="/"
              className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground transition"
              aria-label="الرئيسية"
              title="الرئيسية"
            >
              <Home className="h-4 w-4" />
            </Link>
          )}

          <button
            onClick={toggleDark}
            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground transition"
            aria-label="الوضع الليلي"
            title="الوضع الليلي"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          <button
            onClick={() => window.dispatchEvent(new Event("open-global-search"))}
            className="p-1.5 rounded-xl hover:bg-secondary text-muted-foreground transition"
            aria-label="بحث سريع"
            title="بحث سريع (Ctrl+K)"
          >
            <Search className="h-4 w-4" />
          </button>
          {uid && <NotificationBell userId={uid} />}

          {uid && (
            <Link
              to={"/messages" as any}
              className="relative p-1.5 rounded-xl hover:bg-secondary text-muted-foreground transition"
              aria-label="الرسائل"
              title="الرسائل الخاصة"
            >
              <MessageSquare className="h-4 w-4" />
              {unreadMsgs > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] px-0.5 rounded-full bg-rose-500 text-white text-[9px] flex items-center justify-center font-bold">
                  {unreadMsgs > 9 ? "9+" : unreadMsgs}
                </span>
              )}
            </Link>
          )}

          {uid && (
            <button
              onClick={handleSignOut}
              className="p-1.5 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 hover:text-rose-600 transition"
              aria-label="تسجيل خروج"
              title="تسجيل خروج"
            >
              <LogOut className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
