import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Mail, Lock, Shield, ArrowRight, KeyRound, X } from "lucide-react";
import logo from "@/assets/original-logo-reference.jpg";
import { playLoginSound } from "@/lib/sounds";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [adminCode, setAdminCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [rememberEmail, setRememberEmail] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("remembered-email");
    if (saved) {
      setEmail(saved);
      setRememberEmail(true);
    }
  }, []);

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

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) { toast.error("أدخل بريدك الإلكتروني أولاً"); return; }
    setLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
        redirectTo: `${window.location.origin}/login`,
      });
      if (error) throw error;
      toast.success("تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني");
      setMode("signin");
    } catch (err: any) {
      toast.error(err.message || "حدث خطأ");
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();

      if (rememberEmail) {
        localStorage.setItem("remembered-email", normalizedEmail);
      } else {
        localStorage.removeItem("remembered-email");
      }

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
          <h1 className="text-2xl font-black">
            {mode === "signin" ? "تسجيل الدخول" : mode === "signup" ? "إنشاء حساب" : "نسيت كلمة المرور"}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {mode === "forgot" ? "سنرسل لك رابط إعادة التعيين على بريدك" : "انضم لمجتمع كلنا معك"}
          </p>
        </div>

        {mode === "forgot" ? (
          <form onSubmit={handleForgotPassword} className="space-y-3">
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
            <button
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold shadow-[var(--shadow-soft)] hover:scale-[1.02] transition disabled:opacity-50"
            >
              {loading ? "جاري الإرسال..." : "إرسال رابط إعادة التعيين"}
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setMode("signin")}
              className="w-full text-center text-sm text-muted-foreground hover:text-foreground flex items-center justify-center gap-1"
            >
              <X className="h-3.5 w-3.5" /> إلغاء
            </button>
          </form>
        ) : (
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

            {mode === "signin" && (
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberEmail}
                    onChange={(e) => setRememberEmail(e.target.checked)}
                    className="rounded"
                  />
                  تذكر بريدي الإلكتروني
                </label>
                <button
                  type="button"
                  onClick={() => setMode("forgot")}
                  className="text-sm text-[var(--brand)] hover:underline"
                >
                  نسيت كلمة المرور؟
                </button>
              </div>
            )}

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
        )}

        {mode !== "forgot" && (
          <p className="text-center text-sm text-muted-foreground mt-4">
            {mode === "signin" ? "ليس لديك حساب؟" : "لديك حساب؟"}{" "}
            <button
              onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
              className="text-[var(--brand)] font-semibold hover:underline"
            >
              {mode === "signin" ? "إنشاء حساب" : "تسجيل الدخول"}
            </button>
          </p>
        )}
      </div>
    </div>
  );
}
