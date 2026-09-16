# communityfirstafc.com

Static rebuild of Community First Adult Foster Care's site with the approved CRO changes (Keri, 2026-09-16). Managed by MoreJobCalls.com.

- docs/: published site (GitHub Pages). Preview build uses BASE=/communityfirstafc-website.
- tools/build.mjs: regenerates docs/ from the live site + approved copy. cd tools && npm i && node build.mjs ../docs && cp -R static/assets ../docs/
- relay/_worker.js: lead relay on Cloudflare Pages (cfafc-lead-relay.pages.dev), POST /api/lead -> GHL sub-account AIHBIbNpXOgWB2mX4Ya4.

## Go-live (not done)
1. Rebuild without BASE, add docs/CNAME = communityfirstafc.com.
2. Staff portal: /crm and patient login live on the old cPanel host and stop working on this domain. Needs a portal hostname in that hosting account first.
3. GoDaddy DNS: root A -> 185.199.108.153/109/110/111, www CNAME -> morejobcalls.github.io. Leave MX/TXT/autodiscover/Microsoft records alone.
