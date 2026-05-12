import { createContext, useContext, useEffect, useState } from "react";

type Lang = "ar" | "en";

interface LangCtx {
  lang: Lang;
  toggle: () => void;
  isAr: boolean;
}

const Ctx = createContext<LangCtx>({ lang: "ar", toggle: () => {}, isAr: true });

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("app-lang") as Lang | null;
    return saved === "en" ? "en" : "ar";
  });

  useEffect(() => {
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    localStorage.setItem("app-lang", lang);
  }, [lang]);

  const toggle = () => setLang((p) => (p === "ar" ? "en" : "ar"));

  return <Ctx.Provider value={{ lang, toggle, isAr: lang === "ar" }}>{children}</Ctx.Provider>;
}

export function useLang() {
  return useContext(Ctx);
}
