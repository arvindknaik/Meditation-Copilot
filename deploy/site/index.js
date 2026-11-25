/* sosmn.org — runs before the home page and calendar only (see run_worker_first in wrangler.toml).
 * Visitors outside Minnesota see a short page that takes them to the center's page on sos.org after 5 seconds,
 * with a button to stay. Minnesota visitors, search engines, invitation links (?ref=invite) and people who chose
 * to stay (remembered for 30 days) go straight to the site. Event pages, News, About and Copilot are never redirected.
 */
const SOS_PAGE = 'https://sos.org/location/Minneapolis-StPaul/';
const STAY_COOKIE = 'sosmn_stay';
const BOTS = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|linkedinbot|embedly|whatsapp|telegrambot|discordbot|applebot|duckduck|yandex|baidu|lighthouse|pagespeed/i;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname === 'www.sosmn.org') { url.hostname = 'sosmn.org'; return Response.redirect(url.toString(), 301); }
    if (request.method !== 'GET' && request.method !== 'HEAD') return env.ASSETS.fetch(request);

    const cookies = request.headers.get('Cookie') || '';
    const stayAsked = url.searchParams.has('stay') || url.searchParams.get('ref') === 'invite';
    if (stayAsked) {
      // Remember the choice, then show the clean address
      url.searchParams.delete('stay');
      if (url.searchParams.get('ref') !== 'invite') url.searchParams.delete('ref');
      const res = new Response(null, { status: 302, headers: { Location: url.pathname + (url.search || '') } });
      res.headers.append('Set-Cookie', `${STAY_COOKIE}=1; Max-Age=${30 * 86400}; Path=/; Secure; SameSite=Lax`);
      if (url.searchParams.get('ref') === 'invite') return env.ASSETS.fetch(request).then((r) => withCookie(r));
      return res;
    }
    // Returning from Microsoft sign-in (it comes back to "/" with ?code=&state=): let the page finish signing in
    if (url.searchParams.has('code') && url.searchParams.has('state')) return env.ASSETS.fetch(request);
    if (cookies.includes(STAY_COOKIE + '=1') || BOTS.test(request.headers.get('User-Agent') || '')) return env.ASSETS.fetch(request);

    const cf = request.cf || {};
    let country = cf.country, region = cf.regionCode;
    if (env.GEO_TEST === 'true' && url.searchParams.get('geo')) [country, region] = url.searchParams.get('geo').split('-');   // local testing only
    const inMinnesota = country === 'US' && region === 'MN';
    const unknown = !country;                                   // no location (e.g. local preview): don't redirect
    if (inMinnesota || unknown) return env.ASSETS.fetch(request);
    return gatePage(url);
  }
};

function withCookie(r) {
  const res = new Response(r.body, r);
  res.headers.append('Set-Cookie', `${STAY_COOKIE}=1; Max-Age=${30 * 86400}; Path=/; Secure; SameSite=Lax`);
  return res;
}

function gatePage(url) {
  const stay = url.pathname + (url.search ? url.search + '&' : '?') + 'stay=1';
  const html = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><meta http-equiv="refresh" content="5;url=${SOS_PAGE}">
<title>Science of Spirituality Minneapolis Meditation Center</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:Roboto,-apple-system,"Segoe UI",Arial,sans-serif;background:#faf8f3;color:#2b2b2b;padding:20px}
.c{max-width:480px;background:#fff;border:1px solid #e7e3da;border-radius:22px;padding:30px 26px;text-align:center;box-shadow:0 10px 30px rgba(4,58,91,.08)}
h1{font-family:Lusitana,Georgia,serif;color:#043a5b;font-size:1.6rem;margin:12px 0 10px}p{color:#5e6b78;line-height:1.55}
.b{display:inline-block;margin:6px 4px;padding:11px 18px;border-radius:99px;font-weight:700;text-decoration:none}.p{background:#043a5b;color:#fff}.g{border:1px solid #e7e3da;color:#043a5b}
.n{font-family:Georgia,serif;font-size:2rem;color:#968743}@media(prefers-color-scheme:dark){body{background:#07192a;color:#eef3f7}.c{background:#0f2a40;border-color:#214a68}h1{color:#9fc5e4}p{color:#a9bccb}.g{color:#9fc5e4;border-color:#214a68}}</style></head>
<body><main class="c"><div class="n" id="n" aria-hidden="true">5</div>
<h1>Science of Spirituality Minneapolis Meditation Center</h1>
<p>This site is for our center in the Twin Cities. Taking you to the center's page on sos.org, where you can also find a center near you.</p>
<p><a class="b p" href="${SOS_PAGE}">Go to sos.org now</a><a class="b g" href="${stay}">Stay on sosmn.org</a></p></main>
<script>var n=5,e=document.getElementById('n');setInterval(function(){if(n>0)e.textContent=--n;},1000);</script></body></html>`;
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store' } });
}
