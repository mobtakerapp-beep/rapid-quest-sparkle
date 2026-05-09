import { Flag } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function ReportButton({
  targetKind,
  targetId,
  content,
  className = "",
  label = "تبليغ",
}: {
  targetKind: string;
  targetId: string;
  content?: string | null;
  className?: string;
  label?: string;
}) {
  const report = async () => {
    const reason = prompt("سبب التبليغ عن المحتوى:");
    if (!reason || !reason.trim()) return;
    const { data: sess } = await supabase.auth.getSession();
    const uid = sess.session?.user.id;
    if (!uid) return toast.error("سجّلي الدخول أولاً");
    const { error } = await supabase.from("reports").insert({
      user_id: uid,
      reason: reason.trim(),
      content: content || null,
      target_kind: targetKind,
      target_id: targetId,
    } as any);
    if (error) return toast.error("تعذّر التبليغ: " + error.message);
    toast.success("تم إرسال التبليغ للمشرفين 🚨");
  };
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); report(); }}
      title={label}
      className={`inline-flex items-center gap-1 text-xs text-amber-600 hover:text-amber-700 ${className}`}
    >
      <Flag className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
