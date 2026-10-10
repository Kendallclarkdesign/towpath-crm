// Edge function: rewrites one small selected snippet of copy from a generated preview site,
// either following a specific instruction or just making it punchier. Same auth/key-lookup
// pattern as generate-site, much smaller budget since a snippet isn't a full page.
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
  const { provider, model, snippet, instruction } = body ?? {};
  const settingsId = typeof body?.settingsId === "string" && body.settingsId.trim() ? body.settingsId.trim() : provider;
  if (typeof provider !== "string" || !(provider === "custom" || BASE_URLS[provider])) return json(400, { error: "Unknown provider." });
  if (typeof model !== "string" || !model.trim() || model.length > 80) return json(400, { error: "A model name is required." });
  if (typeof snippet !== "string" || !snippet.trim() || snippet.length > 2000) return json(400, { error: "A snippet to rewrite is required, 2000 characters max." });
  const hint = typeof instruction === "string" ? instruction.trim().slice(0, 300) : "";

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

  const system = "You are editing one small selected piece of copy on a business's marketing website. " +
    (hint ? "Follow this specific instruction: " + hint + "." : "Make it more compelling while keeping the same meaning and roughly the same length.") +
    " Output ONLY the replacement text for that exact snippet, nothing else: no surrounding quotes, no HTML tags, no commentary, no explanation.";
  const messages = [{ role: "system", content: system }, { role: "user", content: snippet }];

  try {
    const r = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens: 300 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json(502, { error: String((j.error && (j.error.message || j.error)) || ("The provider returned " + r.status + ".")).slice(0, 300) });
    let text = j.choices?.[0]?.message?.content;
    if (typeof text !== "string" || !text.trim()) return json(502, { error: "The provider replied with no content." });
    text = text.trim().replace(/^["'“]+|["'”]+$/g, "");
    return json(200, { ok: true, text });
  } catch (e) {
    return json(502, { error: "Could not reach the provider.", detail: String((e as Error).message).slice(0, 200) });
  }
});
