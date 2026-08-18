// MEETCAP 광고 대시보드의 "+ 브랜드 제안" 기능 전용 프록시.
// 진짜 디스코드 웹훅 URL은 여기(서버 쪽 secret)에만 있고 브라우저에는 절대 노출되지 않는다.
export default {
  async fetch(request, env) {
    const allowOrigin = "https://song253.github.io";
    const corsHeaders = {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "invalid json" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const name = String(body && body.name ? body.name : "").trim().slice(0, 80);
    if (!name) {
      return new Response(JSON.stringify({ error: "name required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const discordRes = await fetch(env.DISCORD_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `🆕 **새 브랜드 제안**: ${name}\n대시보드 + 버튼으로 제안됨`,
        allowed_mentions: { parse: [] }, // @everyone 같은 핑 악용 방지
      }),
    });

    if (!discordRes.ok) {
      return new Response(JSON.stringify({ error: "failed to notify" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  },
};
