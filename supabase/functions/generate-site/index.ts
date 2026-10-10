// Edge function: turns a business brief (name, contact, call notes) into a complete,
// self-contained one-page HTML preview site, using whichever engine is saved in Settings.
// Same key-lookup and auth pattern as agent-chat (see that file's header comment), just a
// different system prompt and a much bigger output budget since a full page needs far more
// tokens than a short chat reply.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://YOUR-DOMAIN",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const BASE_URLS: Record<string, string> = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  cerebras: "https://api.cerebras.ai/v1",
};

function isSafeCustomUrl(u: string): boolean {
  let url: URL;
  try { url = new URL(u); } catch { return false; }
  if (url.protocol !== "https:") return false;
  const h = url.hostname.toLowerCase();
  if (h === "localhost" || h === "127.0.0.1" || h === "::1") return false;
  if (/^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[01])\./.test(h)) return false;
  return true;
}

const SYSTEM_PROMPT = `You write a single, complete, self-contained HTML document for a one-page preview website for a small local business. Your biggest failure mode is making every site look the same ("AI slop": centered hero, generic blue gradient, same rounded sans-serif, same three-card layout, same structure every time). Actively fight that. The brief you are given will usually start with a named design style direction. Follow it specifically and distinctly, visually and structurally, regardless of which style is requested.

Output ONLY raw HTML starting with <!DOCTYPE html>, nothing before or after it, no markdown code fences, no commentary.

Requirements:
- One complete file: <html><head> with <meta charset> and <meta name="viewport" content="width=device-width, initial-scale=1">, a <title>, and all CSS inline inside a single <style> tag. No external stylesheets, fonts, scripts, or images. Use only system/web-safe font stacks (e.g. Georgia, "Times New Roman", system-ui, "Segoe UI", Arial, ui-serif, ui-sans-serif). Build visual character from color, type scale, spacing, borders, shapes and gradients, not external images.
- Follow the given design style direction specifically: its palette, type pairing, layout rhythm and personality should all be visibly distinct from a generic template. The section structure, what comes first, how content is grouped, how bold or quiet the page feels, should fit that style too, not default to the same hero-then-three-cards-then-footer pattern every time.
- The page must still clearly communicate: who this business is, what they actually do (pull real specifics from the notes given, never invent facts not present in the notes), a genuine reason to trust or choose them, and a clear way to get in touch or take the next step, using only the exact contact info given (if none given, use a generic "Get in touch" call to action with no fabricated phone/email).
- Do not include any placeholder text like "Lorem ipsum" or "[Your text here]". Everything shown must come from, or be a reasonable professional restatement of, the brief given.
- No external JavaScript. A tiny inline <script> for something like a mobile nav toggle is fine if needed, but the page must look and work fine with it disabled.`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "POST only" });

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: user } = await supabase.auth.getUser();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (!user?.user || isOwner !== true) return json(401, { error: "Not signed in as the owner." });

  const body = await req.json().catch(() => ({}));
  const { provider, model, brief } = body ?? {};
  const settingsId = typeof body?.settingsId === "string" && body.settingsId.trim() ? body.settingsId.trim() : provider;
  if (typeof provider !== "string" || !(provider === "custom" || BASE_URLS[provider])) return json(400, { error: "Unknown provider." });
  if (typeof model !== "string" || !model.trim() || model.length > 80) return json(400, { error: "A model name is required." });
  if (typeof brief !== "string" || !brief.trim() || brief.length > 6000) return json(400, { error: "A business brief is required, 6000 characters max." });

  const { data: row, error: settingsErr } = await supabase.from("settings").select("data").eq("id", "app").single();
  if (settingsErr || !row) return json(500, { error: "Could not read Settings." });
  const engine = (row.data && row.data.engines && row.data.engines[settingsId]) || {};
  if (!engine.enabled) return json(400, { error: "This engine is turned off. Turn it on in Settings." });
  const key = typeof engine.apiKey === "string" ? engine.apiKey.trim() : "";
  if (!key) return json(400, { error: "No API key saved for this engine yet. Add one in Settings." });

  let baseUrl = BASE_URLS[provider];
  if (provider === "custom") {
    const customUrl = typeof engine.baseUrl === "string" ? engine.baseUrl.trim() : "";
    if (!isSafeCustomUrl(customUrl)) return json(400, { error: "Custom needs a real https:// base URL saved in Settings (not localhost or a private address)." });
    baseUrl = customUrl.replace(/\/$/, "");
  }

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: brief },
  ];

  try {
    const r = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens: 3500 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json(502, { error: String((j.error && (j.error.message || j.error)) || ("The provider returned " + r.status + ".")).slice(0, 300) });
    let html = j.choices?.[0]?.message?.content;
    if (typeof html !== "string" || !html.trim()) return json(502, { error: "The provider replied with no content." });
    // Some models wrap the output in a markdown code fence despite instructions not to. Strip it if present.
    html = html.trim().replace(/^```(?:html)?\s*/i, "").replace(/```\s*$/, "").trim();
    return json(200, { ok: true, html });
  } catch (e) {
    return json(502, { error: "Could not reach the provider.", detail: String((e as Error).message).slice(0, 200) });
  }
});
