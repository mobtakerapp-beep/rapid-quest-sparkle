import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const EMOJIS = ["👍", "❤️", "🎉", "🔥", "👏", "🤩"];

export function Reactions({ targetType, targetId, uid }: { targetType: string; targetId: string; uid: string | null }) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [mine, setMine] = useState<Set<string>>(new Set());

  const load = async () => {
    const { data } = await supabase.from("reactions").select("emoji, user_id")
      .eq("target_type", targetType).eq("target_id", targetId);
    const c: Record<string, number> = {}; const m = new Set<string>();
    (data || []).forEach((r: any) => {
      c[r.emoji] = (c[r.emoji] || 0) + 1;
      if (r.user_id === uid) m.add(r.emoji);
    });
    setCounts(c); setMine(m);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [targetId, uid]);

  const toggle = async (emoji: string) => {
    if (!uid) return;
    if (mine.has(emoji)) {
      await supabase.from("reactions").delete()
        .eq("target_type", targetType).eq("target_id", targetId).eq("user_id", uid).eq("emoji", emoji);
    } else {
      await supabase.from("reactions").insert({ target_type: targetType, target_id: targetId, user_id: uid, emoji });
    }
    load();
  };

  return (
    <div className="flex flex-wrap gap-1 mt-2">
      {EMOJIS.map((e) => {
        const active = mine.has(e);
        const n = counts[e] || 0;
        return (
          <button key={e} onClick={() => toggle(e)}
            className={`text-xs px-2 py-1 rounded-full transition ${active ? "bg-[var(--brand)]/15 ring-1 ring-[var(--brand)]" : "bg-secondary hover:bg-secondary/80"}`}>
            <span className="text-base leading-none">{e}</span>{n > 0 && <span className="mr-1 font-bold">{n}</span>}
          </button>
        );
      })}
    </div>
  );
}
