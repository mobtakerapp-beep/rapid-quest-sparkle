import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { User as UserIcon, Moon, Sun, BadgeCheck, MessageSquare } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { NotificationBell } from "./NotificationBell";
import { roleLabelFor, adminBadgeFor } from "@/lib/greeting";
import { useLang } from "@/contexts/LanguageContext";

export function GlobalNav() {
  const [uid, setUid] = useState<string | null>(null);
  const [avatar, setAvatar] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [roleType, setRoleType] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dark, setDark] = useState(false);
  const { lang, toggle: toggleLang } = useLang();

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
      // Derive effective role: user_roles takes priority over profiles.role_type
      // because claim_admin_role / claim_supervisor_role only insert into user_roles.
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

  const roleLabel = roleLabelFor(roleType, gender).replace("أيها ", "").replace("أيتها ", "");

  return (
    <div className="fixed top-[62px] left-3 z-[190] flex items-center gap-1 bg-card/95 backdrop-blur border border-border rounded-2xl px-2 py-1 shadow-xl" dir="rtl">
      {/* Language toggle */}
      <button
        onClick={toggleLang}
        className="px-2 py-1.5 rounded-xl hover:bg-secondary text-xs font-black tracking-wide"
        aria-label="تغيير اللغة"
        title={lang === "ar" ? "Switch to English" : "التبديل للعربية"}
      >
        {lang === "ar" ? "EN" : "ع"}
      </button>

      <button onClick={toggleDark} className="p-2 rounded-xl hover:bg-secondary" aria-label="الوضع الليلي">
        {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>
      {uid && <NotificationBell userId={uid} />}
      {uid && (
        <Link to={"/messages" as any} className="p-2 rounded-xl hover:bg-secondary" aria-label="الرسائل الخاصة" title="الرسائل الخاصة">
          <MessageSquare className="h-5 w-5" />
        </Link>
      )}
      {uid && name && (
        <Link to="/profile" className="flex items-center gap-1 px-2 text-xs font-bold text-foreground/80 hover:text-foreground max-w-[260px] truncate">
          <span className="hidden sm:inline">{lang === "ar" ? "مرحباً" : "Hi"}</span> {roleLabel} <span className="truncate">{name}</span>
          {(roleType === "teacher" || roleType === "supervisor") && (
            <BadgeCheck className="h-3.5 w-3.5 text-emerald-500" aria-label="معتمد" />
          )}
          {isAdmin && <span className="px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px]">{adminBadgeFor(gender)}</span>}
        </Link>
      )}
      {uid && (
        <Link to="/profile" className="p-1 rounded-xl hover:bg-secondary" aria-label="بياناتي" title="بياناتي - تعديل">
          {avatar ? (
            <img src={avatar} alt="" className="h-8 w-8 rounded-lg object-cover" />
          ) : (
            <div className="h-8 w-8 rounded-lg bg-[image:var(--gradient-hero)] flex items-center justify-center text-white">
              <UserIcon className="h-4 w-4" />
            </div>
          )}
        </Link>
      )}
    </div>
  );
}
