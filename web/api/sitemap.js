import fs from 'fs';
import path from 'path';

function escapeXml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(dateStr) {
  try {
    const d = dateStr ? new Date(dateStr) : new Date();
    if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
    return d.toISOString().split('T')[0];
  } catch (_) {
    return new Date().toISOString().split('T')[0];
  }
}

export default async function handler(req, res) {
  const proto = req.headers['x-forwarded-proto'] || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'www.anikafashion.in';
  const siteOrigin = `${proto}://${host}`;

  const defaultCategories = [
    { loc: `${siteOrigin}/rings`, priority: '0.9', changefreq: 'daily' },
    { loc: `${siteOrigin}/earrings`, priority: '0.9', changefreq: 'daily' },
    { loc: `${siteOrigin}/necklaces`, priority: '0.9', changefreq: 'daily' },
    { loc: `${siteOrigin}/bangles`, priority: '0.9', changefreq: 'daily' },
    { loc: `${siteOrigin}/bracelets`, priority: '0.9', changefreq: 'daily' },
    { loc: `${siteOrigin}/anklets`, priority: '0.8', changefreq: 'daily' },
    { loc: `${siteOrigin}/toe-rings`, priority: '0.8', changefreq: 'daily' },
    { loc: `${siteOrigin}/hip-accessories`, priority: '0.8', changefreq: 'daily' },
  ];

  const policyPages = [
    { loc: `${siteOrigin}/terms`, priority: '0.3', changefreq: 'monthly' },
    { loc: `${siteOrigin}/privacy`, priority: '0.3', changefreq: 'monthly' },
  ];

  const supabaseUrl = (process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '').trim();
  const supabaseKey = (process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '').trim();

  let products = [];
  let customCategories = [];

  if (supabaseUrl && supabaseKey) {
    try {
      const [prodRes, catRes] = await Promise.all([
        fetch(
          `${supabaseUrl}/rest/v1/products?is_active=eq.true&select=product_id,name,updated_at,image_url,images&limit=5000`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              Accept: 'application/json',
            },
          }
        ),
        fetch(
          `${supabaseUrl}/rest/v1/categories?select=name,slug,updated_at&limit=500`,
          {
            headers: {
              apikey: supabaseKey,
              Authorization: `Bearer ${supabaseKey}`,
              Accept: 'application/json',
            },
          }
        ),
      ]);

      if (prodRes.ok) {
        products = await prodRes.json();
      }
      if (catRes.ok) {
        customCategories = await catRes.json();
      }
    } catch (err) {
      console.error('[Sitemap] Failed to fetch dynamic database records:', err);
    }
  }

  const todayStr = formatDate(new Date());

  let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
  xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

  // Homepage
  xml += `  <url>\n`;
  xml += `    <loc>${escapeXml(siteOrigin)}/</loc>\n`;
  xml += `    <lastmod>${todayStr}</lastmod>\n`;
  xml += `    <changefreq>daily</changefreq>\n`;
  xml += `    <priority>1.0</priority>\n`;
  xml += `    <image:image>\n`;
  xml += `      <image:loc>${escapeXml(siteOrigin)}/meta-tag.png</image:loc>\n`;
  xml += `      <image:title>ANIKA - Handcrafted Luxury Jewellery</image:title>\n`;
  xml += `    </image:image>\n`;
  xml += `  </url>\n`;

  // Base Categories
  for (const cat of defaultCategories) {
    xml += `  <url>\n`;
    xml += `    <loc>${escapeXml(cat.loc)}</loc>\n`;
    xml += `    <lastmod>${todayStr}</lastmod>\n`;
    xml += `    <changefreq>${cat.changefreq}</changefreq>\n`;
    xml += `    <priority>${cat.priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  // Dynamic Custom Categories
  const existingSlugs = new Set([
    'rings',
    'earrings',
    'necklaces',
    'bangles',
    'bracelets',
    'anklets',
    'toe-rings',
    'hip-accessories',
  ]);

  if (Array.isArray(customCategories)) {
    for (const c of customCategories) {
      const slug = (c.slug || c.name || '')
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')
        .replace(/[^a-z0-9-]/g, '');

      if (!slug || existingSlugs.has(slug)) continue;
      existingSlugs.add(slug);

      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(`${siteOrigin}/category/${slug}`)}</loc>\n`;
      xml += `    <lastmod>${formatDate(c.updated_at)}</lastmod>\n`;
      xml += `    <changefreq>daily</changefreq>\n`;
      xml += `    <priority>0.85</priority>\n`;
      xml += `  </url>\n`;
    }
  }

  // Products
  if (Array.isArray(products)) {
    for (const p of products) {
      const pid = p.product_id;
      if (!pid) continue;

      const pUrl = `${siteOrigin}/product/${encodeURIComponent(pid)}`;
      const pImage = (Array.isArray(p.images) && p.images[0]) || p.image_url;

      xml += `  <url>\n`;
      xml += `    <loc>${escapeXml(pUrl)}</loc>\n`;
      xml += `    <lastmod>${formatDate(p.updated_at)}</lastmod>\n`;
      xml += `    <changefreq>weekly</changefreq>\n`;
      xml += `    <priority>0.8</priority>\n`;

      if (pImage) {
        const fullImg = pImage.startsWith('http')
          ? pImage
          : `${siteOrigin}${pImage.startsWith('/') ? '' : '/'}${pImage}`;
        xml += `    <image:image>\n`;
        xml += `      <image:loc>${escapeXml(fullImg)}</image:loc>\n`;
        if (p.name) {
          xml += `      <image:title>${escapeXml(p.name)}</image:title>\n`;
        }
        xml += `    </image:image>\n`;
      }

      xml += `  </url>\n`;
    }
  }

  // Policy Pages
  for (const page of policyPages) {
    xml += `  <url>\n`;
    xml += `    <loc>${escapeXml(page.loc)}</loc>\n`;
    xml += `    <lastmod>${todayStr}</lastmod>\n`;
    xml += `    <changefreq>${page.changefreq}</changefreq>\n`;
    xml += `    <priority>${page.priority}</priority>\n`;
    xml += `  </url>\n`;
  }

  xml += `</urlset>`;

  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).send(xml);
}

