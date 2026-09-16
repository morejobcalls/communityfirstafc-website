// Builds the static communityfirstafc.com site (GitHub Pages) from the live HBJamaica site + the approved CRO changes (Keri, SMS 2026-09-16).
// Usage: node build.mjs <outDir>. Copy follows the Messaging Blueprint v1 Claims Ledger (Approved list only).
import * as cheerio from "cheerio";
import fs from "node:fs/promises";
import path from "node:path";

const OUT = path.resolve(process.argv[2] || "site");
const ORIGIN = "https://communityfirstafc.com";
const RELAY = process.env.CF_RELAY || "https://cfafc-lead-relay.pages.dev";
const STAFF_LOGIN = "https://communityfirstafc.com/crm/clients"; // TODO before DNS switch: portal hostname
const PHONE = "508-304-9782", TEL = "tel:+15083049782", SMS = "sms:+15083049782";

// origin path -> clean route
const PAGES = [
  ["/", "/"], ["/index.php/about", "/adult-foster-care/"], ["/index.php/service", "/services/"],
  ["/index.php/service/view/1", "/services/caregiver-support/"], ["/index.php/service/view/2", "/services/case-management/"],
  ["/index.php/service/view/3", "/services/medical-oversight/"], ["/index.php/faq", "/faq/"], ["/index.php/contact", "/contact/"],
  ["/index.php/news", "/blog/"], ["/index.php/news/view/6", "/blog/all-you-need-to-be-a-caregiver/"],
  ["/index.php/privacy-policy", "/privacy-policy/"], ["/index.php/terms-and-conditions", "/terms-and-conditions/"],
];
const ROUTES = Object.fromEntries(PAGES);
const EXTRA_REDIRECTS = { "/index.php": "/", "/index.php/doctors": "/", "/index.php/photo-gallery": "/", "/careers": "/careers/", "/index.php/patient/login": STAFF_LOGIN, "/index.php/patient/registration": "/contact/" };

const META = {
  "/": ["Adult Foster Care in Massachusetts | Community First AFC", "Caring for a family member at home in Massachusetts? You may qualify for a tax-free stipend of up to $1,700 a month through MassHealth's Adult Foster Care program, plus a nurse and case manager. CARF accredited."],
  "/adult-foster-care/": ["What Is Adult Foster Care? | Community First AFC", "How MassHealth's Adult Foster Care program works, who qualifies, and how Community First supports caregivers and members at home."],
  "/services/": ["Our Services | Community First AFC", "Caregiver support, case management, and nursing oversight for Adult Foster Care families in Massachusetts."],
  "/services/caregiver-support/": ["Caregiver Support | Community First AFC", "Support for Adult Foster Care caregivers in Massachusetts: training, visits, and a team that answers."],
  "/services/case-management/": ["Case Management | Community First AFC", "A case manager who visits, coordinates care, and connects your family to the services you need."],
  "/services/medical-oversight/": ["Nursing Oversight | Community First AFC", "A registered nurse who visits each month and coordinates with the member's doctors."],
  "/faq/": ["Adult Foster Care FAQ | Community First AFC", "Answers about the Adult Foster Care caregiver stipend, paperwork, timeline, visits, and who qualifies in Massachusetts."],
  "/contact/": ["See If You Qualify | Community First AFC", "Answer a few quick questions to see if your family may qualify for Adult Foster Care. Call 508-304-9782."],
  "/careers/": ["Careers | Community First AFC", "Join Community First Adult Foster Care: nurses, case managers, and office staff in Worcester, MA."],
  "/blog/": ["Blog | Community First AFC", "News and guides for Adult Foster Care families in Massachusetts."],
  "/blog/all-you-need-to-be-a-caregiver/": ["All You Need to Be a Caregiver | Community First AFC", "What it takes to become an Adult Foster Care caregiver in Massachusetts."],
  "/privacy-policy/": ["Privacy Policy | Community First AFC", "Privacy policy for Community First Adult Foster Care."],
  "/terms-and-conditions/": ["Terms and Conditions | Community First AFC", "Terms and conditions for Community First Adult Foster Care."],
};

const sel = (name, opts) => `<select name="${name}" required><option value="">Choose one</option>${opts.map(o => `<option>${o}</option>`).join("")}</select>`;
const QUALIFY_FORM = `
<form class="cf-q" data-cf-form="qualify">
  <label>Who are you caring for?</label>${sel("caring_for", ["My parent", "My adult child", "My brother or sister", "Another relative", "A friend", "I want to become a caregiver"])}
  <label>Do you live together?</label>${sel("live_together", ["Yes", "Not yet, but we could", "No"])}
  <label>Do they have a diagnosed illness or disability, and need help with everyday things? (Bathing, dressing, meals, reminders, supervision.)</label>${sel("needs_help", ["Yes", "Not sure", "No"])}
  <label>Are they 16 or older?</label>${sel("age_16", ["Yes", "No"])}
  <label>What health insurance do they have?</label>${sel("insurance", ["MassHealth Standard", "MassHealth CommonHealth", "An SCO or One Care plan", "Medicare only", "Private insurance", "Not sure"])}
  <label>Are you their spouse or legal guardian?</label>${sel("spouse_guardian", ["No", "Yes"])}
  <label>Are you currently enrolled with another adult foster care agency?</label>${sel("other_agency", ["No", "Yes", "Not sure what that is"])}
  <label>What town are you in?</label><input name="town" required placeholder="Town">
  <label>What language do you prefer?</label>${sel("language", ["English", "Spanish", "Portuguese", "Haitian Creole", "Other"])}
  <label>Your name</label><input name="name" required placeholder="First and last name" autocomplete="name">
  <label>Best phone number</label><input name="phone" required placeholder="(508) 555-0100" inputmode="tel" autocomplete="tel">
  <label>Email (optional)</label><input name="email" type="email" placeholder="you@example.com" autocomplete="email">
  <input class="hp" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">
  <button type="submit">See if I qualify</button>
  <p class="fine">By submitting, you agree to be contacted by Community First Adult Foster Care by phone, text, or email about your inquiry. Message and data rates may apply. Reply STOP to opt out. No obligation. Eligibility is determined during intake.</p>
</form>`;
const CAREERS_FORM = `
<p class="cf-sub" style="text-align:center">Nurses, case managers, and office staff. Tell us a little about you and we'll be in touch.</p>
<form class="cf-q" data-cf-form="careers">
  <label>Your name</label><input name="name" required autocomplete="name">
  <label>Phone</label><input name="phone" required inputmode="tel" autocomplete="tel">
  <label>Email</label><input name="email" type="email" required autocomplete="email">
  <label>Which role are you interested in?</label>${sel("role", ["Registered Nurse (RN)", "Case Manager", "Office / Intake", "Other"])}
  <label>What town do you live in?</label><input name="town" required>
  <label>Languages you speak</label><input name="languages" placeholder="English, Spanish, ...">
  <label>Tell us about your experience</label><textarea name="experience" rows="5"></textarea>
  <input class="hp" name="company" tabindex="-1" autocomplete="off" aria-hidden="true">
  <button type="submit">Send my application</button>
  <p class="fine">By submitting, you agree to be contacted by Community First Adult Foster Care about your application.</p>
</form>`;

const SECTION = `
<div class="cf-band" id="stipend"><div class="in">
  <h2 class="cf-h2">What caregivers receive</h2>
  <p class="cf-sub">Adult Foster Care is a MassHealth benefit. Community First handles the enrollment and stays with you after.</p>
  <div class="cf-grid">
    <div class="cf-stat"><b>Up to $1,700 a month</b><span>Tax-free stipend for the caregiver. The amount depends on the level of care the member needs.</span></div>
    <div class="cf-stat"><b>Paid on time</b><span>Paid the second Friday of every month. We have never missed a payment.</span></div>
    <div class="cf-stat"><b>Nurse + case manager</b><span>They visit your home each month, together whenever possible. Evening and weekend visits available.</span></div>
    <div class="cf-stat"><b>A real person answers</b><span>If you leave a message, you hear back within 24 hours. Staff who speak Spanish, Portuguese, and Haitian Creole.</span></div>
  </div>
  <div class="cf-proof"><span>CARF accredited</span><span>MassHealth-approved Adult Foster Care provider</span><span>Serving Massachusetts families since 2022</span><span>8 or 9 out of 10 families who join us stay with us</span></div>
  <p class="cf-note">Serving Worcester, Middlesex, Suffolk, Norfolk, Essex, Hampden, and Plymouth counties. Stipend amounts depend on the level of care the member needs and are set by the MassHealth Adult Foster Care program. Caregivers must live with the member. Spouses, legal guardians, and parents of minors are not eligible to be paid caregivers under current program rules. Eligibility is determined during intake.</p>
</div></div>
<div class="cf-band" id="qualify" style="background:#fafafa"><div class="in">
  <h2 class="cf-h2" style="text-align:center">See if you qualify</h2>
  <p class="cf-sub" style="text-align:center">A few quick questions. Someone from Community First will call you within one business day.</p>
  ${QUALIFY_FORM}
</div></div>`;

const FAQ = [
  ["How much is the caregiver stipend?", "Up to $1,700 a month, tax-free. The amount depends on the level of care the member needs, and is set by the MassHealth Adult Foster Care program."],
  ["Is the stipend for me or for them?", "For you. It's the caregiver's money, with no strings on how you use it."],
  ["When is it paid?", "The second Friday of every month. We have never missed a payment."],
  ["How long does this take?", "Usually one to three months from your first call to your first stipend check. The fastest we've seen is about a month. What decides the speed is almost always the doctor paperwork, and we'll tell you exactly what to get and when."],
  ["How much paperwork is there?", "Less than people fear. For you, the caregiver: a note from your doctor that you're in good health, and a negative TB test from within the past year. For the member: a physical from within the past year, a doctor visit within the last three months, and the doctor signs the program form. That's the list."],
  ["Do I have to see my doctor?", "Yes, once. If you've had a physical this year, you may already be done."],
  ["How often do you visit?", "A nurse and a case manager come to your home each month. We try to send them together so you're not repeating yourself. Evening and weekend visits are available."],
  ["Do I have to quit my job?", "No. Many of our caregivers work. If the member isn't in a day program, we'll help you find one."],
  ["Can I leave them alone at all?", "Depends on the member. Some can be alone for up to a few hours a day. Your case manager will go over it with you."],
  ["Does the person I care for have to live with me?", "Yes."],
  ["Can I be paid to care for my husband or wife?", "Not under current Massachusetts rules. Legal guardians and parents of minor children also can't be the paid caregiver. If the rules change, we'll tell you."],
  ["What if they don't have MassHealth?", "Call us anyway. If the insurance isn't right, we'll point you to a broker who can help you figure out whether they can get it."],
  ["What if I'm already with another agency?", "You can switch. Each agency has its own intake, and the state re-approves you, but we coordinate with your current agency so the change is as smooth as possible."],
  ["Where do you serve?", "Worcester, Middlesex, Suffolk, Norfolk, Essex, Hampden, and Plymouth counties. Not the Cape or the islands."],
];
const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const FAQ_HTML = `<div class="col-md-12 cf-faq">${FAQ.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}
<p style="margin-top:28px;font-size:17px">Still have a question? Call <a href="${TEL}">${PHONE}</a> or <a href="/contact/">see if you qualify</a>.</p></div>`;
const FAQ_JSONLD = JSON.stringify({ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: FAQ.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) });
const ORG_JSONLD = JSON.stringify({ "@context": "https://schema.org", "@type": "MedicalBusiness", name: "Community First Adult Foster Care", url: "https://communityfirstafc.com/", telephone: "+1-508-304-9782", email: "info@communityfirstafc.com", address: { "@type": "PostalAddress", streetAddress: "1078 West Boylston St., Suite 202", addressLocality: "Worcester", addressRegion: "MA", postalCode: "01606", addressCountry: "US" }, areaServed: ["Worcester County", "Middlesex County", "Suffolk County", "Norfolk County", "Essex County", "Hampden County", "Plymouth County"].map(n => ({ "@type": "AdministrativeArea", name: n + ", MA" })) });

const DROP_SCRIPTS = /sharethis|ckeditor|js\.stripe\.com|ajax\.googleapis\.com\/ajax\/libs\/jquery\/1\.10|hover_pack|connect\.facebook\.net/;
const assets = new Set();

async function get(url) {
  for (let i = 0; i < 3; i++) {
    const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (MJC static build)" } });
    if (r.ok) return r;
    if (r.status === 404) return null;
  }
  throw new Error("fetch failed " + url);
}
const localAsset = (u) => {
  try {
    const x = new URL(u, ORIGIN + "/");
    if (x.hostname !== "communityfirstafc.com" || !x.pathname.startsWith("/public/")) return null;
    assets.add(x.pathname); return x.pathname;
  } catch { return null; }
};
const cleanHref = (h) => {
  if (!h) return h;
  let x; try { x = new URL(h, ORIGIN + "/"); } catch { return h; }
  if (x.hostname !== "communityfirstafc.com") return h;
  if (x.pathname.startsWith("/public/")) return localAsset(h);
  if (x.pathname.startsWith("/crm")) return STAFF_LOGIN;
  const p = x.pathname.replace(/\/$/, "") || "/";
  if (ROUTES[p]) return ROUTES[p] + x.hash;
  if (EXTRA_REDIRECTS[p]) return EXTRA_REDIRECTS[p];
  return h;
};

function linkPhones($) {
  const re = /508[-. ]304[-. ]9782/g;
  const walk = (el) => {
    $(el).contents().each((_, n) => {
      if (n.type === "text") {
        if (re.test(n.data)) { re.lastIndex = 0; $(n).replaceWith(esc(n.data).replace(re, m => `<a class="cf-tel" href="${TEL}">${m}</a>`)); }
        re.lastIndex = 0;
      } else if (n.type === "tag" && !["a", "script", "style", "select", "option", "textarea", "title", "head"].includes(n.name)) walk(n);
    });
  };
  walk($("body")[0]);
}

function transform(html, route) {
  const $ = cheerio.load(html, { decodeEntities: false });
  // head cleanup
  $("title").slice(1).remove();
  $('link[href="css/reset.css"], link[href="css/hover_pack.css"]').remove();
  $("script").each((_, s) => { const src = $(s).attr("src") || ""; const body = $(s).html() || ""; if (DROP_SCRIPTS.test(src) || /Stripe\.|facebook-jssdk/.test(body)) $(s).remove(); });
  $("#fb-root").remove();
  const [title, desc] = META[route];
  $("title").first().text(title);
  $('meta[name="description"]').remove();
  $("head").append(`\n<meta name="description" content="${esc(desc)}">\n<link rel="canonical" href="https://communityfirstafc.com${route}">\n<meta property="og:title" content="${esc(title)}">\n<meta property="og:description" content="${esc(desc)}">\n<meta property="og:image" content="https://communityfirstafc.com/public/uploads/slider-1.jpg">\n<link rel="stylesheet" href="/assets/cf.css">\n<script type="application/ld+json">${ORG_JSONLD}</script>`);
  // assets + links
  $("link[href]").each((_, e) => { const v = localAsset($(e).attr("href")); if (v) $(e).attr("href", v); });
  $("script[src], img[src]").each((_, e) => { const v = localAsset($(e).attr("src")); if (v) $(e).attr("src", v); });
  $("[style*='url(']").each((_, e) => $(e).attr("style", $(e).attr("style").replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (m, u) => { const v = localAsset(u); return v ? `url(${v})` : m; })));
  $("style").each((_, e) => $(e).html($(e).html().replace(/@import url\(http:\/\//g, "@import url(https://")));
  $("a[href]").each((_, a) => { $(a).attr("href", cleanHref($(a).attr("href"))); });
  // nav + careers + staff login
  $("a").each((_, a) => {
    const t = $(a).text().trim(); const h = $(a).attr("href") || "";
    if (/^(Patient Login|Patient Registration|AFC LOGIN)$/i.test(t)) $(a).closest("li").remove();
    if (/hbjamaica\.com\/quickform/.test(h)) { $(a).attr("href", "/careers/").removeAttr("onclick").removeAttr("target"); }
    if (/^https?:\/\/(www\.)?(facebook|twitter|linkedin|pinterest|youtube)\.com\/?$/.test(h)) $(a).closest("li").remove();
  });
  $(".footer-social-list").remove();
  $(".footer-bottom-area .col-md-12").html(`&copy; ${new Date().getFullYear()} Community First Adult Foster Care, LLC. All rights reserved. <a href="${STAFF_LOGIN}" style="opacity:.6;margin-left:10px">Staff login</a>`);
  // newsletter form posts to the old CMS: swap for a qualify CTA
  $('form[action*="newsletter"]').closest(".footer-column").find("h3").text("SEE IF YOU QUALIFY");
  $('form[action*="newsletter"]').closest(".footer-column").find("p").text("Caring for a family member at home in Massachusetts? A few quick questions tells you if Adult Foster Care may be a fit.");
  $('form[action*="newsletter"]').replaceWith(`<a href="/contact/" class="btn cf-foot-btn">See if you qualify</a>`);
  $(".call-us .call-text h3").text("Caring for a loved one at home? You may qualify for a tax-free stipend of up to $1,700 a month.");
  $(".call-us .button a").attr("href", "/contact/").html(`See if you qualify <i class="fa fa-chevron-circle-right"></i>`);
  // inner-page banners were never uploaded (gray "1300X324" placeholders): use the real slider photo
  $(".banner-area").each((_, b) => { $(b).attr("style", "background-image: url(/public/uploads/slider-2.jpg)"); });
  assets.add("/public/uploads/slider-2.jpg");

  if (route === "/") {
    const slides = [
      ["You're already caring for them. MassHealth's Adult Foster Care program may be able to pay you for it.", "If you're caring for a family member at home in Massachusetts, you may qualify for a tax-free stipend of up to $1,700 a month, plus a nurse and a case manager who actually show up. Community First handles the paperwork, pays on time, and speaks your language."],
      ["Paid the second Friday of every month. We have never missed a payment.", "Already with another agency? You can switch, and we coordinate with your current agency so the change is as smooth as possible. Staff who speak Spanish, Portuguese, and Haitian Creole."],
    ];
    $(".slider-item").each((i, s) => {
      const [h, p] = slides[Math.min(i, slides.length - 1)];
      const t = $(s).find(".text-animated");
      t.find("h1").text(h); t.find("p").text(p);
      t.find("ul").attr("class", "cf-hero-cta").html(`<li><a class="p" href="#qualify">See if you qualify (2 min)</a></li><li><a class="s" href="${TEL}">Call ${PHONE}</a></li>`);
    });
    const opt = $("h1").filter((_, h) => /You have Options/i.test($(h).text())).first();
    let sec = opt; for (let i = 0; i < 8; i++) { const p = sec.parent(); if (!p.length || p.is("body")) break; sec = p; if (/area|section|pt_|pb_/.test(sec.attr("class") || "")) break; }
    sec.before(SECTION);
  }
  if (route === "/faq/") { $("#menu").html(FAQ_HTML); $("head").append(`<script type="application/ld+json">${FAQ_JSONLD}</script>`); }
  if (route === "/contact/") {
    $(".form-area .headline h1").text("See if you qualify").attr("id", "qualify");
    $(".form-area form").replaceWith(QUALIFY_FORM);
    $(".map-area").remove();
  }
  if (route === "/careers/") {
    $(".banner-area h1").text("Careers");
    $(".contact-address-area, .map-area").remove();
    $(".form-area .headline h1").text("Join our team");
    $(".form-area form").replaceWith(CAREERS_FORM);
  }
  linkPhones($);
  $("body").append(`\n<div class="cf-bar"><a class="c" href="${TEL}">Call ${PHONE}</a><a class="t" href="${SMS}">Text us</a></div>\n<script>window.CF_RELAY=${JSON.stringify(RELAY)};</script>\n<script src="/assets/cf.js" defer></script>`);
  return "<!DOCTYPE html>\n" + $.html().replace(/^<!DOCTYPE html>\s*/i, "");
}

const redirectPage = (to) => `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Redirecting</title><link rel="canonical" href="${to.startsWith("http") ? to : "https://communityfirstafc.com" + to}"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0; url=${to}"><script>location.replace(${JSON.stringify(to)}+location.hash)</script></head><body><a href="${to}">Continue</a></body></html>`;

const BASE = (process.env.BASE || "").replace(/\/$/, "");
const rebase = (s) => BASE ? s.replace(/((?:href|src|action)=["'])\/(?!\/)/g, `$1${BASE}/`).replace(/url\(\/(?!\/)/g, `url(${BASE}/`).replace(/(url=)\/(?!\/)/g, `$1${BASE}/`).replace(/location\.replace\("\//g, `location.replace("${BASE}/`) : s;
async function write(p, data) { if (typeof data === "string" && /\.(html)$/.test(p)) data = rebase(data); const f = path.join(OUT, p); await fs.mkdir(path.dirname(f), { recursive: true }); await fs.writeFile(f, data); }

const origin = {};
for (const [src, route] of PAGES) origin[route] = await (await get(ORIGIN + src)).text();
origin["/careers/"] = origin["/contact/"];
for (const route of Object.keys(origin)) await write(path.join(route, "index.html"), transform(origin[route], route));
for (const [src, route] of PAGES) if (src !== "/") await write(path.join(src, "index.html"), redirectPage(route));
for (const [src, to] of Object.entries(EXTRA_REDIRECTS)) if (src !== "/careers") await write(path.join(src, "index.html"), redirectPage(to));

// assets, including url() refs inside CSS
const done = new Set();
while ([...assets].some(a => !done.has(a))) {
  for (const a of [...assets]) {
    if (done.has(a)) continue; done.add(a);
    const r = await get(ORIGIN + a); if (!r) { console.warn("missing asset", a); continue; }
    const buf = Buffer.from(await r.arrayBuffer());
    if (a.endsWith(".css")) {
      buf.toString("utf8").replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g, (m, u) => { if (!/^(data:|https?:|\/\/)/.test(u)) { const abs = new URL(u, ORIGIN + a).pathname; if (abs.startsWith("/public/")) assets.add(abs); } return m; });
    }
    await write(a, buf);
  }
}
const SITEMAP = PAGES.map(p => p[1]).concat("/careers/");
await write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SITEMAP.map(p => `<url><loc>https://communityfirstafc.com${p}</loc></url>`).join("\n")}\n</urlset>\n`);
await write("robots.txt", "User-agent: *\nAllow: /\nSitemap: https://communityfirstafc.com/sitemap.xml\n");
await write(".nojekyll", "");
console.log("pages", Object.keys(origin).length, "assets", done.size);
