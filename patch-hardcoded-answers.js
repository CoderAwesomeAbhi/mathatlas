/**
 * Hardcoded Answer Patcher
 * Run: node patch-hardcoded-answers.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const HARDCODED = {
  // AJHSME 1985-1999 (stored as contestFull: 'ajhsme')
  'ajhsme-1985': ['A','B','D','C','C','D','C','A','A','C','E','B','B','B','C','D','D','E','B','C','E','B','E','D','A'],
  'ajhsme-1986': ['A','A','C','C','D','E','B','E','E','B','A','D','C','C','B','A','E','B','D','D','E','C','B','B','D'],
  'ajhsme-1987': ['E','B','E','C','A','B','C','B','C','B','B','C','E','B','D','E','D','C','A','A','C','D','D','D','A'],
  'ajhsme-1988': ['D','C','D','B','C','E','B','B','D','A','E','C','D','E','C','E','B','C','A','C','C','E','D','A','A'],
  'ajhsme-1989': ['E','D','A','E','D','C','D','E','C','D','B','E','A','C','D','A','B','B','B','D','D','C','C','E','C'],
  'ajhsme-1990': ['C','A','E','E','B','D','C','D','D','A','E','B','C','B','E','D','A','C','B','A','B','B','B','C','C'],
  'ajhsme-1991': ['B','C','E','E','B','C','D','D','B','B','B','D','C','D','C','B','C','C','C','A','A','D','A','E','C'],
  'ajhsme-1992': ['B','D','D','E','E','D','A','C','B','B','B','C','B','D','C','B','B','A','C','D','B','C','A','A','D'],
  'ajhsme-1993': ['C','C','B','E','C','B','A','D','D','B','C','E','D','C','A','C','B','A','A','D','D','D','C','C','E'],
  'ajhsme-1994': ['D','D','C','B','B','A','B','C','A','A','B','A','C','E','A','E','D','B','E','D','C','D','D','B','A'],
  'ajhsme-1995': ['D','C','E','C','C','C','B','D','C','A','D','E','E','B','B','C','D','C','D','B','B','A','B','C','D'],
  'ajhsme-1996': ['B','C','A','B','A','C','B','B','D','D','D','B','E','B','E','C','C','A','C','A','D','B','E','C','A'],
  'ajhsme-1997': ['C','D','B','E','A','C','D','B','C','C','A','D','A','D','B','E','E','B','D','A','D','E','C','C','D'],
  'ajhsme-1998': ['B','E','B','E','B','B','D','C','C','E','C','A','C','E','D','B','C','B','A','D','B','D','C','E','D'],
  'ajhsme-1999': ['A','C','D','A','D','E','E','A','C','E','D','B','C','D','D','B','C','E','B','B','B','D','C','B','A'],

  // AMC 8 1985-1998 (same answers, different contestFull key)
  'amc8-1985': ['A','B','D','C','C','D','C','A','A','C','E','B','B','B','C','D','D','E','B','C','E','B','E','D','A'],
  'amc8-1986': ['A','A','C','C','D','E','B','E','E','B','A','D','C','C','B','A','E','B','D','D','E','C','B','B','D'],
  'amc8-1987': ['E','B','E','C','A','B','C','B','C','B','B','C','E','B','D','E','D','C','A','A','C','D','D','D','A'],
  'amc8-1988': ['D','C','D','B','C','E','B','B','D','A','E','C','D','E','C','E','B','C','A','C','C','E','D','A','A'],
  'amc8-1989': ['E','D','A','E','D','C','D','E','C','D','B','E','A','C','D','A','B','B','B','D','D','C','C','E','C'],
  'amc8-1990': ['C','A','E','E','B','D','C','D','D','A','E','B','C','B','E','D','A','C','B','A','B','B','B','C','C'],
  'amc8-1991': ['B','C','E','E','B','C','D','D','B','B','B','D','C','D','C','B','C','C','C','A','A','D','A','E','C'],
  'amc8-1992': ['B','D','D','E','E','D','A','C','B','B','B','C','B','D','C','B','B','A','C','D','B','C','A','A','D'],
  'amc8-1993': ['C','C','B','E','C','B','A','D','D','B','C','E','D','C','A','C','B','A','A','D','D','D','C','C','E'],
  'amc8-1994': ['D','D','C','B','B','A','B','C','A','A','B','A','C','E','A','E','D','B','E','D','C','D','D','B','A'],
  'amc8-1995': ['D','C','E','C','C','C','B','D','C','A','D','E','E','B','B','C','D','C','D','B','B','A','B','C','D'],
  'amc8-1996': ['B','C','A','B','A','C','B','B','D','D','D','B','E','B','E','C','C','A','C','A','D','B','E','C','A'],
  'amc8-1997': ['C','D','B','E','A','C','D','B','C','C','A','D','A','D','B','E','E','B','D','A','D','E','C','C','D'],
  'amc8-1998': ['B','E','B','E','B','B','D','C','C','E','C','A','C','E','D','B','C','B','A','D','B','D','C','E','D'],

  // AHSME 1960-1967 (40 problems each)
  'ahsme-1960': ['E','C','B','C','C','B','D','D','E','E','D','D','B','E','B','C','A','E','C','D','E','A','C','A','D','B','E','B','A','C','D','A','A','C','C','B','A','D','E','A'],
  'ahsme-1961': ['E','B','A','C','D','C','D','B','C','D','B','B','E','B','E','A','D','C','A','C','C','C','B','D','D','B','D','E','B','D','B','D','C','E','C','C','B','A','C','D'],
  'ahsme-1962': ['C','D','E','B','A','C','B','D','C','E','A','B','B','C','E','C','C','A','E','D','D','B','B','E','C','E','A','D','D','E','E','C','B','D','D','B','B','B','C','A'],
  'ahsme-1963': ['E','C','D','D','B','B','C','C','D','E','B','B','E','C','A','B','E','B','D','E','A','B','C','D','E','B','C','A','E','E','B','E','B','C','D','A','B','B','C','D'],
  'ahsme-1964': ['C','E','C','D','B','D','B','E','D','D','B','C','E','E','C','B','E','C','D','B','B','E','C','D','A','B','B','C','D','A','B','B','D','D','B','D','C','E','C','C'],
  'ahsme-1965': ['B','B','C','D','D','C','C','B','E','C','A','C','B','D','E','C','A','D','D','B','B','E','D','C','C','E','C','D','B','B','C','C','D','C','D','D','E','B','B','B'],
  'ahsme-1966': ['C','B','E','A','D','B','D','E','B','C','E','D','A','C','B','E','C','D','C','B','D','A','C','E','E','D','B','E','C','D','D','C','B','C','B','B','D','C','C','D'],
  'ahsme-1967': ['C','B','A','C','D','E','C','C','D','B','C','B','B','D','C','E','A','D','D','E','B','E','A','C','D','E','B','C','E','B','C','D','E','C','B','C','D','D','B','E'],

  // AMC 12A missing
  'amc12a-2013': ['D','B','D','E','C','A','B','D','C','D','B','B','C','D','C','E','D','C','B','E','A','B','E','B','C'],
  'amc12a-2014': ['D','D','B','E','B','E','C','C','E','D','C','D','C','A','B','C','D','D','B','B','C','C','E','B','C'],
  'amc12a-2016': ['C','B','C','D','E','D','B','C','D','E','D','C','C','B','E','E','C','D','B','D','E','B','D','A','E'],
  'amc12a-2020': ['C','C','D','D','C','E','B','C','B','E','D','B','D','C','A','E','D','B','A','E','D','D','E','B','C'],
  'amc12a-2021': ['B','B','C','D','B','B','D','C','D','B','B','D','B','D','A','E','B','D','C','C','B','B','D','E','C'],

  // AMC 10A missing
  'amc10a-2013': ['D','B','C','D','E','C','B','D','E','C','E','B','B','D','C','E','B','D','C','B','D','C','B','C','D'],
  'amc10a-2015': ['C','E','D','B','D','C','C','C','E','B','B','D','E','B','B','D','D','E','B','B','C','C','C','B','E'],
  'amc10a-2016': ['C','B','C','D','E','C','E','B','C','D','E','D','C','C','B','E','E','D','B','E','A','C','B','B','D'],
  'amc10a-2017': ['C','B','D','B','C','C','E','E','C','C','D','C','B','D','B','E','A','D','D','C','D','E','E','B','C'],
  'amc10a-2020': ['C','D','C','D','E','C','D','B','D','C','B','D','B','D','D','E','A','C','D','A','B','D','D','C','D'],
  'amc10a-2021': ['D','B','C','B','C','E','B','D','E','B','B','D','B','B','E','D','A','B','C','D','B','C','C','E','C'],

  // AMC 10B missing
  'amc10b-2011': ['E','E','C','D','B','D','C','D','B','B','E','B','B','B','D','B','C','D','D','C','B','C','E','C','A'],
  'amc10b-2012': ['D','B','C','D','B','D','E','B','D','A','B','B','D','D','D','B','C','D','C','C','D','E','D','C','E'],
  'amc10b-2013': ['D','B','E','E','C','A','B','D','C','D','E','B','B','C','D','C','B','E','E','A','B','D','B','D','D'],
  'amc10b-2020': ['D','B','D','C','C','D','B','B','C','E','C','B','D','E','E','A','C','D','B','A','E','D','D','E','C'],
  'amc10b-2022': ['B','C','D','B','D','B','C','A','E','D','B','C','B','C','E','B','D','D','E','A','B','D','E','E','C'],

  // AIME missing
  'aime2-2011': ['007','031','009','211','442','091','024','182','080','513','102','126','680','527','432'],
  'aime2-2022': ['060','010','216','252','196','600','154','157','108','085','301','024','052','601','025'],
  'aime1-2010': ['014','035','120','065','084','021','016','125','054','480','162','532','231','013','315'],
};

const problems = JSON.parse(readFileSync(join(__dirname, 'problems-base.json'), 'utf8'));
const before = problems.filter(p => p.answer).length;
let filled = 0;

for (const prob of problems) {
  if (prob.answer) continue;
  const key = `${prob.contestFull}-${prob.year}`;
  const answers = HARDCODED[key];
  if (!answers) continue;
  const ans = answers[prob.num - 1];
  if (ans) { prob.answer = ans; filled++; }
}

writeFileSync(join(__dirname, 'problems-base.json'), JSON.stringify(problems, null, 0));
const after = problems.filter(p => p.answer).length;
writeFileSync(join(__dirname, 'problems.js'),
  `// MathAtlas Problem Database\n// Updated: ${new Date().toISOString()}\n// ${problems.length} problems, ${after} with answers\nwindow.MA_PROBLEMS = ${JSON.stringify(problems, null, 0)};\n`
);

console.log(`✅ Filled: ${filled} answers`);
console.log(`📊 Before: ${before}/${problems.length} (${Math.round(before/problems.length*100)}%)`);
console.log(`📊 After:  ${after}/${problems.length} (${Math.round(after/problems.length*100)}%)`);
console.log('\nNext: git add problems-base.json problems.js && git commit && git push && vercel --prod');
