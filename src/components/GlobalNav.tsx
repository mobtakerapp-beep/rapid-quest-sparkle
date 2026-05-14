import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { User as UserIcon, Moon, Sun, MessageSquare, Home, LogOut, BadgeCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "./NotificationBell";
import { roleLabelFor, adminBadgeFor } from "@/lib/greeting";

export function GlobalNav() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [uid, setUid] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [roleType, setRoleType] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("theme-mode");
    const isDark = saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches);
    setDark(isDark);
    document.documentElement.classList.toggle("dark", isDark);
  }, []);

  useEffect(() => {
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
    };
    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id || null;
      setUid(id);
      if (id) load(id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => {
      const id = s?.user.id || null;
      setUid(id);
      if (id) load(id);
      else { setAvatar(null); setName(null); setRoleType(null); setGender(null); setIsAdmin(false); }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

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
      className="fixed top-[60px] left-0 right-0 z-[190] bg-card/97 backdrop-blur border-b border-border shadow-sm"
      dir="rtl"
    >
      <div className="flex items-center justify-between px-3 py-1.5 gap-2">

        {/* يمين: التحية + الاسم مع صورة البروفايل */}
        {uid ? (
          <Link to="/profile" className="flex items-center gap-2 min-w-0 group flex-1">
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="h-8 w-8 rounded-xl object-cover ring-2 ring-[var(--brand)]/40 group-hover:ring-[var(--brand)] transition shrink-0"
              />
            ) : (
              <div className="h-8 w-8 rounded-xl bg-[image:var(--gradient-hero)] flex items-center justify-center text-white shrink-0">
                <UserIcon className="h-4 w-4" />
              </div>
            )}
            <div className="flex flex-col min-w-0">
              <span className="text-[10px] text-muted-foreground leading-none">مرحباً 👋</span>
              <span
                className={`text-xs font-black leading-snug truncate ${nameColor}`}
                style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}
              >
                {roleLabel ? `${roleLabel} ` : ""}
                {name || "..."}
              </span>
              {isAdmin && (
                <span className="text-[9px] px-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-black w-fit">
                  {adminBadgeFor(gender)}
                </span>
              )}
              {(roleType === "teacher" || roleType === "supervisor") && !isAdmin && (
                <span className="text-[9px] text-emerald-600 font-bold flex items-center gap-0.5">
                  <BadgeCheck className="h-2.5 w-2.5" /> معتمد
                </span>
              )}
            </div>
          </Link>
        ) : (
          <Link to="/login" className="flex items-center gap-2 text-xs font-bold text-[var(--brand)] flex-1">
            <div className="h-8 w-8 rounded-xl bg-secondary flex items-center justify-center">
              <UserIcon className="h-4 w-4" />
            </div>
            <span>تسجيل الدخول</span>
          </Link>
        )}

        {/* يسار: الأيقونات */}
        <div className="flex items-center gap-0.5 shrink-0">
          <Link
            to="/"
            className={`p-2 rounded-xl hover:bg-secondary transition ${pathname === "/" ? "text-[var(--brand)]" : "text-muted-foreground"}`}
            aria-label="الرئيسية"
            title="الرئيسية"
          >
            <Home className="h-4 w-4" />
          </Link>

          <button
            onClick={toggleDark}
            className="p-2 rounded-xl hover:bg-secondary text-muted-foreground transition"
            aria-label="الوضع الليلي"
            title="الوضع الليلي"
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>

          {uid && <NotificationBell userId={uid} />}

          {uid && (
            <Link
              to={"/messages" as any}
              className="p-2 rounded-xl hover:bg-secondary text-muted-foreground transition"
              aria-label="الرسائل"
              title="الرسائل الخاصة"
            >
              <MessageSquare className="h-4 w-4" />
            </Link>
          )}

          {uid && (
            <button
              onClick={handleSignOut}
              className="p-2 rounded-xl hover:bg-rose-50 dark:hover:bg-rose-950/40 text-rose-500 hover:text-rose-600 transition"
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
