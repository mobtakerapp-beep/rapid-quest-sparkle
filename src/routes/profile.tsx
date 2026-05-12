import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, User as UserIcon, GraduationCap, BookOpen, Heart, LogOut, Shield, Key, Camera, Palette } from "lucide-react";
import { FullPageLoader } from "@/components/LoadingSpinner";
import { playLogoutSound } from "@/lib/sounds";
import { roleLabelFor, adminBadgeFor } from "@/lib/greeting";
import { getCountryFlag } from "@/lib/countryFlag";
// MyCertificates and MyBadges now live on the /badges page

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

type RoleType = "teacher" | "student" | "parent" | "supervisor" | "";

function ProfilePage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uid, setUid] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [roleType, setRoleType] = useState<RoleType>("");
  const [grade, setGrade] = useState("");
  
  const [bio, setBio] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCode, setAdminCode] = useState("");
  const [claiming, setClaiming] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState("default");
  const [country, setCountry] = useState("سلطنة عُمان");
  const [school, setSchool] = useState("");
  const [gender, setGender] = useState<"male" | "female" | "">("");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [classCodeInput, setClassCodeInput] = useState("");
  const [myTeacherName, setMyTeacherName] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { navigate({ to: "/login" }); return; }
      const id = data.session.user.id;
      setUid(id);
      const [{ data: p }, { data: roles }, { data: priv }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", id),
        supabase.from("profiles_private" as any).select("phone, grade").eq("user_id", id).maybeSingle(),
      ]);
      if (p) {
        setDisplayName(p.display_name || "");
        setRoleType((p.role_type as RoleType) || "");
        setGrade(((priv as any)?.grade) || "");
        
        setBio(p.bio || "");
        setAvatarUrl(p.avatar_url || null);
        setTheme((p as any).theme || "default");
        setCountry((p as any).country || "سلطنة عُمان");
        setSchool((p as any).school || "");
        setGender(((p as any).gender as "male" | "female") || "");
      }
      setIsAdmin(!!roles?.some((r) => r.role === "admin"));
      // Load teacher info
      const tid = (p as any)?.teacher_id;
      if (tid) {
        const { data: t } = await supabase.from("profiles").select("display_name").eq("id", tid).maybeSingle();
        setMyTeacherName(t?.display_name || "—");
      }
      setLoading(false);
    });
  }, [navigate]);

  // Apply theme globally + persist for cross-page
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    if (typeof window !== "undefined") {
      localStorage.setItem("user_theme", theme);
      window.dispatchEvent(new CustomEvent("theme-change", { detail: theme }));
    }
  }, [theme]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !roleType) { toast.error("اختر نوع الحساب"); return; }
    // الرتبة مقفولة: لا يمكن للمستخدم اختيار "معلم" أو "مشرف" من القائمة.
    // الرتبة المسموحة من واجهة المستخدم هي student أو parent فقط.
    // أي رتبة أعلى تُمنح حصرياً عبر دالة claim_teacher_role بكود سري.
    const safeRole: "student" | "parent" =
      roleType === "student" || roleType === "parent" ? roleType : "student";
    setSaving(true);
    const { error } = await supabase.from("profiles").upsert({
      id: uid,
      display_name: displayName.trim(),
      // اذا كان المستخدم معلم/مشرف بالفعل (مفعل بالكود) لا نعدل role_type
      ...(roleType === "teacher" || roleType === "supervisor"
        ? {}
        : { role_type: safeRole }),
      bio: bio.trim() || null,
      avatar_url: avatarUrl,
      theme,
      country: country.trim() || null,
      school: roleType === "teacher" ? (school.trim() || null) : null,
      gender: gender || null,
    } as any, { onConflict: "id" });
    if (!error) {
      // الفصل/الشعبة فقط في جدول البيانات الخاصة
      await supabase.from("profiles_private" as any).upsert({
        user_id: uid,
        grade: grade.trim() || null,
      }, { onConflict: "user_id" });
    }
    setSaving(false);
    if (error) { toast.error("فشل الحفظ: " + error.message); return; }
    toast.success("تم حفظ بياناتك ✨");
  };

  const claimAccessCode = async () => {
    const code = adminCode.trim();
    if (!code) return;
    setClaiming(true);
    const attempts = [
      { fn: "claim_admin_role", success: "تم تفعيل صلاحيات المشرف العام 🛡️", newRole: "supervisor" as const, apply: () => { setIsAdmin(true); setRoleType("supervisor"); } },
      { fn: "claim_supervisor_role", success: "تم تفعيل صلاحيات المشرف 🛡️", newRole: "supervisor" as const, apply: () => setRoleType("supervisor") },
      { fn: "claim_teacher_role", success: "تم تفعيل حساب المعلم 📘", newRole: "teacher" as const, apply: () => setRoleType("teacher") },
    ];
    for (const attempt of attempts) {
      const { data } = await supabase.rpc(attempt.fn as any, { _code: code });
      if (data) {
        attempt.apply();
        if (uid) await supabase.from("profiles").update({ role_type: attempt.newRole }).eq("id", uid);
        toast.success(attempt.success);
        setAdminCode("");
        setClaiming(false);
        setTimeout(() => window.location.reload(), 1200);
        return;
      }
    }
    setClaiming(false);
    toast.error("الكود غير صحيح");
  };

  const joinClass = async () => {
    if (!classCodeInput.trim()) { toast.error("اكتبي كود الفصل"); return; }
    setJoining(true);
    const { data, error } = await supabase.rpc("join_teacher_by_code", { _code: classCodeInput.trim() });
    setJoining(false);
    if (error || !data) { toast.error("الكود غير صحيح"); return; }
    toast.success("تم الانضمام لفصل المعلم 🎉");
    setClassCodeInput("");
    // refresh teacher name
    const { data: prof } = await supabase.from("profiles").select("teacher_id").eq("id", uid!).maybeSingle();
    const tid = (prof as any)?.teacher_id;
    if (tid) {
      const { data: t } = await supabase.from("profiles").select("display_name").eq("id", tid).maybeSingle();
      setMyTeacherName(t?.display_name || "—");
    }
  };

  const onAvatar = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !uid) return;
    if (file.size > 3 * 1024 * 1024) { toast.error("الصورة كبيرة (3 ميجا حد أقصى)"); return; }
    setUploadingAvatar(true);
    try {
      const ext = file.name.split(".").pop();
      const path = `${uid}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("avatars").upload(path, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      setAvatarUrl(pub.publicUrl);
      await supabase.from("profiles").upsert({ id: uid, avatar_url: pub.publicUrl }, { onConflict: "id" });
      toast.success("تم تحديث الصورة ✨");
    } catch (err: any) {
      toast.error(err.message || "فشل الرفع");
    } finally { setUploadingAvatar(false); }
  };

  const themes = [
    { v: "default", label: "الافتراضي", grad: "from-violet-500 to-pink-500" },
    { v: "ocean", label: "محيط", grad: "from-cyan-500 to-blue-600" },
    { v: "sunset", label: "غروب", grad: "from-amber-500 to-rose-500" },
    { v: "forest", label: "غابة", grad: "from-emerald-500 to-green-700" },
    { v: "candy", label: "حلوى", grad: "from-pink-400 to-purple-500" },
    { v: "midnight", label: "ليل", grad: "from-slate-700 to-indigo-900" },
    { v: "rose", label: "وردي", grad: "from-rose-400 to-pink-600" },
    { v: "emerald", label: "زمردي", grad: "from-emerald-400 to-teal-600" },
    { v: "gold", label: "ذهبي", grad: "from-amber-400 to-yellow-600" },
  ];

  if (loading) return <FullPageLoader />;

  // الرتب القابلة للاختيار من المستخدم: طالب أو ولي أمر فقط.
  // المعلم والمشرف يُفعَّلان حصرياً عبر الكود السري في الأسفل.
  const roles = [
    { v: "student" as const, label: "طالب", icon: GraduationCap, color: "from-emerald-500 to-teal-500" },
    { v: "parent" as const, label: "ولي أمر", icon: Heart, color: "from-pink-500 to-rose-500" },
  ];
  const isElevated = roleType === "teacher" || roleType === "supervisor" || isAdmin;

  return (
    <div dir="rtl" className="min-h-screen bg-background p-4 relative overflow-hidden">
      <div className="absolute -top-40 -right-40 h-96 w-96 rounded-full bg-[var(--brand)] opacity-20 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-[var(--brand-2)] opacity-20 blur-3xl pointer-events-none" />

      <div className="relative max-w-2xl mx-auto pt-16 sm:pt-12">
        <div className="flex items-center justify-between mb-4">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> العودة للرئيسية
          </Link>
          <button type="button" onClick={async () => { playLogoutSound(); await new Promise(r => setTimeout(r, 350)); await supabase.auth.signOut(); navigate({ to: "/" }); }}
            className="inline-flex items-center gap-2 text-sm text-destructive hover:opacity-80">
            <LogOut className="h-4 w-4" /> تسجيل خروج
          </button>
        </div>

        {displayName && roleType && (
          <div className="mb-4 rounded-2xl bg-[image:var(--gradient-hero)] text-white p-4 text-center shadow-[var(--shadow-soft)]">
            <div className="text-sm opacity-90">مرحباً بك 👋</div>
            <div className="text-xl font-black mt-1 flex items-center justify-center gap-2 flex-wrap">
              <span>{roleLabelFor(roleType, gender)} {displayName}</span>
              {isAdmin && <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20">{adminBadgeFor(gender)}</span>}
            </div>
          </div>
        )}

        {/* Certificates and Badges moved to /badges page */}
        <Link to="/badges" className="block mb-6 mt-4 rounded-2xl bg-[image:var(--gradient-warm)] text-white p-4 text-center font-bold shadow-[var(--shadow-soft)] hover:scale-[1.02] transition">
          🏆 شاراتي وإنجازاتي وشهاداتي ←
        </Link>

        {/* 3) Themes / Settings — تحت الشهادات والشارات */}
        <div className="bg-card rounded-3xl border border-border p-6 shadow-[var(--shadow-card)] mt-6 mb-4">
          <label className="text-sm font-semibold mb-3 flex items-center gap-1.5"><Palette className="h-4 w-4" /> السمات (الثيم المفضل)</label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {themes.map((t) => (
              <button type="button" key={t.v} onClick={() => setTheme(t.v)}
                className={`p-2 rounded-xl border-2 transition ${theme === t.v ? "border-[var(--brand)]" : "border-border"}`}>
                <div className={`h-10 rounded-lg bg-gradient-to-br ${t.grad}`} />
                <div className="text-[11px] font-semibold mt-1">{t.label}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 4) Data form */}
        <div className="bg-card rounded-3xl border border-border shadow-[var(--shadow-card)] p-6 md:p-8 mt-6">
          <div className="flex items-center gap-3 mb-6">
            <label className="relative h-16 w-16 rounded-2xl overflow-hidden cursor-pointer group flex items-center justify-center bg-[image:var(--gradient-hero)] text-white">
              {avatarUrl ? <img src={avatarUrl} alt="avatar" className="h-full w-full object-cover" /> : <UserIcon className="h-7 w-7" />}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                <Camera className="h-5 w-5 text-white" />
              </div>
              <input type="file" accept="image/*" onChange={onAvatar} className="hidden" disabled={uploadingAvatar} />
            </label>
            <div className="flex-1">
              <h1 className="text-2xl font-black">بياناتي</h1>
              <p className="text-sm text-muted-foreground">{uploadingAvatar ? "جاري رفع الصورة..." : "اضغط الصورة لتغييرها"}</p>
            </div>
            {isAdmin && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-amber-100 text-amber-700">
                <Shield className="h-3 w-3" /> أدمن
              </span>
            )}
          </div>

          <form onSubmit={save} className="space-y-5">
            <div>
              <label className="text-sm font-semibold mb-2 block flex items-center gap-1.5">
                <Shield className="h-3.5 w-3.5" /> نوع الحساب *
              </label>
              {isElevated ? (
                <div className="p-4 rounded-2xl border-2 border-[var(--brand)] bg-[var(--brand)]/5 flex items-center gap-3">
                  <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white">
                    {isAdmin ? <Shield className="h-5 w-5" /> : <BookOpen className="h-5 w-5" />}
                  </div>
                  <div className="flex-1">
                    <div className="font-bold text-sm">
                      {isAdmin ? "أدمن" : roleType === "supervisor" ? "مشرف" : "معلم"}
                    </div>
                    <div className="text-[11px] text-muted-foreground">مفعّل بالكود السري — لا يمكن التغيير</div>
                  </div>
                  <Key className="h-4 w-4 text-muted-foreground" />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    {roles.map((r) => (
                      <button type="button" key={r.v} onClick={() => setRoleType(r.v)}
                        className={`p-4 rounded-2xl border-2 transition flex flex-col items-center gap-2 ${
                          roleType === r.v ? "border-[var(--brand)] bg-[var(--brand)]/5" : "border-border hover:border-[var(--brand)]/50"
                        }`}>
                        <div className={`h-10 w-10 rounded-xl bg-gradient-to-br ${r.color} flex items-center justify-center text-white`}>
                          <r.icon className="h-5 w-5" />
                        </div>
                        <span className="font-bold text-sm">{r.label}</span>
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2">
                    🔒 لتفعيل حساب معلم أو مشرف استخدم الكود السري في الأسفل.
                  </p>
                </>
              )}
            </div>

            <div>
              <label className="text-sm font-semibold mb-2 block">الجنس *</label>
              <div className="grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setGender("male")}
                  className={`p-3 rounded-2xl border-2 transition font-bold ${gender === "male" ? "border-[var(--brand)] bg-[var(--brand)]/5" : "border-border"}`}>
                  ذكر 👦
                </button>
                <button type="button" onClick={() => setGender("female")}
                  className={`p-3 rounded-2xl border-2 transition font-bold ${gender === "female" ? "border-[var(--brand)] bg-[var(--brand)]/5" : "border-border"}`}>
                  أنثى 👧
                </button>
              </div>
            </div>

            <div>
              <label className="text-sm font-semibold mb-2 block">الاسم الكامل *</label>
              <input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background" />
            </div>

            <div>
              <label className="text-sm font-semibold mb-2 block">الدولة</label>
              <div className="relative">
                <input value={country} onChange={(e) => setCountry(e.target.value)} maxLength={60}
                  placeholder="سلطنة عُمان"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background" />
                {country && getCountryFlag(country) && (
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xl pointer-events-none">{getCountryFlag(country)}</span>
                )}
              </div>
            </div>

            {roleType === "teacher" && (
              <div>
                <label className="text-sm font-semibold mb-2 block">المدرسة</label>
                <input value={school} onChange={(e) => setSchool(e.target.value)} maxLength={120}
                  placeholder="اسم المدرسة"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background" />
              </div>
            )}

            {roleType === "student" && (
              <div>
                <label className="text-sm font-semibold mb-2 block">الفصل / الشعبة</label>
                <input value={grade} onChange={(e) => setGrade(e.target.value)} placeholder="مثال: 5/أ"
                  className="w-full px-4 py-3 rounded-xl border border-border bg-background" />
              </div>
            )}

            {roleType === "student" && (
              <div className="rounded-2xl border border-dashed border-border p-4 bg-secondary/30">
                <label className="text-sm font-semibold mb-1 block">الانضمام إلى فصل معلم</label>
                {myTeacherName ? (
                  <p className="text-xs text-emerald-600 font-bold mb-2">✓ معلمك الحالي: {myTeacherName}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mb-2">اطلبي من معلمك كود الفصل (6 أحرف) وأدخليه هنا</p>
                )}
                <div className="flex gap-2">
                  <input value={classCodeInput} onChange={(e) => setClassCodeInput(e.target.value.toUpperCase())}
                    placeholder="ABC123" maxLength={6}
                    className="flex-1 px-3 py-2 rounded-xl border border-border bg-background tracking-widest font-bold uppercase" />
                  <button type="button" onClick={joinClass} disabled={joining}
                    className="px-4 py-2 rounded-xl bg-[var(--brand)] text-white font-bold disabled:opacity-50">
                    {joining ? "..." : myTeacherName ? "تغيير" : "انضمام"}
                  </button>
                </div>
              </div>
            )}


            <div>
              <label className="text-sm font-semibold mb-2 block">نبذة قصيرة</label>
              <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={200} rows={3}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background resize-none" />
            </div>

            <button type="submit" disabled={saving}
              className="w-full px-4 py-3 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold shadow-[var(--shadow-soft)] hover:scale-[1.02] transition disabled:opacity-50">
              {saving ? "جاري الحفظ..." : "حفظ البيانات"}
            </button>
          </form>

          {/* Unified code: tries admin, supervisor, then teacher automatically */}
          <div className="mt-6 pt-6 border-t border-border space-y-2">
            <div className="flex items-center gap-2 mb-1">
              {isAdmin && <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">✅ أدمن</span>}
              {roleType === "teacher" && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">✅ معلم</span>}
              {roleType === "supervisor" && !isAdmin && <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✅ مشرف</span>}
            </div>
            <label className="text-sm font-semibold flex items-center gap-1.5">
              <Key className="h-3.5 w-3.5" /> كود التفعيل (أدمن / مشرف / معلم)
            </label>
            <p className="text-xs text-muted-foreground">أدخلي الكود وسيتم تفعيل الصلاحية المناسبة تلقائياً.</p>
            <div className="flex gap-2">
              <input
                type="password"
                value={adminCode}
                onChange={(e) => setAdminCode(e.target.value)}
                placeholder="أدخل الكود السري"
                className="flex-1 px-4 py-2.5 rounded-xl border border-border bg-background"
              />
              <button
                type="button"
                disabled={claiming || !adminCode.trim()}
                onClick={claimAccessCode}
                className="px-5 py-2.5 rounded-xl bg-[image:var(--gradient-hero)] text-white font-bold disabled:opacity-50"
              >
                {claiming ? "..." : "تفعيل"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
