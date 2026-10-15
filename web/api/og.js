// Vercel Serverless Function to serve Open Graph preview tags for social crawlers

const CRAWLER_USER_AGENTS = [
  'whatsapp',
  'facebookexternalhit',
  'facebot',
  'twitterbot',
  'instagram',
  'telegrambot',
  'linkedinbot',
  'slackbot',
];

function isCrawler(userAgent = '') {
  const ua = userAgent.toLowerCase();
  return CRAWLER_USER_AGENTS.some((bot) => ua.includes(bot));
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

export default async function handler(req, res) {
  const { productId: queryProductId, id: queryId } = req.query || {};
  const productId = queryProductId || queryId || (req.url && (req.url.match(/\/product\/([^?]+)/) || [])[1]);

  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.anikafashion.in';
  const siteOrigin = `${proto}://${host}`;

  const defaultTitle = 'ANIKA - Handcrafted Luxury Jewellery';
  const defaultDesc = 'Discover handcrafted fashion jewellery for every occasion. Draped in elegance.';
  const defaultImage = `${siteOrigin}/meta-tag.png`;
  const canonicalUrl = productId ? `${siteOrigin}/product/${productId}` : siteOrigin;

  // If accessed directly by a non-crawler browser, redirect to the client-side SPA route
  const userAgent = req.headers['user-agent'] || '';
  if (!isCrawler(userAgent) && req.headers.accept?.includes('text/html') && productId) {
    res.setHeader('Location', `/product/${productId}`);
    return res.status(302).end();
  }

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

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />

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
  <p><a href="${escapeHtml(canonicalUrl)}">View Product</a></p>
</body>
</html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
  return res.status(200).send(html);
}
