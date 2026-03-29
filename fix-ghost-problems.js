/**
 * Fix Ghost Problems
 * ==================
 * Removes fake problems 26-30 that were added for AMC 10/12
 * (which only have 25 problems, not 30)
 * Also removes fake problems 26-30 for AMC 8 (also 25 problems)
 *
 * Run: node fix-ghost-problems.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const problems = JSON.parse(readFileSync(join(__dirname, 'problems-base.json'), 'utf8'));

const before = problems.length;

// AMC 8, AMC 10, AMC 12 all have 25 problems max
// AIME has 15 problems max
// AHSME pre-1968 had 50 problems, post-1968 had 30
const filtered = problems.filter(p => {
  const cf = p.contestFull || '';
  if (cf === 'amc8' || cf === 'ajhsme') return p.num <= 25 && !(cf === 'amc8' && p.year === 2021);
  if (cf === 'amc10' || cf === 'amc10a' || cf === 'amc10b') return p.num <= 25;
  if (cf === 'amc12' || cf === 'amc12a' || cf === 'amc12b') return p.num <= 25;
  if (cf === 'aime' || cf === 'aime1' || cf === 'aime2') return p.num <= 15;
  if (cf === 'ahsme') return p.num <= (p.year >= 1968 ? 30 : 40);
  return true;
});

const removed = before - filtered.length;
const withAnswers = filtered.filter(p => p.answer).length;

writeFileSync(join(__dirname, 'problems-base.json'), JSON.stringify(filtered, null, 0));
writeFileSync(join(__dirname, 'problems.js'),
  `// MathAtlas Problem Database\n// Updated: ${new Date().toISOString()}\n// ${filtered.length} problems, ${withAnswers} with answers\nwindow.MA_PROBLEMS = ${JSON.stringify(filtered, null, 0)};\n`
);

console.log(`Removed ${removed} ghost problems`);
console.log(`Before: ${before} | After: ${filtered.length}`);
console.log(`Answers: ${withAnswers}/${filtered.length} (${Math.round(withAnswers/filtered.length*100)}%)`);
console.log('\nNext: node scrape-final-answers.js to fill remaining gaps');