import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const DEFAULT_ORIGIN = 'https://www.anikafashion.in';
const DEFAULT_TITLE = 'ANIKA | Handcrafted Luxury Jewellery';
const DEFAULT_DESCRIPTION =
  'Discover handcrafted luxury fashion jewellery for every occasion. Shop earrings, rings, necklaces, bangles, anklets, and bridal collections draped in elegance at ANIKA.';
const DEFAULT_KEYWORDS =
  'handcrafted jewellery, luxury fashion jewellery, bridal jewellery, necklaces, bangles, rings, earrings, anklets, Indian jewellery online, ANIKA fashion jewellery';
const DEFAULT_IMAGE = `${DEFAULT_ORIGIN}/meta-tag.png`;

function toAbsoluteUrl(url) {
  if (!url) return DEFAULT_IMAGE;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (url.startsWith('//')) return `https:${url}`;
  return `${DEFAULT_ORIGIN}${url.startsWith('/') ? '' : '/'}${url}`;
}

function setMetaTag(attrName, attrValue, content) {
  if (content === undefined || content === null) return;
  let el = document.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attrName, attrValue);
    document.head.appendChild(el);
  }
  el.setAttribute('content', String(content));
}

function removeMetaTag(attrName, attrValue) {
  const el = document.querySelector(`meta[${attrName}="${attrValue}"]`);
  if (el) el.remove();
}

function setLinkTag(rel, href) {
  if (!href) return;
  let el = document.querySelector(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement('link');
    el.setAttribute('rel', rel);
    document.head.appendChild(el);
  }
  el.setAttribute('href', href);
}

/**
 * High-Level SEO Component for ANIKA Jewellery.
 * Manages dynamic document title, description, keywords, canonical URLs,
 * OpenGraph, Twitter Cards, robots directives, and JSON-LD structured schemas.
 */
export default function SEO({
  title,
  description,
  keywords,
  canonical,
  ogType = 'website',
  ogImage,
  noindex = false,
  product = null,
  breadcrumbs = null,
  schema = null,
}) {
  const location = useLocation();

  useEffect(() => {
    // 1. Format Title
    let formattedTitle = DEFAULT_TITLE;
    if (title) {
      if (title.toLowerCase().includes('anika')) {
        formattedTitle = title;
      } else {
        formattedTitle = `${title} | ANIKA Jewellery`;
      }
    }
    document.title = formattedTitle;

    // 2. Format Description & Keywords
    const finalDescription = description || DEFAULT_DESCRIPTION;
    let finalKeywords = DEFAULT_KEYWORDS;
    if (keywords) {
      finalKeywords = Array.isArray(keywords) ? keywords.join(', ') : keywords;
    }

    setMetaTag('name', 'description', finalDescription);
    setMetaTag('name', 'keywords', finalKeywords);

    // 3. Robots directive
    if (noindex) {
      setMetaTag('name', 'robots', 'noindex, nofollow');
    } else {
      setMetaTag(
        'name',
        'robots',
        'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1'
      );
    }

    // 4. Canonical URL
    const canonicalPath = canonical || location.pathname;
    const finalCanonicalUrl = toAbsoluteUrl(canonicalPath);
    setLinkTag('canonical', finalCanonicalUrl);

    // 5. Open Graph Meta Tags
    const finalImage = toAbsoluteUrl(ogImage || DEFAULT_IMAGE);
    setMetaTag('property', 'og:site_name', 'ANIKA Jewellery');
    setMetaTag('property', 'og:type', product ? 'product' : ogType);
    setMetaTag('property', 'og:title', formattedTitle);
    setMetaTag('property', 'og:description', finalDescription);
    setMetaTag('property', 'og:url', finalCanonicalUrl);
    setMetaTag('property', 'og:image', finalImage);
    setMetaTag('property', 'og:image:secure_url', finalImage);
    setMetaTag('property', 'og:locale', 'en_IN');

    // Product-specific OG tags
    if (product) {
      if (product.price) {
        setMetaTag('property', 'product:price:amount', product.price);
        setMetaTag('property', 'product:price:currency', product.currency || 'INR');
      }
      setMetaTag(
        'property',
        'product:availability',
        product.inStock === false ? 'oos' : 'instock'
      );
      if (product.category) {
        setMetaTag('property', 'product:category', product.category);
      }
    } else {
      removeMetaTag('property', 'product:price:amount');
      removeMetaTag('property', 'product:price:currency');
      removeMetaTag('property', 'product:availability');
      removeMetaTag('property', 'product:category');
    }

    // 6. Twitter Card Meta Tags
    setMetaTag('name', 'twitter:card', 'summary_large_image');
    setMetaTag('name', 'twitter:title', formattedTitle);
    setMetaTag('name', 'twitter:description', finalDescription);
    setMetaTag('name', 'twitter:image', finalImage);

    // 7. Structured Data (JSON-LD)
    const jsonLdSchemas = [];

    // BreadcrumbList Schema
    if (breadcrumbs && Array.isArray(breadcrumbs) && breadcrumbs.length > 0) {
      jsonLdSchemas.push({
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: breadcrumbs.map((crumb, idx) => ({
          '@type': 'ListItem',
          position: idx + 1,
          name: crumb.name,
          item: toAbsoluteUrl(crumb.path || '/'),
        })),
      });
    }

    // Product Schema
    if (product) {
      const productImages = Array.isArray(product.images) && product.images.length > 0
        ? product.images.map(toAbsoluteUrl)
        : [finalImage];

      const productSchema = {
        '@context': 'https://schema.org/',
        '@type': 'Product',
        name: product.name || title,
        image: productImages,
        description: product.description || finalDescription,
        sku: product.sku || product.id || String(product.productId || ''),
        brand: {
          '@type': 'Brand',
          name: 'ANIKA',
        },
        offers: {
          '@type': 'Offer',
          url: finalCanonicalUrl,
          priceCurrency: product.currency || 'INR',
          price: product.price || 0,
          itemCondition: 'https://schema.org/NewCondition',
          availability:
            product.inStock === false
              ? 'https://schema.org/OutOfStock'
              : 'https://schema.org/InStock',
          seller: {
            '@type': 'Organization',
            name: 'ANIKA Jewellery',
          },
        },
      };

      if (product.category) {
        productSchema.category = product.category;
      }

      jsonLdSchemas.push(productSchema);
    }

    // Custom Schema (if passed)
    if (schema) {
      if (Array.isArray(schema)) {
        jsonLdSchemas.push(...schema);
      } else {
        jsonLdSchemas.push(schema);
      }
    }

    // Inject JSON-LD Script tag
    let scriptEl = document.getElementById('anika-page-jsonld');
    if (jsonLdSchemas.length > 0) {
      if (!scriptEl) {
        scriptEl = document.createElement('script');
        scriptEl.id = 'anika-page-jsonld';
        scriptEl.type = 'application/ld+json';
        document.head.appendChild(scriptEl);
      }
      scriptEl.textContent = JSON.stringify(
        jsonLdSchemas.length === 1 ? jsonLdSchemas[0] : jsonLdSchemas
      );
    } else if (scriptEl) {
      scriptEl.remove();
    }

    // Cleanup on unmount or navigation change
    return () => {
      const el = document.getElementById('anika-page-jsonld');
      if (el) el.remove();
    };
  }, [
    title,
    description,
    keywords,
    canonical,
    ogType,
    ogImage,
    noindex,
    product,
    breadcrumbs,
    schema,
    location.pathname,
  ]);

  return null;
}

