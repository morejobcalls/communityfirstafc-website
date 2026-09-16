// Lead relay for communityfirstafc.com (static site on GitHub Pages). Holds the GHL key server-side.
// POST /api/lead {kind: qualify|careers, ...answers} -> upsert contact in Community First sub-account + tags + note.
const GHL = "https://services.leadconnectorhq.com";
const ALLOW = /^https:\/\/((www\.)?communityfirstafc\.com|morejobcalls\.github\.io)$|^http:\/\/localhost(:\d+)?$/;
const PHONE = "508-304-9782";

const cors = (origin) => ({ "Access-Control-Allow-Origin": ALLOW.test(origin || "") ? origin : "https://communityfirstafc.com", "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type", "Vary": "Origin" });
const json = (o, s, origin) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json", "cache-control": "no-store", ...cors(origin) } });
const e164 = (p) => { const d = String(p || "").replace(/\D/g, ""); return d.length === 10 ? "+1" + d : d.length === 11 && d[0] === "1" ? "+" + d : null; };

async function ghl(env, method, path, body) {
  const r = await fetch(GHL + path, { method, headers: { Authorization: `Bearer ${env.CFAFC_GHL_PIT}`, Version: "2021-07-28", "Content-Type": "application/json", Accept: "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = {}; try { j = JSON.parse(t); } catch (_) {}
  if (!r.ok) throw new Error(`GHL ${path} ${r.status} ${t.slice(0, 300)}`);
  return j;
}

// Soft gate (Blueprint §10): never blocks the lead, only changes the reply and the tag.
function assess(d) {
  const f = [];
  if (d.live_together === "No") f.push("the caregiver and member must live together");
  if (d.age_16 === "No") f.push("the member must be 16 or older");
  if (d.spouse_guardian === "Yes") f.push("a spouse or legal guardian can't be the paid caregiver");
  if (d.needs_help === "No") f.push("no stated need for help");
  if (["Medicare only", "Private insurance"].includes(d.insurance)) f.push("insurance needs a check");
  return f;
}

export default {
  async fetch(req, env) {
    const u = new URL(req.url), origin = req.headers.get("Origin");
    if (u.pathname !== "/api/lead") return new Response("Not found", { status: 404 });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
    if (req.method !== "POST") return json({ ok: false, error: "POST only" }, 405, origin);
    if (origin && !ALLOW.test(origin)) return json({ ok: false, error: "origin" }, 403, origin);
    let d; try { d = await req.json(); } catch (_) { return json({ ok: false, error: "bad request" }, 400, origin); }
    if (d.company) return json({ ok: true, message: "Thank you." }, 200, origin);
    const kind = d.kind === "careers" ? "careers" : "qualify";
    const phone = e164(d.phone), name = String(d.name || "").trim().slice(0, 100);
    if (!phone || !name) return json({ ok: false, error: "name and a valid phone number are required" }, 400, origin);
    const [firstName, ...rest] = name.split(/\s+/);
    const skip = ["company", "name", "phone", "email", "kind", "attribution"];
    const lines = Object.entries(d).filter(([k]) => !skip.includes(k)).map(([k, v]) => `${k.replace(/_/g, " ")}: ${String(v).slice(0, 2000)}`);
    const a = d.attribution || {};
    const attr = Object.entries(a).filter(([, v]) => v).map(([k, v]) => `${k}: ${String(v).slice(0, 300)}`);
    const flags = kind === "qualify" ? assess(d) : [];
    const hard = flags.filter(f => /live together|16 or older|spouse/.test(f));
    const tags = kind === "careers" ? ["website-careers"] : ["website-qualify", `lang-${String(d.language || "english").toLowerCase().replace(/\s+/g, "-")}`, hard.length ? "qualify-review" : "qualify-likely-fit"];
    if (kind === "qualify" && d.other_agency === "Yes") tags.push("switcher");
    if (env.TEST_MODE === "on" || /^test\b/i.test(name)) tags.push("test-submission");
    const note = `${kind === "qualify" ? "WEBSITE: See if you qualify" : "WEBSITE: Careers application"} (${new Date().toISOString()})\n${lines.join("\n")}${flags.length ? `\nFlags: ${flags.join("; ")}` : ""}${attr.length ? `\n--- source ---\n${attr.join("\n")}` : ""}`;
    try {
      const up = await ghl(env, "POST", "/contacts/upsert", { locationId: env.CFAFC_GHL_LOCATION_ID, firstName, lastName: rest.join(" ") || undefined, phone, email: d.email || undefined, source: kind === "qualify" ? "Website - qualify form" : "Website - careers form", tags });
      const id = up.contact && up.contact.id;
      if (id) await ghl(env, "POST", `/contacts/${id}/notes`, { body: note });
    } catch (e) {
      console.error(String(e));
      return json({ ok: false, error: "crm" }, 502, origin);
    }
    if (kind === "careers") return json({ ok: true, message: "Thank you. Your application was sent to Community First, and someone will be in touch." }, 200, origin);
    const message = hard.length
      ? `Thank you, ${firstName}. One thing to know: under current program rules ${hard.join(", and ")}. Someone from Community First will still call you within one business day to talk through your situation, or call us any time at ${PHONE}.`
      : `Got it, ${firstName}. Someone from Community First will call you within one business day. If you'd rather talk now, call ${PHONE}.`;
    return json({ ok: true, message }, 200, origin);
  }
};
