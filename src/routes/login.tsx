import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";
import { Mail, Lock, Shield, ArrowRight, KeyRound } from "lucide-react";
import logo from "@/assets/original-logo-reference.jpg";
import { playLoginSound } from "@/lib/sounds";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [loading, setLoading] = useState(false);

  const claimAccessCode = async (code: string) => {
    const trimmed = code.trim();
    if (!trimmed) return;
    const attempts = [
      { fn: "claim_admin_role", success: "تم تفعيل صلاحيات الأدمن — سيظهر حسابك كأدمن" },
      { fn: "claim_supervisor_role", success: "تم تفعيل صلاحيات المشرف" },
      { fn: "claim_teacher_role", success: "تم تفعيل حساب المعلم" },
    ];
    for (const attempt of attempts) {
      const { data } = await supabase.rpc(attempt.fn as any, { _code: trimmed });
      if (data) {
        toast.success(attempt.success);
        setAdminCode("");
        return;
      }
    }
    toast.error("الكود غير صحيح");
    setAdminCode("");
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session) navigate({ to: "/" });
    });
    return () => sub.subscription.unsubscribe();
  }, [navigate]);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: normalizedEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name.trim() },
          },
        });
        if (error) throw error;
        if (adminCode && data.user) {
          // wait briefly for session, then claim the matching role
          setTimeout(async () => {
            await claimAccessCode(adminCode);
          }, 800);
        }
        toast.success("تم إنشاء الحساب! تحقق من بريدك إن طُلب.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
        if (error) throw error;
        if (adminCode) await claimAccessCode(adminCode);
        toast.success("مرحباً بعودتك!");
      }
      playLoginSound();
      navigate({ to: "/" });
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: window.location.origin,
      });
      if ((result as any)?.error) {
        throw (result as any).error;
      }
    } catch (err: any) {
      toast.error(err?.message || "تعذر الدخول عبر Google");
      setLoading(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen flex items-center justify-center p-4 bg-background relative overflow-hidden">
      <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-[var(--brand)] opacity-20 blur-3xl" />
      <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-[var(--brand-2)] opacity-20 blur-3xl" />

      <div className="relative w-full max-w-md bg-card rounded-3xl shadow-[var(--shadow-soft)] border border-border p-8">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← العودة للرئيسية</Link>
        <div className="text-center mt-4 mb-8">
          <div className="h-16 w-16 mx-auto rounded-2xl flex items-center justify-center mb-4 shadow-[var(--shadow-soft)] ring-1 ring-border overflow-hidden">
            <img src={logo} alt="شعار مبادرة كلنا معاً" className="h-full w-full object-cover" width={64} height={64} />
          </div>
          <h1 className="text-2xl font-black">{mode === "signin" ? "تسجيل الدخول" : "إنشاء حساب"}</h1>
          <p className="text-sm text-muted-foreground mt-1">انضم لمجتمع كلنا معك</p>
        </div>

        <button
          type="button"
          onClick={handleGoogle}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-border bg-background hover:bg-muted transition disabled:opacity-50 mb-4"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.83z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.83C6.71 7.31 9.14 5.38 12 5.38z"/>
          </svg>
          <span className="font-semibold">الدخول عبر Google</span>
        </button>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground">أو</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <form onSubmit={handleAuth} className="space-y-3">
          {mode === "signup" && (
            <div className="relative">
              <input
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="الاسم"
                name="name"
                autoComplete="name"
                className="w-full pr-10 pl-4 py-3 rounded-xl border border-border bg-background"
              />
              <Shield className="absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
            </div>
          )}
          <div className="relative">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="البريد الإلكتروني"
              name="email"
              autoComplete="email"
              inputMode="email"
              autoCapitalize="none"
              dir="ltr"
              className="w-full pr-10 pl-4 py-3 rounded-xl border border-border bg-background"
            />
            <Mail className="absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
          </div>
          <div className="relative">
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="كلمة المرور"
              name="password"
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="w-full pr-10 pl-4 py-3 rounded-xl border border-border bg-background"
            />
            <Lock className="absolute right-3 top-3.5 h-4 w-4 text-muted-foreground" />
          </div>

          <details className="rounded-xl border border-dashed border-border p-3">
            <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-2">
              <KeyRound className="h-3.5 w-3.5" /> كود صلاحيات (اختياري)
            </summary>
            <input
              value={adminCode}
              onChange={(e) => setAdminCode(e.target.value)}
              placeholder="كود الأدمن / المشرف / المعلم"
              className="mt-2 w-full px-3 py-2 rounded-lg border border-border bg-background text-sm"
            />
          </details>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold shadow-[var(--shadow-soft)] hover:scale-[1.02] transition disabled:opacity-50"
          >
            {loading ? "جاري..." : mode === "signin" ? "دخول" : "إنشاء"}
            <ArrowRight className="h-4 w-4" />
          </button>
        </form>

        <p className="text-center text-sm text-muted-foreground mt-4">
          {mode === "signin" ? "ليس لديك حساب؟" : "لديك حساب؟"}{" "}
          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="text-[var(--brand)] font-semibold hover:underline"
          >
            {mode === "signin" ? "إنشاء حساب" : "تسجيل الدخول"}
          </button>
        </p>
      </div>
    </div>
  );
}
