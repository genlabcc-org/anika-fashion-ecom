// Vercel Serverless Function to serve Open Graph preview tags for social crawlers
import fs from 'fs';
import path from 'path';

// Match ONLY real link-preview bots; exclude in-app browsers
const CRAWLER_REGEX = /facebookexternalhit|Facebot|meta-externalagent|WhatsApp|Twitterbot|TelegramBot|LinkedInBot|Slackbot|Pinterest|Discordbot/i;

// In-app browsers: Instagram, Facebook in-app (FBAN/FBAV), Line, etc.
const IN_APP_BROWSER_REGEX = /Instagram|FBAN|FBAV|Line\//i;

function isCrawler(userAgent = '') {
  if (!userAgent) return false;
  // Guard: if user-agent contains in-app browser signatures and does not match the crawler list, treat as human/browser
  if (IN_APP_BROWSER_REGEX.test(userAgent) && !CRAWLER_REGEX.test(userAgent)) {
    return false;
  }
  return CRAWLER_REGEX.test(userAgent);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function toAbsoluteImageUrl(url, defaultOrigin) {
  if (!url) return `${defaultOrigin}/meta-tag.png`;
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }
  if (url.startsWith('//')) {
    return `https:${url}`;
  }
  return `${defaultOrigin}${url.startsWith('/') ? '' : '/'}${url}`;
}

function serveSpa(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Vary', 'User-Agent');
  res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');

  const candidatePaths = [
    path.join(process.cwd(), 'dist', 'index.html'),
    path.join(process.cwd(), 'web', 'dist', 'index.html'),
    path.join(process.cwd(), 'index.html'),
    path.join(process.cwd(), 'web', 'index.html'),
  ];

  for (const filePath of candidatePaths) {
    try {
      if (fs.existsSync(filePath)) {
        const html = fs.readFileSync(filePath, 'utf8');
        if (html) {
          return res.status(200).send(html);
        }
      }
    } catch (_) {}
  }

  // Fallback if index.html cannot be located on disk
  return res.status(200).send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>ANIKA | Handcrafted Jewellery</title>
</head>
<body>
  <div id="root"></div>
  <script>window.location.replace('/');</script>
</body>
</html>`);
}

export default async function handler(req, res) {
  const { productId: queryProductId, id: queryId, from } = req.query || {};
  const productId = queryProductId || queryId || (req.url && (req.url.match(/\/product\/([^?]+)/) || [])[1]);

  const userAgent = req.headers['user-agent'] || '';
  const isFromPreview = from === 'preview' || (req.url && req.url.includes('from=preview'));

  // If accessed with ?from=preview, or by a non-crawler (e.g. Instagram in-app browser), serve the normal SPA
  if (isFromPreview || !isCrawler(userAgent)) {
    return serveSpa(res);
  }

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.anikafashion.in';
  const siteOrigin = `${proto}://${host}`;

  const defaultTitle = 'ANIKA - Handcrafted Luxury Jewellery';
  const defaultDesc = 'Discover handcrafted fashion jewellery for every occasion. Draped in elegance.';
  const defaultImage = `${siteOrigin}/meta-tag.png`;
  const canonicalUrl = productId ? `${siteOrigin}/product/${productId}` : siteOrigin;

  let title = defaultTitle;
  let description = defaultDesc;
  let imageUrl = defaultImage;

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

  if (productId && supabaseUrl && supabaseKey) {
    try {
      const restEndpoint = `${supabaseUrl}/rest/v1/products?product_id=eq.${encodeURIComponent(productId)}&is_active=eq.true&select=product_id,name,description,price,compare_price,image_url,images,product_variants(price,compare_price,stock,images)`;
      
      const response = await fetch(restEndpoint, {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          Accept: 'application/json',
        },
      });

      if (response.ok) {
        const rows = await response.json();
        const data = rows && rows[0];

        if (data) {
          const variants = data.product_variants || [];
          const hasVariants = variants.length > 0;
          const prices = variants.map(v => Number(v.price)).filter(Boolean);

          const sellingPrice = hasVariants && prices.length > 0 ? Math.min(...prices) : Number(data.price) || 0;
          const priceStr = sellingPrice ? `₹${sellingPrice.toLocaleString('en-IN')}` : '';

          const rawImage = variants.find(v => v.images?.length > 0)?.images?.[0] || data.image_url || data.images?.[0];
          imageUrl = toAbsoluteImageUrl(rawImage, siteOrigin);

          if (data.name) {
            title = `${data.name} | ANIKA`;
          }

          const cleanDesc = (data.description || '')
            .replace(/<[^>]*>/g, '')
            .replace(/\s+/g, ' ')
            .trim();

          if (priceStr && cleanDesc) {
            description = `${priceStr} - ${cleanDesc}`;
          } else if (cleanDesc) {
            description = cleanDesc;
          } else if (priceStr) {
            description = `${priceStr} - Handcrafted luxury jewellery from Anika.`;
          }

          if (description.length > 200) {
            description = `${description.slice(0, 197)}...`;
          }
        }
      }
    } catch (err) {
      console.error('[OpenGraph] Failed to fetch product metadata:', err);
    }
  }

  const previewRedirectUrl = `/product/${productId ? encodeURIComponent(productId) : ''}?from=preview`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />

  <!-- Fallback for humans landing on crawler preview: immediate client-side redirect to real SPA -->
  <meta http-equiv="refresh" content="0;url=${escapeHtml(previewRedirectUrl)}" />
  <script>window.location.replace("${escapeHtml(previewRedirectUrl)}");</script>

  <!-- Open Graph / WhatsApp / Facebook / Instagram -->
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(imageUrl)}" />
  <meta property="og:image:secure_url" content="${escapeHtml(imageUrl)}" />
  <meta property="og:url" content="${escapeHtml(canonicalUrl)}" />
  <meta property="og:type" content="product" />
  <meta property="og:site_name" content="Anika Jewellery" />

  <!-- Twitter -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${escapeHtml(title)}" />
  <meta name="twitter:description" content="${escapeHtml(description)}" />
  <meta name="twitter:image" content="${escapeHtml(imageUrl)}" />

  <link rel="canonical" href="${escapeHtml(canonicalUrl)}" />
</head>
<body>
  <h1>${escapeHtml(title)}</h1>
  <p>${escapeHtml(description)}</p>
  <p><a href="${escapeHtml(previewRedirectUrl)}">View Product</a></p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Vary', 'User-Agent');
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).send(html);
}
