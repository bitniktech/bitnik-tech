// POST /api/contact: the contact form on the home page.
// Validates the submission, then hands it to the form-mailer Worker over the
// FORM_MAILER service binding, signed the way form-mailer expects:
// X-Signature = hex HMAC-SHA256 of `${timestamp}.${body}` with FORM_SECRET,
// which is the same value form-mailer holds as SECRET_BITNIK.

const SLUG = "bitnik";
const KINDS = { website: "Website", app: "App", automation: "Automation", unsure: "Not sure yet" };
const EMAIL_RE = /^[^\s@<>",]+@[^\s@<>",]+\.[^\s@<>",]+$/;

const json = (status, obj) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });

async function sign(secret, ts, body) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${body}`));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const line = (v, n) => String(v ?? "").replace(/[\r\n]+/g, " ").trim().slice(0, n);

export async function onRequestPost({ request, env }) {
  // Browsers always send Origin on a fetch POST; a missing or foreign one is a script, not the form.
  const origin = request.headers.get("Origin");
  if (!origin || new URL(origin).host !== new URL(request.url).host) return json(403, { ok: false, error: "origin" });

  const raw = await request.text();
  if (raw.length > 16000) return json(413, { ok: false, error: "too large" });
  let d;
  try { d = JSON.parse(raw); } catch { return json(400, { ok: false, error: "bad json" }); }

  // Honeypot: the "website" field is hidden from people. Pretend success so bots move on.
  if (line(d.website, 200)) return json(200, { ok: true });

  const name = line(d.name, 120);
  const email = line(d.email, 200);
  const message = String(d.message ?? "").trim().slice(0, 5000);
  const type = KINDS[d.kind] || KINDS.unsure;
  if (!name || !EMAIL_RE.test(email)) return json(422, { ok: false, error: "name and email required" });

  if (!env.FORM_MAILER || !env.FORM_SECRET) return json(503, { ok: false, error: "form not configured" });

  const body = JSON.stringify({
    form: "Project inquiry",
    page: "bitnik.tech",
    fields: { name, email, type, message },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await env.FORM_MAILER.fetch("https://form-mailer/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Slug": SLUG,
      "X-Timestamp": ts,
      "X-Signature": await sign(env.FORM_SECRET, ts, body),
    },
    body,
  });
  if (!res.ok) {
    console.log("form-mailer refused", res.status, await res.text());
    return json(502, { ok: false, error: "send failed" });
  }
  return json(200, { ok: true });
}

export const onRequest = () => json(405, { ok: false, error: "POST only" });
