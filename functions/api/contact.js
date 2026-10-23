// POST /api/contact: the contact form on the home page.
// Validates the submission, then hands it to the form-mailer Worker (jsindy/website-ai,
// infra/form-mailer) over the MAILER service binding, signed the way form-mailer expects:
// X-Signature = hex HMAC-SHA256 of `${timestamp}.${body}` with MAILER_SECRET, the value
// form-mailer holds as SECRET_BITNIK_TECH. form-mailer has no public URL, so this site
// must run in the same Cloudflare account.
//
// Spam: same-origin only; a hidden honeypot field and a submit faster than a person could
// type both get a quiet {"ok": true} that goes nowhere; and every request must carry a
// Cloudflare Turnstile token that verifies against TURNSTILE_SECRET (widget "bitnik.tech
// contact form", site key in public/index.html).

const SLUG = "bitnik-tech";
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

// Tokens come from the widget; siteverify says whether this one was earned by a person.
async function human(secret, token, ip) {
  if (!token) return false;
  const body = new FormData();
  body.append("secret", secret);
  body.append("response", String(token).slice(0, 2048));
  if (ip) body.append("remoteip", ip);
  try {
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body });
    return (await r.json()).success === true;
  } catch {
    return false;
  }
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
  // Nobody fills in a name and an email within 2.5 seconds of the page loading.
  if (!(Number(d.elapsed) >= 2500)) return json(200, { ok: true });

  const name = line(d.name, 120);
  const email = line(d.email, 200);
  const message = String(d.message ?? "").trim().slice(0, 5000);
  const type = KINDS[d.kind] || KINDS.unsure;
  if (!name || !EMAIL_RE.test(email)) return json(422, { ok: false, error: "name and email required" });

  if (!env.MAILER || !env.MAILER_SECRET || !env.TURNSTILE_SECRET) return json(503, { ok: false, error: "form not configured" });
  if (!(await human(env.TURNSTILE_SECRET, d.token, request.headers.get("CF-Connecting-IP")))) {
    return json(403, { ok: false, error: "verify" });
  }

  const body = JSON.stringify({
    form: "Project inquiry",
    page: "bitnik.tech",
    fields: { name, email, type, message },
  });
  const ts = String(Math.floor(Date.now() / 1000));
  const res = await env.MAILER.fetch("https://form-mailer/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Slug": SLUG,
      "X-Timestamp": ts,
      "X-Signature": await sign(env.MAILER_SECRET, ts, body),
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
