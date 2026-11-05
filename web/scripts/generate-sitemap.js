#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const siteOrigin = 'https://www.anikafashion.in';
const todayStr = new Date().toISOString().split('T')[0];

const defaultCategories = [
  'rings',
  'earrings',
  'necklaces',
  'bangles',
  'bracelets',
  'anklets',
  'toe-rings',
  'hip-accessories',
];

const policyPages = ['terms', 'privacy'];

let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n`;

// Homepage
xml += `  <url>\n`;
xml += `    <loc>${siteOrigin}/</loc>\n`;
xml += `    <lastmod>${todayStr}</lastmod>\n`;
xml += `    <changefreq>daily</changefreq>\n`;
xml += `    <priority>1.0</priority>\n`;
xml += `    <image:image>\n`;
xml += `      <image:loc>${siteOrigin}/meta-tag.png</image:loc>\n`;
xml += `      <image:title>ANIKA - Handcrafted Luxury Jewellery</image:title>\n`;
xml += `    </image:image>\n`;
xml += `  </url>\n`;

// Categories
for (const cat of defaultCategories) {
  xml += `  <url>\n`;
  xml += `    <loc>${siteOrigin}/${cat}</loc>\n`;
  xml += `    <lastmod>${todayStr}</lastmod>\n`;
  xml += `    <changefreq>daily</changefreq>\n`;
  xml += `    <priority>0.9</priority>\n`;
  xml += `  </url>\n`;
}

// Policies
for (const p of policyPages) {
  xml += `  <url>\n`;
  xml += `    <loc>${siteOrigin}/${p}</loc>\n`;
  xml += `    <lastmod>${todayStr}</lastmod>\n`;
  xml += `    <changefreq>monthly</changefreq>\n`;
  xml += `    <priority>0.3</priority>\n`;
  xml += `  </url>\n`;
}

xml += `</urlset>\n`;

const outPath = path.resolve(__dirname, '../public/sitemap.xml');
fs.writeFileSync(outPath, xml, 'utf8');
console.log(`[SEO] Static sitemap successfully generated at ${outPath}`);

