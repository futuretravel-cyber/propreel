import { readFileSync } from 'fs';
const dash = readFileSync('src/components/DashboardTutorials.tsx', 'utf8');
const admin = readFileSync('src/components/AdminTutorials.tsx', 'utf8');

function parseBlock(src: string, name: string) {
  const m = src.match(new RegExp(`${name}: Record<string, string> = \\{([\\s\\S]*?)\\};`));
  if (!m) throw new Error(`missing ${name}`);
  const block = m[1];
  const map: Record<string, string> = {};
  for (const line of block.split('\n')) {
    const mm = line.match(/^\s*'([^']+)':\s*'([^']+)'/);
    if (mm) map[mm[1]] = mm[2];
  }
  return map;
}

const dashRoutes = parseBlock(dash, 'TOOL_ROUTES');
const adminRoutes = parseBlock(admin, 'CATEGORY_TOOL_LINK');

const allCategories = [
  'Photo Editor',
  'Virtual Staging',
  'Furniture Removal',
  'Twilight',
  'AI Avatar (FlashHead)',
  'Property Description',
  'Social Media',
  'AI Writer',
  'Billing & Credits',
];

console.log('DashboardTutorials.tsx  → AdminTutorials.tsx');
console.log('---------------------------------------------');
for (const cat of allCategories) {
  const dashRoute = dashRoutes[cat] ?? '<missing>';
  const adminRoute = adminRoutes[cat] ?? '<missing>';
  const mismatch = dashRoute !== adminRoute ? '  ← MISMATCH' : '';
  console.log(`${cat.padEnd(24)} | ${dashRoute.padEnd(32)} | ${adminRoute}${mismatch}`);
}
