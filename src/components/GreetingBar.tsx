import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { roleLabelFor, adminBadgeFor } from "@/lib/greeting";
import { getCountryFlag } from "@/lib/countryFlag";

export function GreetingBar() {
  const [name, setName] = useState<string | null>(null);
  const [roleType, setRoleType] = useState<string | null>(null);
  const [gender, setGender] = useState<string | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [uid, setUid] = useState<string | null>(null);

  useEffect(() => {
    try {
      const cached = localStorage.getItem("home-greeting-v2");
      if (cached) {
        const c = JSON.parse(cached);
        setName(c.display_name || null);
        setRoleType(c.role_type || null);
        setGender(c.gender || null);
        setCountry(c.country || null);
        setIsAdmin(!!c.isAdmin);
      }
    } catch {}

    const load = async (id: string) => {
      setUid(id);
      const [{ data: p }, { data: roles }] = await Promise.all([
        supabase.from("profiles").select("display_name, role_type, gender, country").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
      ]);
      if (!p) return;
      const rolesList = (roles || []).map((r: any) => String(r.role));
      const hasAdmin = rolesList.includes("admin");
      const hasSupervisor = rolesList.includes("supervisor");
      const hasTeacher = rolesList.includes("teacher");
      let effectiveRole = (p as any).role_type || null;
      if (hasAdmin) effectiveRole = "admin";
      else if (hasSupervisor) effectiveRole = "supervisor";
      else if (hasTeacher) effectiveRole = "teacher";
      setName((p as any).display_name || null);
      setRoleType(effectiveRole);
      setGender((p as any).gender || null);
      setCountry((p as any).country || null);
      setIsAdmin(hasAdmin);
    };

    supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (id) load(id);
      else { setName(null); setRoleType(null); setGender(null); setCountry(null); setIsAdmin(false); }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_, s) => {
      const id = s?.user.id;
      if (id) load(id);
      else { setUid(null); setName(null); setRoleType(null); setGender(null); setCountry(null); setIsAdmin(false); }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, []);

  if (!uid || !name) return null;

  const roleLabel = roleLabelFor(roleType, gender);

  const roleColor: Record<string, string> = {
    admin: "text-amber-600 dark:text-amber-400",
    supervisor: "text-violet-600 dark:text-violet-400",
    teacher: "text-emerald-600 dark:text-emerald-400",
    student: "text-sky-600 dark:text-sky-400",
    parent: "text-rose-600 dark:text-rose-400",
  };
  const nameColor = roleColor[roleType || ""] || "text-foreground";
  const flag = country ? getCountryFlag(country) : null;

  return (
    <div
      className="bg-card/95 backdrop-blur border-b border-border/60 py-1 px-4"
      dir="rtl"
    >
      <Link
        to="/profile"
        className="flex items-center justify-center gap-2 flex-wrap hover:opacity-80 transition"
      >
        <span className="text-xs text-muted-foreground">مرحباً 👋</span>
        <span
          className={`text-xs font-black truncate max-w-[200px] ${nameColor}`}
          style={{ fontFamily: "'Tajawal', 'Cairo', sans-serif" }}
        >
          {roleLabel ? `${roleLabel} ` : ""}
          {name}
        </span>
        {isAdmin && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-black">
            {adminBadgeFor(gender)}
          </span>
        )}
        {flag && country && (
          <span className="text-xs flex items-center gap-0.5 text-muted-foreground">
            <span>{flag}</span>
            <span className="hidden sm:inline">{country}</span>
          </span>
        )}
      </Link>
    </div>
  );
}
