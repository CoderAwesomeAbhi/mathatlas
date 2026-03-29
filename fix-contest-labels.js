/**
 * Fix Contest Labels
 * ==================
 * Infers contestFull from problem ID for all problems missing it,
 * then deduplicates keeping the best version of each problem.
 * Run: node fix-contest-labels.js
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const problems = JSON.parse(readFileSync(join(__dirname, 'problems-base.json'), 'utf8'));

console.log(`Before: ${problems.length} problems`);

// Step 1: Infer contestFull from ID for problems missing it
let inferred = 0;
for (const p of problems) {
  if (p.contestFull) continue;
  const id = p.id || '';
  // ID formats: 2022-AMC10A-3, 2022-AMC10B-5, 2022-AMC12A-1, 2022-AIME_I-7, etc.
  if      (id.includes('AMC10A') || id.includes('amc10a')) p.contestFull = 'amc10a';
  else if (id.includes('AMC10B') || id.includes('amc10b')) p.contestFull = 'amc10b';
  else if (id.includes('AMC10')  || id.includes('amc10'))  p.contestFull = p.year <= 2001 ? 'amc10' : 'amc10a';
  else if (id.includes('AMC12A') || id.includes('amc12a')) p.contestFull = 'amc12a';
  else if (id.includes('AMC12B') || id.includes('amc12b')) p.contestFull = 'amc12b';
  else if (id.includes('AMC12')  || id.includes('amc12'))  p.contestFull = p.year <= 2001 ? 'amc12' : 'amc12a';
  else if (id.includes('AMC8')   || id.includes('amc8'))   p.contestFull = 'amc8';
  else if (id.includes('AJHSME') || id.includes('ajhsme')) p.contestFull = 'ajhsme';
  else if (id.includes('AHSME')  || id.includes('ahsme'))  p.contestFull = 'ahsme';
  else if (id.includes('AIME_I') || id.includes('aime1'))  p.contestFull = 'aime1';
  else if (id.includes('AIME_II')|| id.includes('aime2'))  p.contestFull = 'aime2';
  else if (id.includes('AIME')   || id.includes('aime'))   p.contestFull = p.year >= 2000 ? 'aime1' : 'aime';
  
  if (p.contestFull) inferred++;
}
console.log(`Inferred contestFull for ${inferred} problems`);

// Step 2: Normalize all IDs to lowercase format for deduplication
// Some IDs are 2022-AMC10A-3 (uppercase), others are 2022-amc10a-3 (lowercase)
// Normalize to: YEAR-CONTESTFULL-NUM
for (const p of problems) {
  if (p.contestFull && p.year && p.num) {
    p.id = `${p.year}-${p.contestFull}-${p.num}`;
  }
}

// Step 3: Deduplicate by normalized ID, keeping the problem with more data
const map = new Map();
for (const p of problems) {
  const key = p.id;
  if (!map.has(key)) {
    map.set(key, p);
  } else {
    const existing = map.get(key);
    // Keep the one with an answer, or more skills, or better data
    const score = p => (p.answer?10:0) + (p.skills?.length||0) + (p.hint1?5:0) + (p.moduleId?3:0);
    if (score(p) > score(existing)) map.set(key, p);
  }
}

const fixed = Array.from(map.values());
const removed = problems.length - fixed.length;
const withAnswers = fixed.filter(p => p.answer).length;

// Step 4: Check results
const noContestFull = fixed.filter(p => !p.contestFull).length;
console.log(`Removed ${removed} duplicates`);
console.log(`After: ${fixed.length} problems`);
console.log(`No contestFull remaining: ${noContestFull}`);
console.log(`Answers: ${withAnswers}/${fixed.length} (${Math.round(withAnswers/fixed.length*100)}%)`);

// Spot check
const amc10a_2022 = fixed.filter(p => p.contestFull === 'amc10a' && p.year === 2022);
const amc10b_2022 = fixed.filter(p => p.contestFull === 'amc10b' && p.year === 2022);
console.log(`\nSpot check AMC 10A 2022: ${amc10a_2022.length} problems`);
console.log(`Spot check AMC 10B 2022: ${amc10b_2022.length} problems`);
const aime1_2023 = fixed.filter(p => p.contestFull === 'aime1' && p.year === 2023);
console.log(`Spot check AIME I 2023: ${aime1_2023.length} problems`);

writeFileSync(join(__dirname, 'problems-base.json'), JSON.stringify(fixed, null, 0));
writeFileSync(join(__dirname, 'problems.js'),
  `// MathAtlas Problem Database\n// Generated: ${new Date().toISOString()}\n// ${fixed.length} problems, ${withAnswers} with answers\nwindow.MA_PROBLEMS = ${JSON.stringify(fixed, null, 0)};\n`
);
console.log('\n✅ Saved problems-base.json and problems.js');
console.log('Next: git add problems-base.json problems.js && git commit && git push && vercel --prod');