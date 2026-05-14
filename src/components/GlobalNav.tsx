import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { User as UserIcon, Moon, Sun, BadgeCheck, MessageSquare, Home, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "./NotificationBell";
import { roleLabelFor, adminBadgeFor } from "@/lib/greeting";

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

  const roleLabel = roleLabelFor(roleType, gender).replace("أيها ", "").replace("أيتها ", "");

  const roleColor: Record<string, string> = {
    admin: "text-amber-600 dark:text-amber-400",
    supervisor: "text-violet-600 dark:text-violet-400",
    teacher: "text-emerald-600 dark:text-emerald-400",
    student: "text-sky-600 dark:text-sky-400",
    parent: "text-rose-600 dark:text-rose-400",
  };
  const nameColor = roleColor[roleType || ""] || "text-foreground";

  return (
    <>
      {/* ── شريط الأيقونات (يسار) ── */}
      <div
        className="fixed top-[62px] left-3 z-[190] flex flex-col items-center gap-1 bg-card/95 backdrop-blur border border-border rounded-2xl px-1 py-2 shadow-xl"
        dir="rtl"
      >
        <Link to="/" className="flex items-center gap-1 px-2 py-1.5 rounded-xl hover:bg-secondary text-[var(--brand)] font-bold text-xs" aria-label="الرئيسية">
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline text-[11px]">الرئيسية</span>
        </Link>
        <button onClick={toggleDark} className="p-2 rounded-xl hover:bg-secondary" aria-label="الوضع الليلي">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        {uid && <NotificationBell userId={uid} />}
        {uid && (
          <Link to={"/messages" as any} className="p-2 rounded-xl hover:bg-secondary" aria-label="الرسائل الخاصة">
            <MessageSquare className="h-4 w-4" />
          </Link>
        )}
        {uid && (
          <Link to="/profile" className="p-1 rounded-xl hover:bg-secondary" aria-label="بياناتي">
            {avatar ? (
              <img src={avatar} alt="" className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <div className="h-8 w-8 rounded-lg bg-[image:var(--gradient-hero)] flex items-center justify-center text-white">
                <UserIcon className="h-4 w-4" />
              </div>
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

      {/* ── اسم المستخدم (يمين) ── */}
      {uid && name && (
        <div
          className="fixed top-[62px] right-3 z-[190] flex flex-col items-end bg-card/95 backdrop-blur border border-border rounded-2xl px-3 py-2 shadow-xl max-w-[200px]"
          dir="rtl"
        >
          <Link to="/profile" className="flex flex-col items-end gap-0.5 group">
            <span
              className={`text-[11px] font-black tracking-wide truncate max-w-[160px] transition-opacity group-hover:opacity-70 ${nameColor}`}
              style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}
            >
              {roleLabel && <span className="opacity-70 font-medium ml-1">{roleLabel}</span>}
              {name}
            </span>
            {(roleType === "teacher" || roleType === "supervisor") && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 font-bold">
                <BadgeCheck className="h-3 w-3" /> معتمد
              </span>
            )}
            {isAdmin && (
              <span className="px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-black">
                {adminBadgeFor(gender)}
              </span>
            )}
          </Link>
        </div>
      )}
    </>
  );
}
