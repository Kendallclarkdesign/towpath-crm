// Edge function: pulls Google Search Console numbers for one client and saves them to the
// gsc_snapshots table. Auth pattern matches rewrite-text: owner only. The Google service account
// key lives in the GSC_SERVICE_ACCOUNT_JSON secret and never reaches the browser.
//   { action: "sites" }                       -> properties the service account can see
//   { action: "sync", clientId, siteUrl }     -> pull 28 days (plus the 28 before), save, return the snapshot
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": Deno.env.get("ALLOWED_ORIGIN") ?? "https://YOUR-DOMAIN",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const API = "https://www.googleapis.com/webmasters/v3/sites";
const b64url = (b: ArrayBuffer | string) => {
  const bytes = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b);
  let s = ""; bytes.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

async function accessToken(): Promise<string> {
  const raw = Deno.env.get("GSC_SERVICE_ACCOUNT_JSON");
  if (!raw) throw new Error("GSC_SERVICE_ACCOUNT_JSON is not set on this Supabase project.");
  const sa = JSON.parse(raw);
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({ iss: sa.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = String(sa.private_key).replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const der = Uint8Array.from(atob(pem), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + claim));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: head + "." + claim + "." + b64url(sig) }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("Google sign in failed: " + (j.error_description || j.error || r.status));
  return j.access_token;
}

const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);

async function query(token: string, site: string, body: Record<string, unknown>) {
  const r = await fetch(`${API}/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" },
    body: JSON.stringify({ rowLimit: 25, ...body }),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 403 ? "The service account does not have access to this property. Add it as a user in Search Console." : (j.error?.message || "Search Console returned " + r.status));
  return (j.rows ?? []) as Array<{ keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }>;
}
const round = (n: number, p = 1) => Math.round(n * 10 ** p) / 10 ** p;
const totals = (r?: { clicks: number; impressions: number; ctr: number; position: number }) =>
  r ? { clicks: r.clicks, impressions: r.impressions, ctr: round(r.ctr * 100, 2), position: round(r.position) } : { clicks: 0, impressions: 0, ctr: 0, position: 0 };

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
  try {
    const token = await accessToken();

    if (body.action === "sites") {
      const r = await fetch(API, { headers: { Authorization: "Bearer " + token } });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return json(502, { error: j.error?.message || "Search Console returned " + r.status });
      return json(200, { ok: true, sites: (j.siteEntry ?? []).map((s: { siteUrl: string }) => s.siteUrl) });
    }

    if (body.action === "sync") {
      const { clientId, siteUrl } = body;
      if (typeof clientId !== "string" || !clientId || clientId.length > 80) return json(400, { error: "A client is required." });
      if (typeof siteUrl !== "string" || !/^(sc-domain:[a-z0-9.-]+|https?:\/\/\S+)$/i.test(siteUrl)) return json(400, { error: "Property must look like sc-domain:example.com or https://example.com/" });

      // Search Console data trails by about 2 days, so the window ends 2 days ago.
      const end = addDays(new Date(), -2), start = addDays(end, -27);
      const prevEnd = addDays(start, -1), prevStart = addDays(prevEnd, -27);
      const cur = { startDate: iso(start), endDate: iso(end) }, prev = { startDate: iso(prevStart), endDate: iso(prevEnd) };

      const [now, before, daily, queries, pages] = await Promise.all([
        query(token, siteUrl, { ...cur }),
        query(token, siteUrl, { ...prev }),
        query(token, siteUrl, { ...cur, dimensions: ["date"], rowLimit: 60 }),
        query(token, siteUrl, { ...cur, dimensions: ["query"] }),
        query(token, siteUrl, { ...cur, dimensions: ["page"] }),
      ]);
      const rowOut = (r: { keys?: string[]; clicks: number; impressions: number; ctr: number; position: number }) =>
        ({ key: r.keys?.[0] ?? "", clicks: r.clicks, impressions: r.impressions, ctr: round(r.ctr * 100, 2), position: round(r.position) });
      const snapshot = {
        clientId, siteUrl, pulledAt: new Date().toISOString(), range: cur, prevRange: prev,
        totals: totals(now[0]), prevTotals: totals(before[0]),
        daily: daily.map((r) => ({ date: r.keys![0], clicks: r.clicks, impressions: r.impressions })).sort((a, b) => a.date.localeCompare(b.date)),
        queries: queries.map(rowOut), pages: pages.map(rowOut),
      };
      const { error } = await supabase.from("gsc_snapshots").upsert({ id: clientId, data: { ...snapshot, id: clientId }, updated_at: new Date().toISOString() });
      if (error) return json(500, { error: "Pulled the numbers but could not save them: " + error.message });
      return json(200, { ok: true, snapshot: { ...snapshot, id: clientId } });
    }
    return json(400, { error: "Unknown action." });
  } catch (e) {
    return json(502, { error: String((e as Error).message).slice(0, 300) });
  }
});
