/**
 * MathAtlas Missing Answer Patcher
 * =================================
 * Only processes problems that are actually missing answers.
 * Skips anything already filled. Goes straight to individual
 * problem pages for small gaps, uses answer key pages for large gaps.
 *
 * Run: node scrape-missing-answers.js
 * Time: ~5-10 minutes
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'MathAtlas/1.0 (educational; mathatlas.vercel.app)' },
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) return null;
    return await res.text();
  } catch (e) { return null; }
}

function extractAnswersFromKeyPage(html, isAime) {
  const answers = {};
  if (isAime) {
    const matches = [...html.matchAll(/<li>\s*(\d{1,3})\s*<\/li>/gi)];
    if (matches.length >= 10) matches.forEach((m, i) => { answers[i+1] = m[1].padStart(3,'0'); });
  } else {
    const patterns = [
      /<li>\s*([ABCDE])\s*<\/li>/gi,
      /\|\s*([ABCDE])\s*\|/g,
      /<td[^>]*>\s*([ABCDE])\s*<\/td>/gi,
    ];
    for (const pat of patterns) {
      const matches = [...html.matchAll(pat)];
      if (matches.length >= 20) {
        matches.forEach((m, i) => { answers[i+1] = m[1]; });
        break;
      }
    }
  }
  return answers;
}

function extractAnswerFromProblemPage(html, isAime) {
  if (isAime) {
    const patterns = [/\\boxed\{(\d{1,3})\}/, /answer is[^<]{0,20}?(\d{3})/i];
    for (const p of patterns) { const m = html.match(p); if (m) return m[1].padStart(3,'0'); }
  } else {
    const patterns = [
      /\\boxed\{\\textbf\{\(?([ABCDE])\)?\}\}/,
      /\\textbf\{\(?([ABCDE])\)?\}/,
      /answer is[^<]{0,30}\b([ABCDE])\b/i,
      /\(([ABCDE])\)\s*(?:is correct|is the answer)/i,
    ];
    for (const p of patterns) { const m = html.match(p); if (m) return m[1]; }
  }
  return null;
}

async function main() {
  console.log('MathAtlas Missing Answer Patcher');
  console.log('=================================');

  const problems = JSON.parse(readFileSync(join(__dirname, 'problems-base.json'), 'utf8'));
  const missing = problems.filter(p => !p.answer);

  console.log(`Total problems: ${problems.length}`);
  console.log(`Already have answers: ${problems.length - missing.length}`);
  console.log(`Missing answers: ${missing.length}\n`);

  if (missing.length === 0) { console.log('Nothing to do!'); return; }

  // Group ONLY the missing problems by contest+year
  const groups = {};
  for (const p of missing) {
    const key = `${p.contestFull}-${p.year}`;
    if (!groups[key]) groups[key] = { contestFull: p.contestFull, year: p.year, problems: [] };
    groups[key].problems.push(p);
  }

  const groupEntries = Object.entries(groups);
  console.log(`Processing ${groupEntries.length} contest years with gaps...\n`);

  let filled = 0;

  for (let gi = 0; gi < groupEntries.length; gi++) {
    const [, group] = groupEntries[gi];
    const isAime = group.contestFull.includes('aime');
    const n = group.problems.length;

    process.stdout.write(`[${gi+1}/${groupEntries.length}] ${group.year} ${group.contestFull} — ${n} missing... `);

    let count = 0;

    // If more than 10 missing, try the answer key page first (1 fetch vs many)
    if (n > 10) {
      const urlName = group.contestFull === 'ajhsme' ? 'AJHSME'
        : group.contestFull === 'amc8' ? 'AMC_8'
        : group.contestFull === 'ahsme' ? 'AHSME'
        : group.contestFull.toUpperCase().replace('AMC', 'AMC_').replace('AIME', 'AIME_');
      const keyUrl = `https://artofproblemsolving.com/wiki/index.php/${group.year}_${urlName}_Answer_Key`;
      const html = await fetchPage(keyUrl);
      if (html) {
        const answers = extractAnswersFromKeyPage(html, isAime);
        for (const p of group.problems) {
          if (answers[p.num]) { p.answer = answers[p.num]; count++; filled++; }
        }
      }
    }

    // For any still missing (or if answer key failed), scrape individual pages
    const stillMissing = group.problems.filter(p => !p.answer);
    for (const p of stillMissing) {
      const html = await fetchPage(p.link);
      if (html) {
        const ans = extractAnswerFromProblemPage(html, isAime);
        if (ans) { p.answer = ans; count++; filled++; }
      }
      await sleep(80);
    }

    console.log(count > 0 ? `✅ +${count} answers` : `❌ none found`);

    // Save every 10 groups
    if ((gi + 1) % 10 === 0) {
      writeFileSync(join(__dirname, 'problems-base.json'), JSON.stringify(problems, null, 0));
    }

    await sleep(150);
  }

  // Final save
  writeFileSync(join(__dirname, 'problems-base.json'), JSON.stringify(problems, null, 0));

  const withAnswers = problems.filter(p => p.answer).length;
  writeFileSync(join(__dirname, 'problems.js'),
    `// MathAtlas Problem Database\n// Updated: ${new Date().toISOString()}\n// ${problems.length} problems, ${withAnswers} with answers\nwindow.MA_PROBLEMS = ${JSON.stringify(problems, null, 0)};\n`
  );

  console.log('\n══════════════════════════════');
  console.log(`✅ Filled: ${filled} new answers`);
  console.log(`📊 Total with answers: ${withAnswers} / ${problems.length} (${Math.round(withAnswers/problems.length*100)}%)`);
  console.log('\nNext: git add problems-base.json problems.js && git commit && git push && vercel --prod');
}

main().catch(console.error);