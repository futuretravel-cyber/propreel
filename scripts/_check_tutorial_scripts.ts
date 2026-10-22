import { readFileSync } from 'fs';
import { flashheadCreditsForText, narrationWordCount, narrationSecondsForText } from '../lib/renderPricing';
for (const f of ['docs/tutorials/ai-video-generator-script.md', 'docs/tutorials/virtual-staging-script.md']) {
  const lines = readFileSync(f, 'utf8').split('\n').filter(l => l.startsWith('> ') && !l.startsWith('> ('));
  const text = lines.map(l => l.replace(/^> ?/, '')).join(' ').trim();
  console.log(f, 'words=' + narrationWordCount(text), 'secs=' + narrationSecondsForText(text).toFixed(1), 'credits=' + flashheadCreditsForText(text));
}
