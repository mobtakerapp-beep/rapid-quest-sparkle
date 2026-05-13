import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Shield, MessageSquare } from "lucide-react";

export const Route = createFileRoute("/supervisors")({
  component: SupervisorsPage,
});

type Sup = { id: string; display_name: string | null; avatar_url: string | null; role: string };

function SupervisorsPage() {
  const navigate = useNavigate();
  const [list, setList] = useState<Sup[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.rpc("list_supervisors" as any);
      setList((data || []) as Sup[]);
      setLoading(false);
    })();
  }, []);

  const roleLabel = (r: string) => r === "admin" ? "أدمن" : r === "supervisor" ? "مشرف" : r;

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-amber-500 to-rose-500 flex items-center justify-center text-white">
              <Shield className="h-5 w-5" />
            </div>
            <h1 className="font-bold">المشرفون والإدارة</h1>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 max-w-3xl">
        <p className="text-sm text-muted-foreground mb-4">
          هؤلاء هم المشرفون والإدارة الذين يمكنك التواصل معهم لتقديم شكوى أو طلب مساعدة.
        </p>
        {loading ? (
          <div className="text-center text-muted-foreground py-12">جاري التحميل...</div>
        ) : list.length === 0 ? (
          <div className="text-center text-muted-foreground py-12">لا يوجد مشرفون مسجَّلون بعد.</div>
        ) : (
          <ul className="grid gap-3">
            {list.map((s) => (
              <li key={s.id} className="bg-card border border-border rounded-2xl p-4 flex items-center gap-3">
                <div className="h-12 w-12 rounded-full overflow-hidden bg-[image:var(--gradient-warm)] flex items-center justify-center text-white font-bold">
                  {s.avatar_url
                    ? <img src={s.avatar_url} alt="" className="h-full w-full object-cover" />
                    : (s.display_name || "؟").charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{s.display_name || "بدون اسم"}</div>
                  <div className="text-xs">
                    <span className={`px-2 py-0.5 rounded-full ${s.role === "admin" ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {roleLabel(s.role)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => navigate({ to: "/messages", search: { with: s.id } })}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[image:var(--gradient-hero)] text-white text-sm font-bold"
                >
                  <MessageSquare className="h-4 w-4" /> مراسلة
                </button>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
