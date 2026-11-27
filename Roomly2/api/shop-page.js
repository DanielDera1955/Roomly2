// GET /s/:id (see vercel.json)  ->  the normal Roomly page, with this shop's name and photo in the link preview.
// WhatsApp and Facebook do not run the app, they only read the page's <meta> tags, so without this every shop
// link would show the same Roomly preview. Students still land on the same app: the page then opens /?shop=ID.
import { adminDb } from './_paystack.js';

const SITE = 'https://roomlycaritas.vercel.app';
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const first = (name) => String(name || '').trim().split(/\s+/)[0] || 'Vendor';

// Cloudinary photo cropped to the 1200x630 preview size. Other links are left out (the default Roomly image is used).
const ogImage = (u) =>
  /^https:\/\/res\.cloudinary\.com\//.test(String(u || ''))
    ? String(u).replace(/\/upload\/[^/]*\bw_\d+[^/]*\//, '/upload/w_1200,h_630,c_fill,q_auto,f_jpg/')
    : '';

function setMeta(html, attr, key, value) {
  const re = new RegExp(`<meta\\s+${attr}="${key}"\\s+content="[^"]*"\\s*/?>`);
  const tag = `<meta ${attr}="${key}" content="${esc(value)}" />`;
  return re.test(html) ? html.replace(re, tag) : html.replace('</head>', `    ${tag}\n  </head>`);
}

export default async function handler(req, res) {
  const id = String(req.query.shop || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
  try {
    const proto = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers['x-forwarded-host'] || req.headers.host;
    const page = await fetch(`${proto}://${host}/index.html`);
    let html = await page.text();
    if (!page.ok || !html.includes('</head>')) throw new Error('app page not found');

    if (id) {
      const snap = await adminDb().collection('shops').doc(id).get();
      const shop = snap.exists ? snap.data() : null;
      if (shop && shop.status === 'live') {
        const isService = shop.kind === 'service';
        const title = `${first(shop.name)}'s ${isService ? 'Services' : 'Items'} on Roomly Caritas`;
        const n = Array.isArray(shop.items) ? shop.items.filter((i) => i && i.name).length : 0;
        const desc = String(shop.bio || '').trim() || (isService ? 'See the services and send a request on WhatsApp.' : `See all ${n} items and send your order on WhatsApp.`);
        const img = ogImage(shop.cover || shop.photo);
        html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`);
        html = setMeta(html, 'name', 'description', desc);
        html = setMeta(html, 'property', 'og:title', title);
        html = setMeta(html, 'property', 'og:description', desc);
        html = setMeta(html, 'property', 'og:url', `${SITE}/s/${id}`);
        if (img) {
          html = setMeta(html, 'property', 'og:image', img);
          html = setMeta(html, 'name', 'twitter:image', img);
        }
      }
      // The app reads ?shop=ID, so the address is switched to that before the app starts
      html = html.replace('</head>', `    <script>history.replaceState(null,'','/?shop=${id}')</script>\n  </head>`);
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    res.status(200).send(html);
  } catch (e) {
    console.error('shop-page', e);
    // Never leave a student on an error page: open the app directly
    res.redirect(302, id ? `/index.html?shop=${id}` : '/');
  }
}
