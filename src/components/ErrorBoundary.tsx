import { Component, ErrorInfo, ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional custom fallback renderer */
  fallback?: (error: Error, reset: () => void) => ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Catches render/runtime errors anywhere below it and shows a friendly
 * recovery screen instead of a blank page. "Try Again" resets the boundary,
 * which remounts the failed subtree.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Log for observability; wire to a service (e.g. Sentry) later if needed
    console.error('ErrorBoundary caught:', error, info.componentStack);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <ErrorState error={this.state.error} onRetry={this.reset} />;
    }
    return this.props.children;
  }
}

/**
 * Reusable error UI with recovery actions. Use directly in catch-blocks
 * or inside ErrorBoundary.
 */
export function ErrorState({
  error,
  onRetry,
  title = 'Something went wrong',
  showHome = true,
}: {
  error: Error | string;
  onRetry?: () => void;
  title?: string;
  showHome?: boolean;
}) {
  const message = typeof error === 'string' ? error : error.message || 'An unexpected error occurred.';

  return (
    <div className="min-h-[50vh] flex items-center justify-center p-4">
      <div className="card-dark p-8 max-w-md w-full text-center animate-fade-in" role="alert">
        <div className="w-14 h-14 rounded-full bg-red-950/50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
          </svg>
        </div>
        <h2 className="text-lg font-bold text-white mb-2">{title}</h2>
        <p className="text-sm text-ink-400 mb-6 break-words">{message}</p>
        <div className="flex flex-col sm:flex-row gap-2 justify-center">
          {onRetry && (
            <button onClick={onRetry} className="btn btn-primary text-sm">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Try Again
            </button>
          )}
          <button
            onClick={() => window.location.reload()}
            className="btn btn-secondary text-sm"
          >
            Refresh Page
          </button>
          {showHome && (
            <button
              onClick={() => { window.location.href = '/'; }}
              className="btn btn-ghost text-sm"
            >
              Go Home
            </button>
          )}
        </div>
        <p className="text-xs text-ink-500 mt-4">
          If this keeps happening,{' '}
          <a href="mailto:support@propreel.co.za?subject=Error%20Report" className="text-purple-400 hover:text-purple-300">
            contact support
          </a>
          .
        </p>
      </div>
    </div>
  );
}

export default ErrorBoundary;
