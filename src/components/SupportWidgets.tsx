import { useEffect, useState } from 'react';

declare global {
  interface Window {
    $crisp?: any[];
    CRISP_WEBSITE_ID?: string;
    intercomSettings?: Record<string, any>;
  }
}

interface Flags {
  whatsapp: { enabled: boolean; number: string; message: string };
  liveChat: { enabled: boolean; provider: 'crisp' | 'intercom'; websiteId: string };
}

/**
 * Activated from Admin → Integrations. Loads the configured live-chat
 * provider script and renders the WhatsApp float on public pages.
 */
export default function SupportWidgets() {
  const [flags, setFlags] = useState<Flags | null>(null);

  useEffect(() => {
    fetch('/api/users?action=feature_flags')
      .then(r => r.json())
      .then(d => setFlags(d.flags))
      .catch(() => {});
  }, []);

  // Live chat: inject the provider's embed script once, keyed by config
  useEffect(() => {
    if (!flags?.liveChat?.enabled || !flags.liveChat.websiteId) return;
    const { provider, websiteId } = flags.liveChat;

    if (provider === 'crisp') {
      if (document.querySelector('script[src*="crisp.chat"]')) return;
      window.$crisp = [];
      window.CRISP_WEBSITE_ID = websiteId;
      const s = document.createElement('script');
      s.src = 'https://client.crisp.chat/l.js';
      s.async = true;
      document.head.appendChild(s);
    } else if (provider === 'intercom') {
      if (document.querySelector('script[src*="intercom"]')) return;
      const w = window as any;
      w.intercomSettings = { app_id: websiteId };
      const s = document.createElement('script');
      s.src = `https://widget.intercom.io/widget/${websiteId}`;
      s.async = true;
      document.head.appendChild(s);
    }
  }, [flags?.liveChat?.enabled, flags?.liveChat?.provider, flags?.liveChat?.websiteId]);

  if (!flags?.whatsapp?.enabled || !flags.whatsapp.number) return null;
  const digits = flags.whatsapp.number.replace(/[^\d]/g, '');
  if (!digits) return null;

  // Stacked above the support assistant's launcher so the floats never overlap;
  // on phones the whole stack also clears the bottom bars (sticky CTA on public
  // pages, MobileNav in the dashboard). sm and up has room for bottom-24.
  return (
    <a
      href={`https://wa.me/${digits}?text=${encodeURIComponent(flags.whatsapp.message || 'Hi PropReel!')}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat with us on WhatsApp"
      className="fixed bottom-[calc(9.25rem+env(safe-area-inset-bottom))] right-4 sm:bottom-24 sm:right-5 z-40 w-14 h-14 rounded-full bg-[#25D366] shadow-xl shadow-black/30 flex items-center justify-center hover:scale-110 transition-transform"
    >
      {/* WhatsApp glyph */}
      <svg viewBox="0 0 32 32" className="w-7 h-7 fill-white" aria-hidden>
        <path d="M16 3C9.4 3 4 8.4 4 15c0 2.1.6 4.2 1.6 6L4 29l8.2-1.6c1.2.6 2.5.9 3.8.9 6.6 0 12-5.4 12-12S22.6 3 16 3zm0 22c-1.2 0-2.4-.2-3.5-.7l-.6-.3-5 1 1.1-4.8-.4-.6C6.5 18.4 6 16.7 6 15c0-5.5 4.5-10 10-10s10 4.5 10 10-4.5 10-10 10zm5.5-7.5c-.3-.2-1.8-.9-2-1-.3-.1-.5-.2-.7.2-.2.3-.8 1-.9 1.1-.2.2-.3.2-.6.1-.3-.2-1.3-.5-2.4-1.5-.9-.8-1.5-1.8-1.7-2.1-.2-.3 0-.5.1-.6l.5-.6c.2-.2.2-.3.3-.5.1-.2 0-.4 0-.6-.1-.2-.7-1.7-1-2.3-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1 2.9 1.2 3.1c.2.2 2.1 3.2 5.1 4.5.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.3-.7.3-1.3.2-1.4-.1-.2-.3-.2-.6-.4z" />
      </svg>
    </a>
  );
}
