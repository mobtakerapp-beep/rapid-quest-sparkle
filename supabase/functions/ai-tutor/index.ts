import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM = "أنت مساعد رياضيات ذكي وودود لطلاب الصف الخامس في سلطنة عمان (مبادرة كلنا معاً - محافظة الوسطى). متخصص في كل فروع الرياضيات: الكسور، الجذور، الأعداد العشرية، الهندسة، القياس، الإحصاء، الجبر البسيط، حل المسائل اللفظية. اشرح بالعربية الفصحى السهلة دائماً، مع خطوات واضحة ومرقمة، وأمثلة من الحياة اليومية. استخدم الأرقام العربية (٠١٢٣٤٥٦٧٨٩). اكتب الكسور بصيغة [البسط/المقام] مثل [٢/٣]، والجذور بصيغة √(٩)=٣، والأس بصيغة س² أو س³. استخدم الرموز ÷ × ± ≥ ≤ ≠ π °. إن أرسل الطالب صورة لمسألة رياضية، اقرأها بدقة واشرحها خطوة بخطوة. كن مشجعاً وصبوراً واختم كل إجابة بسؤال يحفز الفهم.";

const DAILY_IMAGE_LIMIT = 2;
const WATERMARK_INSTRUCTION = " IMPORTANT: Add a small, elegant, semi-transparent white capital letter 'M' watermark in the bottom-right corner of the generated image with a subtle drop shadow.";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { messages, mode } = await req.json();
    const KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!KEY) throw new Error("LOVABLE_API_KEY not set");

    // ------- Auth check (applies to ALL modes) -------
    const authHeader = req.headers.get("Authorization") || "";
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await sb.auth.getUser(token);
    const uid = userData?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "يجب تسجيل الدخول" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ------- Image generation mode -------
    if (mode === "image") {
      const since = new Date(); since.setHours(0, 0, 0, 0);
      const { count } = await sb.from("ai_image_usage").select("*", { count: "exact", head: true })
        .eq("user_id", uid).gte("created_at", since.toISOString());
      if ((count || 0) >= DAILY_IMAGE_LIMIT) {
        return new Response(JSON.stringify({ error: `وصلت الحد اليومي (${DAILY_IMAGE_LIMIT} صور). جرّب غداً 🌙` }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const last = messages?.[messages.length - 1];
      const userPrompt = typeof last?.content === "string" ? last.content : "صورة تعليمية للرياضيات";
      const prompt = userPrompt + WATERMARK_INSTRUCTION;
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-image",
          messages: [{ role: "user", content: prompt }],
          modalities: ["image", "text"],
        }),
      });
      if (r.status === 429) return new Response(JSON.stringify({ error: "تجاوزنا الحد، حاول بعد قليل" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (r.status === 402) return new Response(JSON.stringify({ error: "نفد الرصيد" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const data = await r.json();
      const imageUrl = data.choices?.[0]?.message?.images?.[0]?.image_url?.url;
      const text = data.choices?.[0]?.message?.content || "تم إنشاء الصورة 🎨";
      if (imageUrl) {
        await sb.from("ai_image_usage").insert({ user_id: uid });
      }
      const remaining = Math.max(0, DAILY_IMAGE_LIMIT - ((count || 0) + 1));
      return new Response(JSON.stringify({ imageUrl, text, remaining }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ------- Text/vision mode (streaming) -------
    const normalised = (messages || []).map((m: any) => {
      if (m.imageUrl) {
        return {
          role: m.role,
          content: [
            { type: "text", text: m.content || "حلّل هذه المسألة الرياضية." },
            { type: "image_url", image_url: { url: m.imageUrl } },
          ],
        };
      }
      return { role: m.role, content: m.content };
    });

    const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [{ role: "system", content: SYSTEM }, ...normalised],
        stream: true,
      }),
    });
    if (r.status === 429) return new Response(JSON.stringify({ error: "تجاوزنا الحد، حاول بعد قليل" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "نفد الرصيد" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (!r.ok) return new Response(JSON.stringify({ error: "AI error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(r.body, { headers: { ...corsHeaders, "Content-Type": "text/event-stream" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
