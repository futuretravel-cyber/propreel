import { useEffect, useState } from 'react';
import { PropReelAPI } from './api';

export interface ActivityItem {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  category: 'render' | 'credits' | 'system' | 'social' | 'billing';
  actionUrl?: string;
}

/**
 * Fired on `window` whenever any hook instance writes the read set, so every
 * mounted instance reloads it. Without this the header badge and the
 * NotificationCenter each kept their own stale copy of the same localStorage
 * value — you could mark everything read and the badge never cleared.
 */
const READ_STATE_EVENT = 'propreel:activity-read-state';

/**
 * Real activity feed: builds notifications from the user's actual credit
 * transactions (renders, edits, refunds, top-ups) and project records.
 * Nothing here is hardcoded — an empty account simply sees an empty feed.
 *
 * Items are marked read in localStorage per user; the read set is shared
 * across every mounted hook instance via READ_STATE_EVENT (and the native
 * `storage` event covers other tabs).
 */
export function useActivity(userId: string | undefined) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<{ balance: number; used7d: number; used30d: number }>({ balance: 0, used7d: 0, used30d: 0 });

  useEffect(() => {
    if (!userId) { setItems([]); setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [report, projects] = await Promise.all([
          PropReelAPI.creditReport(userId, '30d').catch(() => null),
          PropReelAPI.listProjects(userId).catch(() => []),
        ]);
        if (cancelled) return;

        const feed: ActivityItem[] = [];

        // Render / edit / refund events from the real ledger (newest first)
        for (const t of report?.transactions || []) {
          const when = t.createdAt;
          // Ledger rows carry a stable id — use it so "read" survives
          // refetches (timestamp+amount composites collided and re-surfaced
          // as unread).
          const id = t.id ? `txn-${t.id}` : `txn-${when}-${t.amount}`;
          const reason = String(t.reason || t.description || '').toLowerCase();
          if (t.amount < 0 && (reason.includes('video') || reason.includes('render'))) {
            feed.push({
              id,
              type: 'info', category: 'render',
              title: 'Video Render Started',
              message: `${Math.abs(t.amount)} credits reserved for a video render.`,
              timestamp: when, read: false,
              actionUrl: '/dashboard/video',
            });
          } else if (t.amount < 0 && reason.includes('image')) {
            feed.push({
              id,
              type: 'info', category: 'render',
              title: 'AI Photo Edit',
              message: `${Math.abs(t.amount)} credits used for an AI photo edit.`,
              timestamp: when, read: false,
              actionUrl: '/dashboard/photo-editor',
            });
          } else if (t.amount < 0 && (reason.includes('avatar') || reason.includes('talking head') || reason.includes('lip-sync'))) {
            feed.push({
              id,
              type: 'info', category: 'render',
              title: 'AI Avatar Video',
              message: `${Math.abs(t.amount)} credits used for an AI Avatar Video render.`,
              timestamp: when, read: false,
              actionUrl: '/dashboard/video',
            });
          } else if (t.amount < 0 && reason.includes('refund')) {
            // A negative row whose description says refund is unusual — show it honestly
            feed.push({
              id,
              type: 'warning', category: 'credits',
              title: 'Credits Adjusted',
              message: t.description || `${Math.abs(t.amount)} credits were deducted.`,
              timestamp: when, read: false,
              actionUrl: '/dashboard/credits',
            });
          } else if (t.amount > 0 && reason.includes('refund')) {
            feed.push({
              id,
              type: 'success', category: 'credits',
              title: 'Credits Refunded',
              message: `${t.amount} credits were refunded to your balance after a failed render.`,
              timestamp: when, read: false,
              actionUrl: '/dashboard/credits',
            });
          } else if (t.amount > 0) {
            feed.push({
              id,
              type: 'success', category: 'billing',
              title: 'Credits Added',
              message: t.description || `${t.amount} credits were added to your balance.`,
              timestamp: when, read: false,
              actionUrl: '/dashboard/credits',
            });
          } else {
            // Any other real deduction (edits, social packs, transfers…)
            feed.push({
              id,
              type: 'info', category: 'credits',
              title: 'Credits Used',
              message: t.description || `${Math.abs(t.amount)} credits were used.`,
              timestamp: when, read: false,
              actionUrl: '/dashboard/credits',
            });
          }
        }

        // Low-credit warning from the real balance. Stable id so marking it
        // read keeps it read while the balance ticks down.
        const bal = report?.currentBalance ?? 0;
        if (bal > 0 && bal < 20) {
          feed.push({
            id: 'low-credits',
            type: 'warning', category: 'credits',
            title: 'Low Credit Warning',
            message: `You have ${bal} credits remaining. Recharge from R50 to keep rendering.`,
            timestamp: new Date().toISOString(), read: false,
            actionUrl: '/dashboard/credits',
          });
        }

        // Project status events (reels and Talking Head clips alike)
        for (const p of projects || []) {
          const isTalkingHead = p.kind === 'AVATAR';
          if (p.status === 'READY' && p.videoUrl) {
            feed.push({
              id: `proj-${p.id}`,
              type: 'success', category: 'render',
              title: isTalkingHead ? 'AI Avatar Video Ready' : 'Video Ready',
              message: isTalkingHead
                ? `Your AI Avatar Video ("${p.title.replace(/^(AI Avatar Video|Talking Head) — /, '')}") is ready to download or share.`
                : `"${p.title}" finished rendering and is ready to download or share.`,
              timestamp: p.updatedAt || p.createdAt, read: false,
              actionUrl: isTalkingHead ? '/dashboard/video' : '/dashboard/listings',
            });
          } else if (p.status === 'FAILED') {
            feed.push({
              id: `proj-${p.id}`,
              type: 'error', category: 'render',
              title: isTalkingHead ? 'AI Avatar Video Render Failed' : 'Render Failed',
              message: `"${p.title}" failed to render.`,
              timestamp: p.updatedAt || p.createdAt, read: false,
              actionUrl: '/dashboard/video',
            });
          }
        }

        feed.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        if (!cancelled) setItems(feed.slice(0, 50));

        // Real usage stats for the sidebar card. Prefer the server's
        // windowed sums: `transactions` is capped at 100 rows, so a client
        // roll-up undercounted (the sidebar disagreed with the dashboard's
        // "Credits Used" for the same 30 days). Client roll-up stays as the
        // fallback for older cached/failed responses.
        const now = Date.now();
        const weekAgo = now - 7 * 24 * 3600 * 1000;
        const monthAgo = now - 30 * 24 * 3600 * 1000;
        let used7d = 0, used30d = 0;
        for (const t of report?.transactions || []) {
          if (t.amount >= 0) continue;
          const ts = Date.parse(t.createdAt || '');
          if (Number.isNaN(ts)) continue;
          if (ts >= weekAgo) used7d += Math.abs(t.amount);
          if (ts >= monthAgo) used30d += Math.abs(t.amount);
        }
        if (typeof report?.used_7d === 'number') used7d = report.used_7d;
        if (typeof report?.used_30d === 'number') used30d = report.used_30d;
        if (!cancelled) setStats({
          balance: report?.currentBalance ?? 0,
          used7d,
          used30d,
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [userId]);

  // Read-state persisted per user in localStorage and shared across every
  // mounted instance of this hook (header badge + NotificationCenter).
  const readKey = userId ? `propreel:readActivity:${userId}` : 'propreel:readActivity';
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const load = () => {
      try {
        const raw = localStorage.getItem(readKey);
        setReadIds(raw ? new Set(JSON.parse(raw)) : new Set());
      } catch { setReadIds(new Set()); }
    };
    load();
    const onStorage = (e: StorageEvent) => { if (!e.key || e.key === readKey) load(); };
    const onLocalRead = () => load();
    window.addEventListener('storage', onStorage);
    window.addEventListener(READ_STATE_EVENT, onLocalRead);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(READ_STATE_EVENT, onLocalRead);
    };
  }, [readKey]);

  const persist = (next: Set<string>) => {
    setReadIds(next);
    try { localStorage.setItem(readKey, JSON.stringify([...next])); } catch { /* ignore */ }
    // Tell every other instance (same tab) to reload the shared set
    window.dispatchEvent(new Event(READ_STATE_EVENT));
  };

  const markRead = (id: string) => {
    // Functional update so rapid consecutive marks can't lose one another
    setReadIds(prev => {
      const next = new Set(prev).add(id);
      try { localStorage.setItem(readKey, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
    window.dispatchEvent(new Event(READ_STATE_EVENT));
  };

  const markAllRead = () => {
    persist(new Set(items.map(i => i.id)));
  };

  const notifications: ActivityItem[] = items.map(i => ({ ...i, read: readIds.has(i.id) }));
  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, stats, loading, markRead, markAllRead };
}
