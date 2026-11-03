import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { CREDIT_PACK_RAND } from '../../lib/renderPricing';
import { SIGNUP_BONUS } from './constants';

/**
 * Per-route SEO for the SPA. Crawlers get the same index.html for every URL,
 * so we update <title>, description, canonical and OG tags client-side as the
 * route changes. (Google renders JS; social scrapers mostly hit the homepage,
 * which keeps the static tags in index.html.)
 */

const SITE = 'https://www.propreel.co.za';
const SUFFIX = 'PropReel';
const DEFAULT_OG_IMAGE = `${SITE}/images/og-default.png`;
const OG_IMAGE_WIDTH = 1200;
const OG_IMAGE_HEIGHT = 630;

interface SeoEntry {
  title: string;
  description: string;
  /** Extra OG type; defaults to website. */
  type?: string;
  noindex?: boolean;
  /** Short label used in the BreadcrumbList and for JSON-LD. */
  crumb?: string;
}

/**
 * Routes that answer on more than one URL. The canonical tag always points at
 * the first one, so /signup and /register never compete as duplicates.
 */
const CANONICAL_ALIASES: Record<string, string> = {
  '/signup': '/register',
  '/payment/callback': '/payment',
};

/** `/pricing/` -> `/pricing`; root stays `/`. */
function canonicalPath(pathname: string) {
  const clean = pathname.replace(/\/+$/, '') || '/';
  return CANONICAL_ALIASES[clean] ?? clean;
}

const ROUTES: Record<string, SeoEntry> = {
  '/': {
    title: `PropReel — Create Stunning Property Videos Instantly with AI`,
    description:
      `Turn property photos into cinematic, narrated listing reels in minutes. Built for South African estate agents — start free with ${SIGNUP_BONUS} credits, no card.`,
  },
  '/pricing': {
    title: `Pricing — Pay per video in ZAR | ${SUFFIX}`,
    description:
      `Simple credit-based pricing for South African estate agents. From R${CREDIT_PACK_RAND.toFixed(2)} per credit. No subscriptions required — buy credits, render reels, pay only for what you use.`,
  },
  '/reviews': {
    title: `Reviews — What SA estate agents say | ${SUFFIX}`,
    description:
      'Real reviews from South African estate agents using PropReel to turn listing photos into cinematic video reels in minutes.',
  },
  '/about': {
    title: `About us | ${SUFFIX}`,
    description:
      'PropReel is built in South Africa for estate agents who want professional listing videos without studio time, editors or hefty production costs.',
  },
  '/contact': {
    title: `Contact us | ${SUFFIX}`,
    description:
      'Get in touch with the PropReel team — questions about credits, rendering, billing or partnerships for South African estate agents.',
  },
  '/faq': {
    title: `FAQ — Credits, renders, storage and billing | ${SUFFIX}`,
    description:
      'Answers to the questions South African estate agents ask about PropReel: how credits work, what each render costs, how long media is kept, billing and subscriptions.',
  },
  '/tutorial': {
    title: `Tutorial — How to make a property reel | ${SUFFIX}`,
    description:
      'Watch a step-by-step tutorial: upload listing photos, pick a tier and voice, and render a narrated property reel in minutes.',
  },
  '/blog': {
    title: `Blog — Property marketing tips for SA estate agents | ${SUFFIX}`,
    description:
      'Practical guides for South African estate agents: property video marketing, social media playbooks, virtual staging, WhatsApp marketing and AI tools.',
  },
  '/status': {
    title: `System status | ${SUFFIX}`,
    description: 'Live uptime and render-pipeline status for the PropReel platform.',
  },
  '/login': {
    title: `Sign in | ${SUFFIX}`,
    description: 'Sign in to your PropReel account to create and manage property video reels.',
  },
  '/register': {
    title: `Sign up free — ${SIGNUP_BONUS} credits | ${SUFFIX}`,
    description:
      `Create a free PropReel account and get ${SIGNUP_BONUS} credits instantly. Turn property photos into cinematic listing reels in minutes.`,
  },
  '/signup': {
    title: `Sign up free — ${SIGNUP_BONUS} credits | ${SUFFIX}`,
    description:
      `Create a free PropReel account and get ${SIGNUP_BONUS} credits instantly. Turn property photos into cinematic listing reels in minutes.`,
  },
  '/terms': { title: `Terms of Service | ${SUFFIX}`, description: 'Terms of Service for the PropReel platform.' },
  '/privacy': { title: `Privacy Policy | ${SUFFIX}`, description: 'How PropReel collects, uses and protects your personal information (POPIA).' },
  '/cookies': { title: `Cookie Policy | ${SUFFIX}`, description: 'Cookies used by PropReel and how to manage them.' },
  '/paia': { title: `PAIA Manual | ${SUFFIX}`, description: 'Promotion of Access to Information Act manual for PropReel.' },
  '/refund-policy': { title: `Refund Policy | ${SUFFIX}`, description: 'Refund policy for PropReel credits and purchases.' },
  '/ai-notice': { title: `Full AI Notice | ${SUFFIX}`, description: 'Where and how PropReel uses AI to generate videos, photos and text, what AI mistakes can look like, and how credits for AI renders are priced and refunded.' },
  '/dpa': { title: `Data Processing Agreement | ${SUFFIX}`, description: 'Data processing agreement for PropReel customers.' },
  '/forgot-password': { title: `Forgot password | ${SUFFIX}`, description: 'Request a secure link to reset your PropReel password.' },
  '/reset-password': { title: `Reset password | ${SUFFIX}`, description: 'Set a new password for your PropReel account.' },
  '/confirm-email': { title: `Confirm your email | ${SUFFIX}`, description: 'Confirm your email address to activate your PropReel account.' },
};

/** Authenticated app areas — keep them out of the index. */
const NOINDEX_PREFIXES = ['/dashboard', '/admin', '/studio', '/payment', '/2fa-setup', '/agency'];

function setMeta(selector: string, attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

function setCanonical(href: string) {
  let el = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'canonical';
    document.head.appendChild(el);
  }
  el.href = href;
}

/** Replace (or drop, when `data` is null) one managed JSON-LD block. */
function setJsonLd(id: string, data: unknown | null) {
  const selector = `script[data-seo-jsonld="${id}"]`;
  const existing = document.head.querySelector<HTMLScriptElement>(selector);
  if (!data) {
    existing?.remove();
    return;
  }
  const el = existing ?? document.createElement('script');
  if (!existing) {
    el.type = 'application/ld+json';
    el.dataset.seoJsonld = id;
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}

/** Home > Pricing, Home > Blog > <post title>. */
function breadcrumbs(trail: Array<{ name: string; path: string }>) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: 'Home', path: '/' }, ...trail].map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE}${item.path}`,
    })),
  };
}

/** Breadcrumb label from the page title: "Pricing — Pay per video | PropReel" -> "Pricing". */
function crumbLabel(entry: SeoEntry) {
  return entry.crumb ?? entry.title.split('|')[0].split('—')[0].trim();
}

/** ` /dashboard/billing ` -> `Billing` — readable tab titles for app areas. */
function humanize(pathname: string) {
  const parts = pathname.split('/').filter(Boolean);
  if (!parts.length) return SUFFIX;
  const seg =
    [...parts].reverse().find(p => !p.includes('_') && !/^\d+$/.test(p)) ?? parts[parts.length - 1];
  return seg.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

export function RouteSEO() {
  const { pathname } = useLocation();

  useEffect(() => {
    const path = canonicalPath(pathname);
    const url = `${SITE}${path}`;

    const apply = (opts: {
      title: string;
      description: string;
      noindex: boolean;
      type?: string;
      image?: string;
    }) => {
      const { title, description, noindex } = opts;
      const image = opts.image ?? DEFAULT_OG_IMAGE;

      document.title = title;
      setMeta('meta[name="description"]', 'name', 'description', description);
      setCanonical(url);

      setMeta('meta[property="og:type"]', 'property', 'og:type', opts.type ?? 'website');
      setMeta('meta[property="og:site_name"]', 'property', 'og:site_name', SUFFIX);
      setMeta('meta[property="og:locale"]', 'property', 'og:locale', 'en_ZA');
      setMeta('meta[property="og:title"]', 'property', 'og:title', title);
      setMeta('meta[property="og:description"]', 'property', 'og:description', description);
      setMeta('meta[property="og:url"]', 'property', 'og:url', url);
      setMeta('meta[property="og:image"]', 'property', 'og:image', image);
      setMeta('meta[property="og:image:width"]', 'property', 'og:image:width', String(OG_IMAGE_WIDTH));
      setMeta('meta[property="og:image:height"]', 'property', 'og:image:height', String(OG_IMAGE_HEIGHT));
      setMeta('meta[property="og:image:alt"]', 'property', 'og:image:alt', title);
      setMeta('meta[name="twitter:card"]', 'name', 'twitter:card', 'summary_large_image');
      setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
      setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
      setMeta('meta[name="twitter:image"]', 'name', 'twitter:image', image);
      setMeta('meta[name="twitter:image:alt"]', 'name', 'twitter:image:alt', title);
      setMeta('meta[name="robots"]', 'name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    };

    const entry = ROUTES[pathname];
    const noindex = entry?.noindex || NOINDEX_PREFIXES.some(p => path === p || path.startsWith(p + '/'));

    if (entry) {
      apply({ title: entry.title, description: entry.description, noindex });
      setJsonLd(
        'breadcrumb',
        noindex || path === '/'
          ? null
          : breadcrumbs([{ name: crumbLabel(entry), path }])
      );
      setJsonLd(
        'pricing-offers',
        path === '/pricing'
          ? {
              '@context': 'https://schema.org',
              '@type': 'Product',
              name: 'PropReel credits',
              description:
                'Prepaid rendering credits for AI property videos, priced in South African rand.',
              brand: { '@type': 'Brand', name: SUFFIX },
              offers: {
                '@type': 'Offer',
                price: CREDIT_PACK_RAND.toFixed(2),
                priceCurrency: 'ZAR',
                availability: 'https://schema.org/InStock',
                url,
                priceSpecification: {
                  '@type': 'UnitPriceSpecification',
                  price: CREDIT_PACK_RAND.toFixed(2),
                  priceCurrency: 'ZAR',
                  referenceQuantity: { '@type': 'QuantitativeValue', value: 1, unitCode: 'C62' },
                },
              },
            }
          : null
      );
      return;
    }

    // /blog/<slug> — post meta lives in the blog chunk, so resolve it via
    // dynamic import; this keeps post titles/descriptions out of the main bundle.
    const blogMatch = pathname.match(/^\/blog\/([^/]+)\/?$/);
    if (blogMatch) {
      const slug = decodeURIComponent(blogMatch[1]);
      apply({
        title: `Blog | ${SUFFIX}`,
        description: 'Property marketing guides for South African estate agents.',
        noindex: false,
        type: 'article',
        image: DEFAULT_OG_IMAGE,
      });
      setJsonLd('breadcrumb', breadcrumbs([{ name: 'Blog', path: '/blog' }]));
      setJsonLd('pricing-offers', null);
      let cancelled = false;
      import('../blog/posts')
        .then(m => {
          if (cancelled) return;
          const post = m.getPost(slug);
          if (post) {
            apply({
              title: `${post.title} | ${SUFFIX}`,
              description: post.description,
              noindex: false,
              type: 'article',
              image: DEFAULT_OG_IMAGE,
            });
            setCanonical(`${SITE}/blog/${post.slug}`);
            setJsonLd(
              'breadcrumb',
              breadcrumbs([
                { name: 'Blog', path: '/blog' },
                { name: post.title, path: `/blog/${post.slug}` },
              ])
            );
          } else {
            apply({
              title: `Article not found | ${SUFFIX}`,
              description: 'That blog post does not exist on PropReel.',
              noindex: true,
            });
            setJsonLd('breadcrumb', null);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }

    // Fallback for paths without a ROUTES entry: a real dashboard route
    // (e.g. /dashboard/video) gets its readable tab title from humanize().
    // Everything else is a 404 and is always noindex — indexing rendered
    // 404s is what creates soft-404 results in Search Console. The 404 page
    // (pages/NotFoundPage) then overwrites document.title with the canonical
    // "Page not found" in its own effect, which runs after this one.
    setJsonLd('pricing-offers', null);
    setJsonLd('breadcrumb', null);
    apply({
      title: noindex ? `${humanize(pathname)} | ${SUFFIX}` : `Page not found | ${SUFFIX}`,
      description: 'The page you were looking for does not exist on PropReel.',
      noindex: true,
    });
  }, [pathname]);

  return null;
}
