import { supabase } from "@/integrations/supabase/client";

export type WinnerTitle = "speed" | "gallery";

export const WINNER_LABELS: Record<WinnerTitle, { label: string; icon: string; cls: string }> = {
  speed: { label: "بطل السرعة", icon: "⚡", cls: "bg-yellow-100 text-yellow-700" },
  gallery: { label: "نجم المعرض", icon: "🌟", cls: "bg-purple-100 text-purple-700" },
};

export async function fetchWinnerTitles(userIds: string[]): Promise<Record<string, WinnerTitle>> {
  if (!userIds.length) return {};
  const result: Record<string, WinnerTitle> = {};
  const now = new Date().toISOString();

  try {
    const [
      { data: endedComps },
      { data: endedGallery },
    ] = await Promise.all([
      supabase.from("competitions").select("id").lt("ends_at", now).limit(20),
      supabase.from("gallery_contests").select("id").lt("ends_at", now).limit(20),
    ]);

    const compIds = (endedComps || []).map((c: any) => c.id);
    const galleryIds = (endedGallery || []).map((g: any) => g.id);

    const [compSubsRes, galleryEntriesRes] = await Promise.all([
      compIds.length
        ? supabase.from("competition_submissions")
            .select("user_id, competition_id, time_taken_seconds, is_correct, correct_count, question_count")
            .in("competition_id", compIds)
            .in("user_id", userIds)
        : Promise.resolve({ data: [] }),
      galleryIds.length
        ? supabase.from("gallery_contest_entries")
            .select("id, user_id, contest_id")
            .in("contest_id", galleryIds)
        : Promise.resolve({ data: [] }),
    ]);

    const compSubs: any[] = (compSubsRes as any).data || [];
    const galleryEntries: any[] = (galleryEntriesRes as any).data || [];

    if (compIds.length && compSubs.length) {
      const allSubsRes = await supabase
        .from("competition_submissions")
        .select("user_id, competition_id, time_taken_seconds, is_correct, correct_count, question_count")
        .in("competition_id", compIds);
      const allSubs: any[] = (allSubsRes as any).data || [];

      for (const cid of compIds) {
        const subsForComp = allSubs
          .filter((s: any) => s.competition_id === cid)
          .sort((a: any, b: any) => {
            const ac = a.correct_count ?? (a.is_correct ? 1 : 0);
            const bc = b.correct_count ?? (b.is_correct ? 1 : 0);
            return bc - ac || a.time_taken_seconds - b.time_taken_seconds;
          });
        const winner = subsForComp[0];
        if (winner && userIds.includes(winner.user_id)) {
          const hasCorrect = winner.question_count ? (winner.correct_count ?? 0) > 0 : !!winner.is_correct;
          if (hasCorrect) result[winner.user_id] = "speed";
        }
      }
    }

    if (galleryIds.length && galleryEntries.length) {
      const entryIds = galleryEntries.map((e: any) => e.id);
      const { data: votes } = await supabase
        .from("gallery_contest_votes")
        .select("entry_id")
        .in("entry_id", entryIds);
      const voteCount: Record<string, number> = {};
      (votes || []).forEach((v: any) => { voteCount[v.entry_id] = (voteCount[v.entry_id] || 0) + 1; });

      for (const gid of galleryIds) {
        const entries = galleryEntries.filter((e: any) => e.contest_id === gid);
        if (!entries.length) continue;
        let best = entries[0]; let bestV = voteCount[entries[0].id] || 0;
        for (const e of entries) {
          const v = voteCount[e.id] || 0;
          if (v > bestV) { best = e; bestV = v; }
        }
        if (bestV > 0 && userIds.includes(best.user_id)) {
          result[best.user_id] = "gallery";
        }
      }
    }
  } catch {}

  return result;
}

export async function fetchMyWinnerTitle(userId: string): Promise<WinnerTitle | null> {
  const titles = await fetchWinnerTitles([userId]);
  return titles[userId] ?? null;
}
