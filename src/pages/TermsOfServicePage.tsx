import { Link } from 'react-router-dom';
import { ArrowLeft, Shield, FileText, Mail } from 'lucide-react';
import {
  TERMS_FOOTER,
  TERMS_INTRO_NOTICE,
  TERMS_LAST_UPDATED,
  TERMS_SECTIONS,
  TermsBlock,
  TermsInline,
} from '../lib/termsContent';

/**
 * Terms of Service — rendered entirely from lib/termsContent.ts so the copy
 * exists in exactly one place. That data module flattens the same content
 * into TERMS_FULL_TEXT and hashes it (TERMS_CONSENT_VERSION), which is what
 * the signup checkbox records against the account: edit any sentence in the
 * data module and both this page and the consent version move together.
 */

/** One inline run: plain text, a link, or bold. */
function Inline({ part }: { part: TermsInline }) {
  if (typeof part === 'string') return <>{part}</>;
  if (part.to) {
    return <Link to={part.to} className="text-purple-700 hover:text-purple-800 font-medium">{part.text}</Link>;
  }
  if (part.strong) return <strong>{part.text}</strong>;
  return <>{part.text}</>;
}

/** Parts separated by single spaces (the browser collapses them anyway). */
function Parts({ parts, className }: { parts: TermsInline[]; className?: string }) {
  return (
    <p className={className}>
      {parts.map((part, i) => (
        <span key={i}>{i > 0 ? ' ' : null}<Inline part={part} /></span>
      ))}
    </p>
  );
}

function Block({ block, isLast }: { block: TermsBlock; isLast: boolean }) {
  switch (block.type) {
    case 'p':
      return <Parts parts={block.parts} className={`text-gray-700 leading-relaxed${isLast ? '' : ' mb-4'}`} />;
    case 'ul':
      return (
        <ul className={`list-disc pl-6 text-gray-700 space-y-2${isLast ? '' : ' mb-4'}`}>
          {block.items.map((item, i) => (
            <li key={i}>
              {item.map((part, j) => (
                <span key={j}>{j > 0 ? ' ' : null}<Inline part={part} /></span>
              ))}
            </li>
          ))}
        </ul>
      );
    case 'aiNotice':
      return (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-4" role="note">
          <p className="text-amber-900 font-semibold mb-2">{block.heading}</p>
          <p className="text-amber-800 text-sm leading-relaxed">{block.text}</p>
        </div>
      );
    case 'contact':
      return (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-6">
          {block.entries.map((entry, i) => (
            <div key={entry.label} className={`flex items-start gap-3${i === 0 ? ' mb-3' : ''}`}>
              {entry.icon === 'mail'
                ? <Mail className="w-5 h-5 text-purple-700 mt-0.5" />
                : <Shield className="w-5 h-5 text-purple-700 mt-0.5" />}
              <div>
                <p className="font-semibold text-gray-900">{entry.label}</p>
                <p className="text-gray-700">{entry.value}</p>
              </div>
            </div>
          ))}
        </div>
      );
    case 'notice':
      return null; // the intro callout renders above the sections instead
  }
}

export default function TermsOfServicePage() {
  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <Link to="/" className="inline-flex items-center gap-2 text-purple-700 hover:text-purple-800 mb-8">
          <ArrowLeft className="w-4 h-4" /> Back to Home
        </Link>

        <div className="flex items-center gap-3 mb-6">
          <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center">
            <FileText className="w-6 h-6 text-purple-700" />
          </div>
          <div>
            <h1 className="text-4xl font-black text-gray-900">Terms of Service</h1>
            <p className="text-sm text-gray-500 mt-1">Last updated: {TERMS_LAST_UPDATED}</p>
          </div>
        </div>

        <div className="prose prose-lg max-w-none">
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-6 mb-8">
            <p className="text-purple-900 font-semibold mb-2">{TERMS_INTRO_NOTICE.heading}</p>
            <Parts parts={TERMS_INTRO_NOTICE.parts} className="text-purple-800 text-sm" />
          </div>

          {TERMS_SECTIONS.map(section => (
            <section key={section.heading} className="mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">{section.heading}</h2>
              {section.blocks.map((block, i) => (
                <Block key={i} block={block} isLast={i === section.blocks.length - 1} />
              ))}
            </section>
          ))}

          <div className="border-t border-gray-200 pt-8 mt-12">
            <p className="text-sm text-gray-500 text-center">{TERMS_FOOTER}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
