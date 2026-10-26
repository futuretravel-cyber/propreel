import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Clock, Newspaper } from 'lucide-react';
import { PublicLayout } from '../components/PublicLayout';
import { getAllPosts, readingMinutes } from '../blog/posts';
import { SIGNUP_BONUS } from '../lib/constants';

const fmt = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' });

export default function BlogIndexPage() {
  const posts = getAllPosts();

  return (
    <PublicLayout>
      <section className="py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-12 h-12 rounded-xl bg-purple-500/15 flex items-center justify-center">
              <Newspaper className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <h1 className="text-4xl font-black text-white">PropReel Blog</h1>
              <p className="text-sm text-ink-400 mt-1">Marketing playbooks for South African estate agents</p>
            </div>
          </div>

          <p className="text-lg text-ink-400 leading-relaxed mb-10">
            Practical guides on property video marketing, social media, virtual staging and AI tools —
            written for the South African market, with rand prices and portal rules that actually apply here.
          </p>

          <div className="space-y-6">
            {posts.map(post => (
              <Link
                key={post.slug}
                to={`/blog/${post.slug}`}
                className="block card-dark p-6 hover:border-purple-500/40 transition group"
              >
                <div className="flex flex-wrap items-center gap-4 text-xs text-ink-400 mb-3">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarDays className="w-3.5 h-3.5" /> {fmt.format(new Date(post.date))}
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> {readingMinutes(post)} min read
                  </span>
                  {post.tags.map(t => (
                    <span key={t} className="px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 font-medium">{t}</span>
                  ))}
                </div>
                <h2 className="text-xl font-bold text-white group-hover:text-purple-300 transition">{post.title}</h2>
                <p className="text-ink-400 mt-2 leading-relaxed">{post.description}</p>
                <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-purple-400 mt-3">
                  Read article <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition" />
                </span>
              </Link>
            ))}
          </div>

          <div className="mt-12 card-dark p-6 bg-purple-500/10 border-purple-500/30 text-center">
            <p className="font-semibold text-white">Put the playbook to work</p>
            <p className="text-sm text-ink-400 mt-1">
              Turn your next listing’s photos into a narrated property video — free to try.
            </p>
            <Link to="/register" className="btn btn-primary mt-4 inline-flex items-center gap-2">
              Start free — your first {SIGNUP_BONUS} credits are on us, no card needed <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </PublicLayout>
  );
}
