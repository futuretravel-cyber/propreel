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
 * Real activity feed: builds notifications from the user's actual credit
 * transactions (renders, edits, refunds, top-ups) and project records.
 * Items are marked read in localStorage per user (client-side state only —
 * the ledger itself is append-only).
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
          const reason = String(t.reason || '').toLowerCase();
          if (t.amount < 0 && (reason.includes('video') || reason.includes('render'))) {
            feed.push({
              id: `txn-${when}-${t.amount}`,
              type: 'info', category: 'render',
              title: 'Video Render Started',
              message: `${Math.abs(t.amount)} credits reserved for a video render.`,
              timestamp: when, read: false,
              actionUrl: '/studio?tab=video',
            });
          } else if (t.amount < 0 && reason.includes('image')) {
            feed.push({
              id: `txn-${when}-${t.amount}`,
              type: 'info', category: 'render',
              title: 'AI Photo Edit',
              message: `${Math.abs(t.amount)} credits used for an AI photo edit.`,
              timestamp: when, read: false,
              actionUrl: '/studio?tab=photo',
            });
          } else if (t.amount < 0 && reason.includes('flashhead')) {
            feed.push({
              id: `txn-${when}-${t.amount}`,
              type: 'info', category: 'render',
              title: 'Talking-Head Video',
              message: `${Math.abs(t.amount)} credits used for a FlashHead lip-sync render.`,
              timestamp: when, read: false,
              actionUrl: '/studio?tab=flashhead',
            });
          } else if (t.amount > 0 && (reason.includes('refund') || reason.includes('Refund'))) {
            feed.push({
              id: `txn-${when}-${t.amount}`,
              type: 'success', category: 'credits',
              title: 'Credits Refunded',
              message: `${t.amount} credits were refunded to your balance after a failed render.`,
              timestamp: when, read: false,
              actionUrl: '/dashboard/credits',
            });
          } else if (t.amount > 0) {
            feed.push({
              id: `txn-${when}-${t.amount}`,
              type: 'success', category: 'billing',
              title: 'Credits Added',
              message: `${t.amount} credits were added to your balance.`,
              timestamp: when, read: false,
              actionUrl: '/dashboard/credits',
            });
          }
        }

        // Low-credit warning from the real balance
        const bal = report?.currentBalance ?? 0;
        if (bal > 0 && bal < 20) {
          feed.push({
            id: `low-credits-${bal}`,
            type: 'warning', category: 'credits',
            title: 'Low Credit Warning',
            message: `You have ${bal} credits remaining. Recharge from R50 to keep rendering.`,
            timestamp: new Date().toISOString(), read: false,
            actionUrl: '/dashboard/credits',
          });
        }

        // Project status events
        for (const p of projects || []) {
          if (p.status === 'READY' && p.videoUrl) {
            feed.push({
              id: `proj-${p.id}`,
              type: 'success', category: 'render',
              title: 'Video Ready',
              message: `"${p.title}" finished rendering and is ready to download or share.`,
              timestamp: p.updatedAt || p.createdAt, read: false,
              actionUrl: '/dashboard/listings',
            });
          } else if (p.status === 'FAILED') {
            feed.push({
              id: `proj-${p.id}`,
              type: 'error', category: 'render',
              title: 'Render Failed',
              message: `"${p.title}" failed to render. Reserved credits are refunded automatically.`,
              timestamp: p.updatedAt || p.createdAt, read: false,
              actionUrl: '/studio?tab=video',
            });
          }
        }

        feed.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
        if (!cancelled) setItems(feed.slice(0, 50));

        // Real usage stats for the sidebar card
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

  // Read-state persisted per user in localStorage
  const readKey = userId ? `propreel:readActivity:${userId}` : 'propreel:readActivity';
  const [readIds, setReadIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    try {
      const raw = localStorage.getItem(readKey);
      if (raw) setReadIds(new Set(JSON.parse(raw)));
    } catch { /* fresh state */ }
  }, [readKey]);

  const markRead = (id: string) => {
    setReadIds(prev => {
      const next = new Set(prev).add(id);
      try { localStorage.setItem(readKey, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  };

  const markAllRead = () => {
    const all = new Set(items.map(i => i.id));
    setReadIds(all);
    try { localStorage.setItem(readKey, JSON.stringify([...all])); } catch { /* ignore */ }
  };

  const notifications: ActivityItem[] = items.map(i => ({ ...i, read: readIds.has(i.id) }));
  const unreadCount = notifications.filter(n => !n.read).length;

  return { notifications, unreadCount, stats, loading, markRead, markAllRead };
}
