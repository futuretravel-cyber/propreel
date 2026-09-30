import { useState, useEffect, useCallback } from 'react';
import { WifiOff, Wifi, X } from 'lucide-react';

/**
 * Offline detection banner. Shows a fixed banner when the browser goes
 * offline and a confirmation flash when connectivity returns.
 */
export default function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [wasOffline, setWasOffline] = useState(false);
  const [showBackOnline, setShowBackOnline] = useState(false);

  const handleOnline = useCallback(() => {
    setIsOnline(true);
    // Only show "back online" if we were actually showing the offline banner
    setWasOffline(prev => {
      if (prev) {
        setShowBackOnline(true);
        window.setTimeout(() => setShowBackOnline(false), 3000);
      }
      return false;
    });
  }, []);

  const handleOffline = useCallback(() => {
    setIsOnline(false);
    setWasOffline(true);
  }, []);

  useEffect(() => {
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [handleOnline, handleOffline]);

  if (isOnline && !showBackOnline) return null;

  return (
    <div
      className={`fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-[60] animate-fade-in ${!isOnline ? '' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className={`flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border backdrop-blur-xl ${isOnline ? 'bg-green-950/90 border-green-500/30' : 'bg-ink-900/95 border-red-500/30'}`}>
        {isOnline ? (
          <>
            <Wifi className="w-4 h-4 text-green-400" />
            <span className="text-sm text-white">Back online</span>
            <button onClick={() => setShowBackOnline(false)} className="text-ink-400 hover:text-white ml-1" aria-label="Dismiss">
              <X className="w-4 h-4" />
            </button>
          </>
        ) : (
          <>
            <WifiOff className="w-4 h-4 text-red-400 animate-pulse" />
            <div>
              <p className="text-sm text-white font-medium">You're offline</p>
              <p className="text-xs text-ink-400">Check your connection — video generation needs internet.</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
