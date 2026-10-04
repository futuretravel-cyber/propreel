import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Per-route SEO for the SPA. Crawlers get the same index.html for every URL,
 * so we update <title>, description, canonical and OG tags client-side as the
 * route changes. (Google renders JS; social scrapers mostly hit the homepage,
 * which keeps the static tags in index.html.)
 */

const SITE = 'https://www.propreel.co.za';
const SUFFIX = 'PropReel';

interface SeoEntry {
  title: string;
  description: string;
  /** Extra OG type; defaults to website. */
  type?: string;
  noindex?: boolean;
}

const ROUTES: Record<string, SeoEntry> = {
  '/': {
    title: `PropReel — Create Stunning Property Videos Instantly with AI`,
    description:
      'PropReel turns your property photos into cinematic, narrated listing reels in minutes. Built for South African estate agents. 5 Free Credits on Signup.',
  },
  '/pricing': {
    title: `Pricing — Pay per video in ZAR | ${SUFFIX}`,
    description:
      'Simple credit-based pricing for South African estate agents. From R1 per credit. No subscriptions required — buy credits, render reels, pay only for what you use.',
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
    title: `Sign up free — 5 credits | ${SUFFIX}`,
    description:
      'Create a free PropReel account and get 5 credits instantly. Turn property photos into cinematic listing reels in minutes.',
  },
  '/signup': {
    title: `Sign up free — 5 credits | ${SUFFIX}`,
    description:
      'Create a free PropReel account and get 5 credits instantly. Turn property photos into cinematic listing reels in minutes.',
  },
  '/terms': { title: `Terms of Service | ${SUFFIX}`, description: 'Terms of Service for the PropReel platform.' },
  '/privacy': { title: `Privacy Policy | ${SUFFIX}`, description: 'How PropReel collects, uses and protects your personal information (POPIA).' },
  '/cookies': { title: `Cookie Policy | ${SUFFIX}`, description: 'Cookies used by PropReel and how to manage them.' },
  '/paia': { title: `PAIA Manual | ${SUFFIX}`, description: 'Promotion of Access to Information Act manual for PropReel.' },
  '/refund-policy': { title: `Refund Policy | ${SUFFIX}`, description: 'Refund policy for PropReel credits and purchases.' },
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
    const apply = (title: string, description: string, noindex: boolean) => {
      document.title = title;
      setMeta('meta[name="description"]', 'name', 'description', description);
      setCanonical(`${SITE}${pathname}`);

      setMeta('meta[property="og:title"]', 'property', 'og:title', title);
      setMeta('meta[property="og:description"]', 'property', 'og:description', description);
      setMeta('meta[property="og:url"]', 'property', 'og:url', `${SITE}${pathname}`);
      setMeta('meta[name="twitter:title"]', 'name', 'twitter:title', title);
      setMeta('meta[name="twitter:description"]', 'name', 'twitter:description', description);
      setMeta('meta[name="robots"]', 'name', 'robots', noindex ? 'noindex, nofollow' : 'index, follow');
    };

    const entry = ROUTES[pathname];
    const noindex = entry?.noindex || NOINDEX_PREFIXES.some(p => pathname === p || pathname.startsWith(p + '/'));

    if (entry) {
      apply(entry.title, entry.description, noindex);
      return;
    }

    // /blog/<slug> — post meta lives in the blog chunk, so resolve it via
    // dynamic import; this keeps post titles/descriptions out of the main bundle.
    const blogMatch = pathname.match(/^\/blog\/([^/]+)\/?$/);
    if (blogMatch) {
      apply(`Blog | ${SUFFIX}`, 'Property marketing guides for South African estate agents.', false);
      let cancelled = false;
      import('../blog/posts')
        .then(m => {
          if (cancelled) return;
          const post = m.getPost(decodeURIComponent(blogMatch[1]));
          if (post) {
            apply(`${post.title} | ${SUFFIX}`, post.description, false);
          } else {
            apply(`Article not found | ${SUFFIX}`, 'That blog post does not exist on PropReel.', true);
          }
        })
        .catch(() => {});
      return () => {
        cancelled = true;
      };
    }

    apply(
      noindex ? `${humanize(pathname)} | ${SUFFIX}` : `Page not found | ${SUFFIX}`,
      'The page you were looking for does not exist on PropReel.',
      noindex
    );
  }, [pathname]);

  return null;
}
