/**
 * Rebuilds problems.js from problems-base.json
 * Run: node rebuild-problems-js.js
 */
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const problems = JSON.parse(readFileSync(join(__dirname, 'problems-base.json'), 'utf8'));
const withAnswers = problems.filter(p => p.answer).length;

writeFileSync(join(__dirname, 'problems.js'),
  `// MathAtlas Problem Database\n// Generated: ${new Date().toISOString()}\n// ${problems.length} problems, ${withAnswers} with answers (${Math.round(withAnswers/problems.length*100)}%)\nwindow.MA_PROBLEMS = ${JSON.stringify(problems, null, 0)};\n`
);

console.log(`✅ Done: ${problems.length} problems written to problems.js`);
console.log(`📊 Answers: ${withAnswers}/${problems.length} (${Math.round(withAnswers/problems.length*100)}%)`);
