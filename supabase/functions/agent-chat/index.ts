// Edge function: gets a real reply from a free model for the Team tab's Chat.
// Keys live in the `settings` table (data.engines.<provider>.apiKey), set from the Settings
// page in the app. Same RLS as every other table, only the signed-in owner can read or write
// it. This function reads it with the caller's own token, it never sees a wider credential,
// and it never echoes the key back in its response.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://YOUR-DOMAIN",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

// Same request shape for every named provider, all OpenAI-compatible (Gemini via its
// documented compatibility layer, ai.google.dev/gemini-api/docs/openai; Cerebras per
// inference-docs.cerebras.ai). Custom's base URL comes from the caller's own settings.
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

  // 1. Must be the signed-in owner. The same client (with the caller's own token) is reused
  //    below to read settings, so this never needs a broader service-role credential.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
  });
  const { data: user } = await supabase.auth.getUser();
  const { data: isOwner } = await supabase.rpc("is_owner");
  if (!user?.user || isOwner !== true) return json(401, { error: "Not signed in as the owner." });

  // 2. Validate the request.
  const body = await req.json().catch(() => ({}));
  const { provider, model, agent, history, message } = body ?? {};
  const settingsId = typeof body?.settingsId === "string" && body.settingsId.trim() ? body.settingsId.trim() : provider;
  if (typeof provider !== "string" || !(provider === "custom" || BASE_URLS[provider])) return json(400, { error: "Unknown provider." });
  if (typeof model !== "string" || !model.trim() || model.length > 80) return json(400, { error: "A model name is required." });
  if (typeof message !== "string" || !message.trim() || message.length > 4000) return json(400, { error: "Message is required, 4000 characters max." });
  const hist = Array.isArray(history) ? history.slice(-10) : [];

  // 3. Load this engine's key (and, for Custom-wire cards, its base URL) from the caller's own
  //    settings row, keyed by the card's own id (settingsId), not the wire protocol (provider) -
  //    cards like Kimi share the 'custom' wire protocol but each has its own saved key.
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

  // 4. Build the conversation. The agent's own persona becomes the system prompt.
  const a = agent && typeof agent === "object" ? agent : {};
  const persona = [
    "You are " + (a.title || "a team member") + " at Towpath Creative" + (a.dept ? ", " + a.dept + " department" : "") + ".",
    a.blurb ? String(a.blurb) : "",
    Array.isArray(a.skills) && a.skills.length ? "Your focus: " + a.skills.join(", ") + "." : "",
    "Reply like a real coworker in a work chat: short, direct, practical. No filler, no disclaimers about being an AI unless directly asked."
  ].filter(Boolean).join(" ");
  const messages = [
    { role: "system", content: persona },
    ...hist
      .filter((m: unknown) => m && typeof (m as any).text === "string")
      .map((m: any) => ({ role: m.from === "me" ? "user" : "assistant", content: String(m.text).slice(0, 2000) })),
    { role: "user", content: message },
  ];

  // 5. Call the provider.
  try {
    const r = await fetch(baseUrl + "/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model, messages, max_tokens: 600 }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json(502, { error: String((j.error && (j.error.message || j.error)) || ("The provider returned " + r.status + ".")).slice(0, 300) });
    const reply = j.choices?.[0]?.message?.content;
    if (typeof reply !== "string" || !reply.trim()) return json(502, { error: "The provider replied with no content." });
    return json(200, { ok: true, reply: reply.trim() });
  } catch (e) {
    return json(502, { error: "Could not reach the provider.", detail: String((e as Error).message).slice(0, 200) });
  }
});
