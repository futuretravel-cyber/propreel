import { useState, useEffect } from 'react';

/**
 * Brief loading state so skeleton screens actually render before content.
 * Swap for real data-fetching loading flags when pages read from the API.
 */
export function useSimulatedLoading(delayMs = 500): boolean {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), delayMs);
    return () => clearTimeout(t);
  }, [delayMs]);
  return loading;
}

interface SkeletonProps {
  variant?: 'text' | 'circular' | 'rectangular';
  width?: string | number;
  height?: string | number;
  lines?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function Skeleton({ variant = 'rectangular', width, height, lines = 1, className = '', style }: SkeletonProps) {
  if (variant === 'circular') {
    return (
      <div
        className={`rounded-full bg-ink-700 animate-pulse ${className}`}
        style={{ width: typeof width === 'number' ? `${width}px` : width, height: typeof height === 'number' ? `${height}px` : height, ...style }}
      />
    );
  }

  if (variant === 'text') {
    return (
      <div className={`space-y-2 ${className}`}>
        {Array.from({ length: lines }).map((_, i) => (
          <div
            key={i}
            className="h-4 bg-ink-700 rounded-full animate-pulse"
            style={{ width: i === lines - 1 ? '60%' : '100%', ...style }}
          />
        ))}
      </div>
    );
  }

  return (
    <div
      className={`bg-ink-700 rounded-xl animate-pulse ${className}`}
      style={{ width: typeof width === 'number' ? `${width}px` : width, height: typeof height === 'number' ? `${height}px` : height, ...style }}
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="card-dark p-5">
      <Skeleton variant="text" lines={2} className="mb-3" />
      <Skeleton height={48} width="80px" className="mb-2" />
      <Skeleton variant="text" height={16} width="60%" />
    </div>
  );
}

export function ProjectCardSkeleton() {
  return (
    <div className="card-dark overflow-hidden">
      <Skeleton height={16} className="aspect-video w-full" />
      <div className="p-4 space-y-2">
        <Skeleton variant="text" lines={2} />
        <Skeleton variant="text" height={14} width="40%" />
        <Skeleton variant="text" height={14} width="50%" />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className="border-b border-white/5">
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <Skeleton variant="text" height={14} width={i === 0 ? '70%' : '50%'} />
        </td>
      ))}
    </tr>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-start">
        <Skeleton variant="text" lines={2} width="200px" />
        <Skeleton height={32} width={100} className="rounded-full" />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatCardSkeleton key={i} />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-dark p-6">
          <Skeleton variant="text" lines={1} width="150px" className="mb-4" />
          <Skeleton height={220} className="rounded-xl" />
        </div>
        <div className="card-dark p-6">
          <Skeleton variant="text" lines={1} width="120px" className="mb-4" />
          <Skeleton height={160} className="rounded-xl" />
          <div className="grid grid-cols-2 gap-2 mt-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton height={40} className="rounded-lg" key={i} />
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card-dark p-6">
          <Skeleton variant="text" lines={1} width="100px" className="mb-4" />
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3 py-3 border-b border-white/5 last:border-0">
              <Skeleton variant="circular" width={32} height={32} />
              <div className="flex-1">
                <Skeleton variant="text" lines={2} />
                <Skeleton variant="text" height={12} width="40%" />
              </div>
            </div>
          ))}
        </div>
        <div className="space-y-4">
          <div className="card-dark p-6">
            <Skeleton variant="text" lines={1} className="mb-4" />
            <Skeleton height={180} className="rounded-xl" />
          </div>
          <div className="card-dark p-6">
            <Skeleton variant="text" lines={1} className="mb-4" />
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton height={24} key={i} className="rounded-lg" />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ProjectsSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-start">
        <Skeleton variant="text" lines={2} width="150px" />
        <div className="flex gap-2">
          <Skeleton height={36} width={120} />
          <Skeleton height={36} width={120} />
        </div>
      </div>

      <div className="card-dark p-4">
        <div className="flex flex-col md:flex-row gap-3">
          <Skeleton height={40} className="rounded-xl flex-1" />
          <Skeleton height={40} width={140} className="rounded-xl" />
          <Skeleton height={40} width={140} className="rounded-xl" />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <ProjectCardSkeleton key={i} />
        ))}
      </div>
    </div>
  );
}

export function BillingSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-start">
        <Skeleton variant="text" lines={2} width="200px" />
        <div className="flex gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} height={32} width={80 + i * 20} className="rounded-full" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card-dark p-6">
          <Skeleton variant="text" lines={2} className="mb-3" />
          <Skeleton height={56} width="100px" className="mb-3" />
          <Skeleton height={8} className="rounded-full w-full mb-2" />
          <Skeleton variant="text" height={14} width="50%" />
        </div>
        <div className="card-dark p-6">
          <Skeleton variant="text" lines={2} className="mb-3" />
          <Skeleton height={56} width="80px" className="mb-3" />
          <Skeleton variant="text" height={14} width="60%" />
        </div>
        <div className="card-dark p-6">
          <Skeleton variant="text" lines={2} className="mb-3" />
          <Skeleton height={40} width="60px" className="mb-3" />
          <Skeleton variant="text" lines={1} height={14} width="40%" />
        </div>
      </div>

      <div className="card-dark p-6">
        <Skeleton variant="text" lines={1} width="180px" className="mb-4" />
        <div className="flex items-center gap-4">
          <Skeleton height={8} className="rounded-full flex-1" />
          <Skeleton height={56} width={80} />
        </div>
        <Skeleton height={48} className="mt-4 rounded-xl" />
      </div>
    </div>
  );
}

export function StudioSkeleton() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex justify-between items-start">
        <Skeleton variant="text" lines={2} width="150px" />
        <div className="flex gap-2">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} height={32} width={100} className="rounded-full" />
          ))}
        </div>
      </div>

      <div className="card-dark p-6">
        <Skeleton variant="text" lines={1} width="120px" className="mb-4" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} height={100} className="rounded-xl" />
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card-dark p-6">
          <Skeleton variant="text" lines={1} width="100px" className="mb-4" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton height={120} className="rounded-xl" />
            <Skeleton height={120} className="rounded-xl" />
          </div>
        </div>
        <div className="card-dark p-6">
          <Skeleton variant="text" lines={1} width="100px" className="mb-4" />
          <Skeleton height={120} className="rounded-xl" />
        </div>
      </div>
    </div>
  );
}
