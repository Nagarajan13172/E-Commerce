interface SeoProps {
  title: string;
  description?: string;
  canonical?: string;
  image?: string;
  type?: 'website' | 'product' | 'article';
  noIndex?: boolean;
  /** JSON-LD structured data — Product, BreadcrumbList, Organization. */
  jsonLd?: Record<string, unknown> | Record<string, unknown>[];
}

/**
 * Page metadata.
 *
 * React 19 hoists `<title>`, `<meta>` and `<link>` to the document head from
 * anywhere in the tree, so no helmet library is needed — one fewer dependency,
 * and one fewer thing to keep in sync with React's own rendering.
 *
 * The honest limitation: this is a client-rendered app, so the tags exist only
 * after hydration. Googlebot executes JavaScript and will see them; many other
 * crawlers and most social-media unfurlers do not. JSON-LD, clean slugs and the
 * server-rendered sitemap carry most of the SEO weight, and full crawler parity
 * would need prerendering or SSR — which the feature/service split here keeps
 * possible without a rewrite.
 */
export function Seo({
  title,
  description,
  canonical,
  image,
  type = 'website',
  noIndex = false,
  jsonLd,
}: SeoProps) {
  const fullTitle = title.includes('Aurora') ? title : `${title} | Aurora`;
  const url = canonical ?? (typeof window !== 'undefined' ? window.location.href : undefined);
  const blocks = jsonLd ? (Array.isArray(jsonLd) ? jsonLd : [jsonLd]) : [];

  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {url && <link rel="canonical" href={url} />}
      {noIndex && <meta name="robots" content="noindex, nofollow" />}

      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      <meta property="og:type" content={type} />
      {url && <meta property="og:url" content={url} />}
      {image && <meta property="og:image" content={image} />}

      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}

      {blocks.map((block, index) => (
        <script
          key={index}
          type="application/ld+json"
          // Structured data must be a raw JSON string; it is built from our own
          // API responses, and JSON.stringify escapes any embedded markup.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
