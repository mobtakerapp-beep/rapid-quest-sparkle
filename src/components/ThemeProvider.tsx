import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export function ThemeProvider() {
  useEffect(() => {
    const apply = (t?: string | null) => {
      document.documentElement.dataset.theme = t || "default";
    };
    // local cached theme for instant apply
    const cached = typeof window !== "undefined" ? localStorage.getItem("user_theme") : null;
    apply(cached);

    const load = async (uid: string) => {
      const { data } = await supabase.from("profiles").select("theme").eq("id", uid).maybeSingle();
      const t = (data as any)?.theme || "default";
      localStorage.setItem("user_theme", t);
      apply(t);
    };

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user.id) load(data.session.user.id);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user.id) load(session.user.id);
      else { localStorage.removeItem("user_theme"); apply("default"); }
    });

    // listen for in-tab theme changes
    const onCustom = (e: Event) => {
      const t = (e as CustomEvent).detail as string;
      apply(t);
    };
    window.addEventListener("theme-change", onCustom);

    return () => { sub.subscription.unsubscribe(); window.removeEventListener("theme-change", onCustom); };
  }, []);
  return null;
}
