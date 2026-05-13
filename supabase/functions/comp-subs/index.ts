import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  try {
    const { competition_id } = await req.json();
    if (!competition_id) {
      return new Response(JSON.stringify({ error: "competition_id required" }), {
        status: 400, headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Admin client bypasses RLS — safe because this only reads non-sensitive submission data
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: subs, error } = await admin
      .from("competition_submissions")
      .select("id, user_id, is_correct, correct_count, question_count, time_taken_seconds, submitted_at, answer, image_url, link_url")
      .eq("competition_id", competition_id);

    if (error) throw error;

    const ids = (subs || []).map((s: any) => s.user_id);
    const { data: profiles } = ids.length
      ? await admin.from("profiles").select("id, display_name, avatar_url").in("id", ids)
      : { data: [] };

    const nameMap: Record<string, { name: string; avatar: string | null }> = {};
    (profiles || []).forEach((p: any) => {
      nameMap[p.id] = { name: p.display_name || "—", avatar: p.avatar_url };
    });

    const enriched = (subs || []).map((s: any) => ({
      ...s,
      name: nameMap[s.user_id]?.name ?? "—",
      avatar_url: nameMap[s.user_id]?.avatar ?? null,
    }));

    return new Response(JSON.stringify({ data: enriched }), {
      status: 200,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
