import { useEffect } from 'react';
import { useToast } from '../context/ToastContext';
import { markBatchNotified, useUploadQueueDone, wasBatchNotified, type UploadBatchResult } from '../lib/uploadQueue';

/** Per-scope flavour line for the "everything uploaded" toast. */
const SCOPE_PHRASE: Record<string, string> = {
  description: 'AI will describe them',
  social: "they'll appear in the post",
  video: 'ready for your reel',
  wizard: 'added to the listing',
};

function report(toast: ReturnType<typeof useToast>, batch: UploadBatchResult) {
  const firstError = batch.errors[0] ? ` — ${batch.errors[0]}` : '';
  if (batch.failed === 0) {
    const phrase = SCOPE_PHRASE[batch.scope];
    toast.success(
      `${batch.ok} photo${batch.ok === 1 ? '' : 's'} uploaded${phrase ? ` — ${phrase}` : ''}`,
      'Photos ready',
    );
  } else if (batch.ok === 0) {
    toast.error(
      `${batch.failed} photo${batch.failed === 1 ? '' : 's'} failed${firstError}`,
      'Upload failed',
    );
  } else {
    toast.addToast({
      type: 'warning',
      title: 'Photos finished',
      message: `${batch.ok} uploaded, ${batch.failed} failed${firstError}`,
    });
  }
}

/**
 * Toasts completions from the background <uploadQueue>. Mounted once per
 * DashboardLayout because the tab that queued a batch routinely unmounts (or
 * stays hidden) while the queue is still parked on a rate-limit window — the
 * "your photos landed" notification has to outlive its tab.
 *
 * "Already toasted" lives in the queue module, not in component state: routes
 * unmount DashboardLayout, and a batch that finished while nobody was mounted
 * should still announce itself when the agent comes back — exactly once.
 */
export default function UploadQueueNotifier() {
  const toast = useToast();
  const done = useUploadQueueDone();

  useEffect(() => {
    for (const batch of done) {
      if (wasBatchNotified(batch.id)) continue;
      markBatchNotified(batch.id);
      report(toast, batch);
    }
  }, [done, toast]);

  return null;
}
