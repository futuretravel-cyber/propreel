import { useState, useEffect } from 'react';
import { Bell, X, Check, CheckCheck, Settings, MessageSquare, Zap, Video, CreditCard, AlertTriangle, Info } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useActivity } from '../lib/useActivity';
import { formatRelative } from '../lib/utils';

interface Notification {
  id: string;
  type: 'success' | 'warning' | 'error' | 'info';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  category: 'render' | 'credits' | 'system' | 'social' | 'billing';
  actionUrl?: string;
}

const PREFERENCE_LABELS: Record<string, string> = {
  emailNotifications: 'Email notifications',
  pushNotifications: 'Push notifications',
  renderComplete: 'Render completions',
  lowCredits: 'Low credit warnings',
  newFeatures: 'New features and updates',
  billingAlerts: 'Billing and payment alerts',
  marketingEmails: 'Marketing emails and promotions',
};

export default function NotificationCenter() {
  const { user } = useAuth();
  // Real activity feed: built from the credit ledger + project records — nothing hardcoded
  const { notifications: activity, unreadCount: liveUnread, markRead: markActivityRead, markAllRead: markAllActivityRead } = useActivity(user?.id);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const notifications: Notification[] = activity
    .filter(a => !dismissed.has(a.id))
    .map(a => ({
      id: a.id, type: a.type, title: a.title, message: a.message,
      timestamp: a.timestamp, read: a.read, category: a.category, actionUrl: a.actionUrl,
    }));
  const legacyItems = ([
    {
      id: '1',
      type: 'success',
      title: 'Video Render Complete',
      message: 'Your cinematic reel for "Luxury Villa in Constantia" is ready to view',
      timestamp: '2 minutes ago',
      read: false,
      category: 'render',
      actionUrl: '/dashboard/listings'
    },
    {
      id: '2',
      type: 'warning',
      title: 'Low Credit Warning',
      message: 'You have 45 credits remaining. Consider topping up to continue creating videos.',
      timestamp: '1 hour ago',
      read: false,
      category: 'credits',
      actionUrl: '/dashboard/credits'
    },
    {
      id: '3',
      type: 'info',
      title: 'New Feature Available',
      message: 'Try our new AI Twilight Photography feature to enhance your property photos',
      timestamp: '3 hours ago',
      read: false,
      category: 'system'
    },
    {
      id: '4',
      type: 'success',
      title: 'Social Caption Generated',
      message: 'Instagram caption ready for "Modern Apartment in Sandton"',
      timestamp: '5 hours ago',
      read: true,
      category: 'social'
    },
    {
      id: '5',
      type: 'info',
      title: 'Monthly Report Ready',
      message: 'Your February 2025 report is available for download',
      timestamp: '1 day ago',
      read: true,
      category: 'billing',
      actionUrl: '/dashboard/billing'
    },
    {
      id: '6',
      type: 'error',
      title: 'Render Failed',
      message: 'Video render failed for "Beachfront Property". Credits have been refunded.',
      timestamp: '2 days ago',
      read: true,
      category: 'render'
    }
  ]);
  void legacyItems; // schema reference only — replaced by the live activity feed

  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState({
    emailNotifications: true,
    pushNotifications: true,
    renderComplete: true,
    lowCredits: true,
    newFeatures: true,
    billingAlerts: true,
    marketingEmails: false,
  });
  const [prefsStatus, setPrefsStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // Load saved preferences from the backend (falls back to defaults)
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/users?action=preferences&user_id=${encodeURIComponent(user.id)}`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.preferences) {
          setPreferences(prev => ({ ...prev, ...data.preferences }));
        }
      } catch { /* endpoint not deployed yet or offline — defaults apply */ }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const savePreferences = async () => {
    setPrefsStatus('saving');
    try {
      if (user?.id) {
        const res = await fetch('/api/users?action=preferences', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ user_id: user.id, preferences }),
        });
        if (!res.ok) throw new Error('Save failed');
      } else {
        // Not signed in with a backend id — persist locally as fallback
        localStorage.setItem('propreel:notificationPreferences', JSON.stringify(preferences));
      }
      setPrefsStatus('saved');
      setTimeout(() => setPrefsStatus('idle'), 2500);
    } catch {
      // Never lose the user's choice — keep a local copy even if the API failed
      try { localStorage.setItem('propreel:notificationPreferences', JSON.stringify(preferences)); } catch { /* ignore */ }
      setPrefsStatus('error');
      setTimeout(() => setPrefsStatus('idle'), 4000);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread' && n.read) return false;
    if (filter === 'read' && !n.read) return false;
    if (categoryFilter !== 'all' && n.category !== categoryFilter) return false;
    return true;
  });

  const unreadCount = liveUnread;
  const markAsRead = markActivityRead;
  const markAllAsRead = markAllActivityRead;
  const deleteNotification = (id: string) => setDismissed(prev => new Set(prev).add(id));

  const getIcon = (type: string) => {
    switch (type) {
      case 'success': return <Check className="w-5 h-5 text-green-400" />;
      case 'warning': return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'error': return <X className="w-5 h-5 text-red-400" />;
      case 'info': return <Info className="w-5 h-5 text-blue-400" />;
      default: return <Bell className="w-5 h-5 text-ink-400" />;
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'render': return <Video className="w-4 h-4" />;
      case 'credits': return <Zap className="w-4 h-4" />;
      case 'billing': return <CreditCard className="w-4 h-4" />;
      case 'social': return <MessageSquare className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2 flex-wrap">
            <Bell className="w-6 h-6 text-purple-400" /> Notifications
            {unreadCount > 0 && (
              <span className="badge badge-brand">{unreadCount} unread</span>
            )}
          </h1>
          <p className="text-ink-400 mt-1">Stay updated with your account activity</p>
        </div>
        <div className="flex gap-2 flex-wrap ml-auto">
          <button
            onClick={markAllAsRead}
            className="btn btn-secondary text-sm"
            disabled={unreadCount === 0}
          >
            <CheckCheck className="w-4 h-4" /> Mark all as read
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="btn btn-secondary text-sm"
            aria-expanded={showSettings}
          >
            <Settings className="w-4 h-4" /> Preferences
          </button>
        </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
        <div className="card-dark p-6 animate-fade-in">
          <h3 className="font-semibold text-white mb-4">Notification Preferences</h3>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(['emailNotifications', 'pushNotifications'] as const).map(key => (
                <label key={key} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={preferences[key]}
                    onChange={(e) => setPreferences({ ...preferences, [key]: e.target.checked })}
                    className="w-4 h-4 rounded"
                    aria-label={PREFERENCE_LABELS[key]}
                  />
                  <span className="text-sm text-white">{PREFERENCE_LABELS[key]}</span>
                </label>
              ))}
            </div>

            <div className="border-t border-white/5 pt-4">
              <p className="text-sm text-ink-400 mb-3">Notify me about:</p>
              <div className="space-y-2">
                {(['renderComplete', 'lowCredits', 'newFeatures', 'billingAlerts', 'marketingEmails'] as const).map(key => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={preferences[key]}
                      onChange={(e) => setPreferences({ ...preferences, [key]: e.target.checked })}
                      className="w-4 h-4 rounded"
                      aria-label={PREFERENCE_LABELS[key]}
                    />
                    <span className="text-sm text-ink-300">{PREFERENCE_LABELS[key]}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={savePreferences}
                disabled={prefsStatus === 'saving'}
                className="btn btn-primary"
              >
                <Check className="w-4 h-4" />
                {prefsStatus === 'saving' ? 'Saving...' : 'Save Preferences'}
              </button>
              {prefsStatus === 'saved' && (
                <span className="text-sm text-green-400 flex items-center gap-1 animate-fade-in">
                  <Check className="w-4 h-4" /> Saved to your account
                </span>
              )}
              {prefsStatus === 'error' && (
                <span className="text-sm text-yellow-400 flex items-center gap-1 animate-fade-in">
                  <AlertTriangle className="w-4 h-4" /> Couldn't reach the server — saved on this device instead
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="card-dark p-4">
        <div className="flex flex-wrap gap-3">
          <div className="flex gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filter === 'all' ? 'bg-purple-700/20 text-purple-300' : 'text-ink-400 hover:text-white'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setFilter('unread')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filter === 'unread' ? 'bg-purple-700/20 text-purple-300' : 'text-ink-400 hover:text-white'
              }`}
            >
              Unread
            </button>
            <button
              onClick={() => setFilter('read')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filter === 'read' ? 'bg-purple-700/20 text-purple-300' : 'text-ink-400 hover:text-white'
              }`}
            >
              Read
            </button>
          </div>

          <div className="border-l border-white/10 pl-3 flex gap-2 flex-wrap">
            <button
              onClick={() => setCategoryFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                categoryFilter === 'all' ? 'bg-purple-700/20 text-purple-300' : 'text-ink-400 hover:text-white'
              }`}
            >
              All Categories
            </button>
            <button
              onClick={() => setCategoryFilter('render')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1 ${
                categoryFilter === 'render' ? 'bg-purple-700/20 text-purple-300' : 'text-ink-400 hover:text-white'
              }`}
            >
              <Video className="w-3 h-3" /> Renders
            </button>
            <button
              onClick={() => setCategoryFilter('credits')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1 ${
                categoryFilter === 'credits' ? 'bg-purple-700/20 text-purple-300' : 'text-ink-400 hover:text-white'
              }`}
            >
              <Zap className="w-3 h-3" /> Credits
            </button>
            <button
              onClick={() => setCategoryFilter('billing')}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1 ${
                categoryFilter === 'billing' ? 'bg-purple-700/20 text-purple-300' : 'text-ink-400 hover:text-white'
              }`}
            >
              <CreditCard className="w-3 h-3" /> Billing
            </button>
          </div>
        </div>
      </div>

      {/* Notifications List */}
      <div className="space-y-3">
        {filteredNotifications.length === 0 ? (
          <div className="card-dark p-12 text-center">
            <Bell className="w-12 h-12 text-ink-500 mx-auto mb-4" />
            <p className="text-ink-400">No activity yet</p>
            <p className="text-ink-500 text-sm mt-1">Renders, credit top-ups and refunds will show up here as they happen.</p>
          </div>
        ) : (
          filteredNotifications.map(notification => (
            <div
              key={notification.id}
              className={`card-dark p-4 transition hover:border-purple-500/30 ${
                !notification.read ? 'border-l-4 border-l-purple-500' : ''
              }`}
            >
              <div className="flex items-start gap-4">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                  notification.type === 'success' ? 'bg-green-950/50' :
                  notification.type === 'warning' ? 'bg-yellow-950/50' :
                  notification.type === 'error' ? 'bg-red-950/50' :
                  'bg-blue-950/50'
                }`}>
                  {getIcon(notification.type)}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-white text-sm">{notification.title}</h3>
                        <span className="badge badge-muted text-[10px] flex items-center gap-1">
                          {getCategoryIcon(notification.category)}
                          {notification.category}
                        </span>
                      </div>
                      <p className="text-sm text-ink-300">{notification.message}</p>
                      <p className="text-xs text-ink-500 mt-1">{formatRelative(notification.timestamp)}</p>
                    </div>

                    <div className="flex items-center gap-2 flex-shrink-0">
                      {!notification.read && (
                        <button
                          onClick={() => markAsRead(notification.id)}
                          className="text-ink-400 hover:text-white p-1"
                          title="Mark as read"
                          aria-label="Mark as read"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteNotification(notification.id)}
                        className="text-ink-400 hover:text-red-400 p-1"
                        title="Delete"
                        aria-label="Delete notification"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {notification.actionUrl && (
                    <button
                      onClick={() => window.location.href = notification.actionUrl!}
                      className="btn btn-secondary text-xs mt-3"
                    >
                      View Details
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
