// One-off backfill: generate thumbnails for READY projects that predate
// automatic thumbnail extraction. Calls the worker's /make_thumbnail.
import { scanItems, TABLES, updateItem } from '../lib/db';

const WORKER_URL = process.env.VITE_MODAL_ENDPOINT || 'https://futuretravel--propreel-render-web.modal.run';

async function main() {
  const projects = await scanItems<any>(TABLES.PROJECTS, { limit: 1000 });
  const targets = projects.filter((p: any) => p.status === 'READY' && p.videoUrl && !p.thumbnailUrl);
  console.log(`projects: ${projects.length} total, ${targets.length} need thumbnails`);

  let ok = 0, failed = 0;
  for (const p of targets) {
    try {
      const res = await fetch(`${WORKER_URL}/make_thumbnail`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ video_url: p.videoUrl }),
      });
      if (!res.ok) throw new Error(`worker ${res.status}`);
      const data = await res.json();
      if (!data.thumbnail_url) throw new Error('no thumbnail_url');
      await updateItem(TABLES.PROJECTS, { userId: p.userId, id: p.id }, { thumbnailUrl: data.thumbnail_url });
      ok++;
      console.log(`  ✓ ${p.id} → ${data.thumbnail_url}`);
    } catch (e: any) {
      failed++;
      console.log(`  ✗ ${p.id}: ${e.message}`);
    }
  }
  console.log(`backfill done: ${ok} thumbnailed, ${failed} failed`);
  process.exit(0);
}

main().catch(e => { console.error('backfill error:', e); process.exit(1); });
