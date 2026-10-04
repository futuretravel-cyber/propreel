import type { ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, Clock, Tag } from 'lucide-react';
import { PublicLayout } from '../components/PublicLayout';
import { getAllPosts, getPost, readingMinutes, type Block } from '../blog/posts';

const fmt = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

/** Inline syntax inside block text: [label](/path or https://…) and **bold**. */
function renderInline(text: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[1] && m[2]) {
      out.push(
        m[2].startsWith('http') ? (
          <a key={k++} href={m[2]} target="_blank" rel="noreferrer" className="text-purple-700 underline hover:text-purple-800">{m[1]}</a>
        ) : (
          <Link key={k++} to={m[2]} className="text-purple-700 underline hover:text-purple-800">{m[1]}</Link>
        )
      );
    } else if (m[3]) {
      out.push(<strong key={k++} className="font-bold text-gray-900">{m[3]}</strong>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function BlockView({ block }: { block: Block }) {
  switch (block.type) {
    case 'h2':
      return <h2 className="text-2xl font-bold text-gray-900 mt-10 mb-4">{renderInline(block.text)}</h2>;
    case 'h3':
      return <h3 className="text-xl font-bold text-gray-900 mt-8 mb-3">{renderInline(block.text)}</h3>;
    case 'quote':
      return (
        <blockquote className="border-l-4 border-purple-300 pl-5 my-6 italic text-gray-700">
          {renderInline(block.text)}
        </blockquote>
      );
    case 'note':
      return (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 my-8 text-purple-900">
          {renderInline(block.text)}
        </div>
      );
    case 'ul':
      return (
        <ul className="list-disc pl-6 text-gray-700 space-y-2.5 my-4 leading-relaxed">
          {block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ul>
      );
    case 'ol':
      return (
        <ol className="list-decimal pl-6 text-gray-700 space-y-2.5 my-4 leading-relaxed">
          {block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ol>
      );
    default:
      return <p className="text-gray-700 leading-relaxed my-4">{renderInline(block.text)}</p>;
  }
}

function NotFound() {
  return (
    <section className="py-20 bg-gradient-to-b from-purple-50 to-white">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-3xl font-black text-gray-900">Article not found</h1>
        <p className="text-gray-600 mt-3">That blog post does not exist (or it has been moved).</p>
        <Link to="/blog" className="btn btn-primary mt-6 inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Browse all articles
        </Link>
      </div>
    </section>
  );
}

export default function BlogPostPage() {
  const { slug } = useParams<{ slug: string }>();
  const post = slug ? getPost(slug) : undefined;

  if (!post) {
    return (
      <PublicLayout>
        <NotFound />
      </PublicLayout>
    );
  }

  const published = fmt.format(new Date(post.date));
  const minutes = readingMinutes(post);
  const related = getAllPosts()
    .filter(p => p.slug !== post.slug)
    .map(p => ({ post: p, score: p.tags.filter(t => post.tags.includes(t)).length }))
    .filter(r => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(r => r.post);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated || post.date,
    author: { '@type': 'Organization', name: 'PropReel' },
    publisher: { '@type': 'Organization', name: 'PropReel', url: 'https://www.propreel.co.za/' },
    mainEntityOfPage: `https://www.propreel.co.za/blog/${post.slug}`,
  };

  return (
    <PublicLayout>
      <section className="py-16 bg-gradient-to-b from-purple-50 to-white">
        <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <script type="application/ld+json">{JSON.stringify(jsonLd)}</script>

          <nav className="mb-6 text-sm text-gray-500" aria-label="Breadcrumb">
            <Link to="/blog" className="text-purple-700 hover:text-purple-800 inline-flex items-center gap-1.5">
              <ArrowLeft className="w-3.5 h-3.5" /> Blog
            </Link>
            <span className="mx-2">/</span>
            <span className="text-gray-600">{post.tags[0]}</span>
          </nav>

          <h1 className="text-4xl font-black text-gray-900 leading-tight">{post.title}</h1>

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 mt-4 mb-8 pb-6 border-b border-gray-200">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="w-4 h-4" /> {published}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4" /> {minutes} min read
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Tag className="w-4 h-4" /> {post.tags.join(', ')}
            </span>
          </div>

          {post.blocks.map((block, i) => <BlockView key={i} block={block} />)}

          <div className="card-light p-6 mt-10 bg-purple-50 border-purple-200">
            <p className="font-bold text-gray-900">Turn this into your next listing video</p>
            <p className="text-sm text-gray-600 mt-1.5">
              PropReel turns your listing photos into a narrated, cinematic reel in minutes — built for
              South African estate agents, priced in rand.
            </p>
            <div className="flex flex-wrap gap-3 mt-4">
              <Link to="/register" className="btn btn-primary inline-flex items-center gap-2">
                Start free — 5 credits <ArrowRight className="w-4 h-4" />
              </Link>
              <Link to="/pricing" className="btn bg-white border border-gray-300 text-gray-800 hover:bg-gray-50 inline-flex items-center">
                See pricing
              </Link>
            </div>
          </div>

          {related.length > 0 && (
            <div className="mt-12">
              <h2 className="text-lg font-bold text-gray-900 mb-4">Related articles</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {related.map(r => (
                  <Link key={r.slug} to={`/blog/${r.slug}`} className="card-light p-4 hover:shadow-md hover:border-purple-200 transition group">
                    <p className="text-xs text-gray-500 mb-1.5">{fmt.format(new Date(r.date))}</p>
                    <p className="text-sm font-semibold text-gray-900 group-hover:text-purple-700 leading-snug">{r.title}</p>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </article>
      </section>
    </PublicLayout>
  );
}
