// Edge function: sends one real email through Resend, as the address saved in Settings.
// Key lives in settings.data.engines.resend.apiKey, same RLS as every other table, only the
// signed-in owner can read or write it. This function reads it with the caller's own token,
// it never sees a wider credential, and it never echoes the key back in its response.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://YOUR-DOMAIN",
  "Access-Control-Allow-Headers": "authorization, content-type",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

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

  // 2. Validate. One recipient, sane sizes, and the UI must say it showed the confirm box.
  const { to, subject, body, confirmed } = await req.json().catch(() => ({}));
  if (confirmed !== true) return json(400, { error: "Send needs the confirm step." });
  if (typeof to !== "string" || !/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(to)) return json(400, { error: "One valid recipient only." });
  if (typeof subject !== "string" || !subject.trim() || subject.length > 200) return json(400, { error: "Subject is required, 200 characters max." });
  if (typeof body !== "string" || !body.trim() || body.length > 20000) return json(400, { error: "Message is required, 20000 characters max." });

  // 3. Load Resend's key and from-address from the caller's own settings row.
  const { data: row, error: settingsErr } = await supabase.from("settings").select("data").eq("id", "app").single();
  if (settingsErr || !row) return json(500, { error: "Could not read Settings." });
  const engine = (row.data && row.data.engines && row.data.engines.resend) || {};
  if (!engine.enabled) return json(400, { error: "Resend is turned off. Turn it on in Settings." });
  const key = typeof engine.apiKey === "string" ? engine.apiKey.trim() : "";
  const fromEmail = typeof engine.fromEmail === "string" ? engine.fromEmail.trim() : "";
  if (!key || !fromEmail) return json(400, { error: "Resend needs both an API key and a from-address saved in Settings." });

  // 4. Send through Resend. The from address comes from Settings, never from the request.
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ from: `Kendall Clark <${fromEmail}>`, to: [to], subject, text: body }),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return json(502, { error: String((j && (j.message || j.error)) || ("Resend returned " + r.status + ".")).slice(0, 300) });
    return json(200, { ok: true, messageId: j.id });
  } catch (e) {
    return json(502, { error: "Could not reach Resend.", detail: String((e as Error).message).slice(0, 200) });
  }
});
