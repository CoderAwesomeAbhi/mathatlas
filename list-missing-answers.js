/**
 * Lists every problem still missing an answer
 * Run: node list-missing-answers.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const problems = JSON.parse(readFileSync(join(__dirname, 'problems-base.json'), 'utf8'));
const missing = problems.filter(p => !p.answer);

console.log(`Missing answers: ${missing.length} / ${problems.length}\n`);

// Group by contest
const groups = {};
for (const p of missing) {
  const key = `${p.contestFull}-${p.year}`;
  if (!groups[key]) groups[key] = [];
  groups[key].push(p.num);
}

for (const [key, nums] of Object.entries(groups).sort()) {
  console.log(`${key}: problems ${nums.sort((a,b)=>a-b).join(', ')}`);
}
