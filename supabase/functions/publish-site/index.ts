// Edge function: publishes a generated HTML page to a brand-new Netlify site and returns its
// live URL. Uses Netlify's "digest deploy" API (no external zip library needed): tell Netlify
// the SHA-1 of each file first, then PUT the raw bytes for whichever files it says it doesn't
// have yet. Same auth and key-lookup pattern as agent-chat/generate-site.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://YOUR-DOMAIN",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function sha1Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function slugify(name: string): string {
  const base = (name || "preview").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 38) || "preview";
  const suffix = Math.random().toString(36).slice(2, 8);
  return base + "-" + suffix;
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
  const { html, name } = body ?? {};
  if (typeof html !== "string" || !html.trim() || html.length > 300000) return json(400, { error: "Page HTML is required, 300000 characters max." });
  if (name != null && typeof name !== "string") return json(400, { error: "Bad name." });

  const { data: row, error: settingsErr } = await supabase.from("settings").select("data").eq("id", "app").single();
  if (settingsErr || !row) return json(500, { error: "Could not read Settings." });
  const engine = (row.data && row.data.engines && row.data.engines.netlify) || {};
  if (!engine.enabled) return json(400, { error: "Netlify isn't connected. Add your Netlify personal access token in Settings first." });
  const token = typeof engine.apiToken === "string" ? engine.apiToken.trim() : "";
  if (!token) return json(400, { error: "No Netlify token saved yet. Add one in Settings." });

  const slug = slugify(name || "");
  const nlHeaders = { Authorization: "Bearer " + token, "Content-Type": "application/json" };

  try {
    // 1. Create a brand-new site. Try with a readable slug first, fall back to an auto-generated
    //    name if that slug happens to collide with someone else's site anywhere on Netlify.
    let siteRes = await fetch("https://api.netlify.com/api/v1/sites", { method: "POST", headers: nlHeaders, body: JSON.stringify({ name: slug }) });
    if (!siteRes.ok) siteRes = await fetch("https://api.netlify.com/api/v1/sites", { method: "POST", headers: nlHeaders, body: JSON.stringify({}) });
    if (!siteRes.ok) {
      const j = await siteRes.json().catch(() => ({}));
      return json(502, { error: "Netlify could not create the site: " + String(j.message || siteRes.status).slice(0, 200) });
    }
    const site = await siteRes.json();

    // 2. Start a digest deploy: tell Netlify the SHA-1 of the one file we're sending.
    const digest = await sha1Hex(html);
    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${site.id}/deploys`, {
      method: "POST", headers: nlHeaders, body: JSON.stringify({ files: { "/index.html": digest } }),
    });
    if (!deployRes.ok) {
      const j = await deployRes.json().catch(() => ({}));
      return json(502, { error: "Netlify could not start the deploy: " + String(j.message || deployRes.status).slice(0, 200) });
    }
    const deploy = await deployRes.json();

    // 3. Upload the actual file content for whatever Netlify says it's missing.
    const required: string[] = Array.isArray(deploy.required) ? deploy.required : [];
    if (required.includes(digest) || required.length) {
      const upRes = await fetch(`https://api.netlify.com/api/v1/deploys/${deploy.id}/files/index.html`, {
        method: "PUT", headers: { Authorization: "Bearer " + token, "Content-Type": "application/octet-stream" }, body: html,
      });
      if (!upRes.ok) {
        const j = await upRes.json().catch(() => ({}));
        return json(502, { error: "Netlify could not upload the page: " + String(j.message || upRes.status).slice(0, 200) });
      }
    }

    return json(200, { ok: true, url: site.ssl_url || site.url, siteId: site.id });
  } catch (e) {
    return json(502, { error: "Could not reach Netlify.", detail: String((e as Error).message).slice(0, 200) });
  }
});
