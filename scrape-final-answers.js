/**
 * MathAtlas Final Answer Patcher
 * ================================
 * Targets the specific failure patterns:
 * 1. AMC 10/12 problems 26-30 (answer key only returned 25, not 30)
 * 2. AMC 8 1985-1998 (old page format)
 * 3. AJHSME 1999, AHSME 1960-1967 (old format)
 * 4. Any other stragglers via individual page scraping
 *
 * Run: node scrape-final-answers.js
 * Time: ~15-20 minutes
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchPage(url) {
  for (let i = 0; i < 3; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MathAtlas/1.0 (educational; mathatlas.vercel.app)' },
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch (e) { await sleep(300); }
  }
  return null;
}

// Extract answer from an individual AoPS problem page
// Tries many different patterns used across different eras
function extractAnswer(html, isAime) {
  if (!html) return null;

  if (isAime) {
    const patterns = [
      /\\boxed\{(\d{1,3})\}/,
      /\\boxed\s*\{(\d{1,3})\}/,
      /answer(?:\s+is)?\s*[:\s]\s*\\boxed\{(\d{1,3})\}/i,
      /\bThe answer is\s+(\d{1,3})\b/i,
      /answer.*?(\d{3})\b/i,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) return String(parseInt(m[1])).padStart(3, '0');
    }
  } else {
    // Modern format: \textbf{(A)} or \boxed{\textbf{(A)}}
    const patterns = [
      /\\boxed\{\\textbf\{\(?([ABCDE])\)?\}\}/,
      /\\textbf\{\(?([ABCDE])\)?\}/,
      /\\textbf\{([ABCDE])\}/,
      // Old format: \mathrm{(A)} used pre-2000
      /\\mathrm\{\(?([ABCDE])\)?\}/,
      /\\mathrm\{([ABCDE])\}/,
      // Text patterns
      /answer is[^<]{0,50}\(([ABCDE])\)/i,
      /answer is[^<]{0,30}\b([ABCDE])\b/i,
      /\(([ABCDE])\)\s*(?:is correct|is the answer)/i,
      // Solution box patterns
      /The answer is\s*\(?([ABCDE])\)?/i,
      /answer\s*=\s*\(?([ABCDE])\)?/i,
      // Wiki table patterns for old exams
      /\|\s*([ABCDE])\s*\n/,
      />\s*([ABCDE])\s*<\/(?:td|th)>/,
    ];
    for (const p of patterns) {
      const m = html.match(p);
      if (m) return m[1];
    }
  }
  return null;
}

// Try alternate answer key URL formats
async function tryAnswerKey(contestFull, year) {
  const isAime = contestFull.includes('aime');
  const urlVariants = [];

  if (contestFull === 'amc8') {
    urlVariants.push(
      `https://artofproblemsolving.com/wiki/index.php/${year}_AMC_8_Answer_Key`,
      `https://artofproblemsolving.com/wiki/index.php/${year}_AMC_8_Problems`, // answers sometimes on problems page
    );
  } else if (contestFull === 'ajhsme') {
    urlVariants.push(
      `https://artofproblemsolving.com/wiki/index.php/${year}_AJHSME_Answer_Key`,
      `https://artofproblemsolving.com/wiki/index.php/${year}_AJHSME_Problems`,
    );
  } else if (contestFull === 'ahsme') {
    urlVariants.push(
      `https://artofproblemsolving.com/wiki/index.php/${year}_AHSME_Answer_Key`,
      `https://artofproblemsolving.com/wiki/index.php/${year}_AHSME_Problems`,
    );
  } else if (contestFull === 'amc10a') {
    urlVariants.push(`https://artofproblemsolving.com/wiki/index.php/${year}_AMC_10A_Answer_Key`);
  } else if (contestFull === 'amc10b') {
    urlVariants.push(`https://artofproblemsolving.com/wiki/index.php/${year}_AMC_10B_Answer_Key`);
  } else if (contestFull === 'amc12a') {
    urlVariants.push(`https://artofproblemsolving.com/wiki/index.php/${year}_AMC_12A_Answer_Key`);
  } else if (contestFull === 'amc12b') {
    urlVariants.push(`https://artofproblemsolving.com/wiki/index.php/${year}_AMC_12B_Answer_Key`);
  } else if (contestFull === 'amc10') {
    urlVariants.push(`https://artofproblemsolving.com/wiki/index.php/${year}_AMC_10_Answer_Key`);
  } else if (contestFull === 'amc12') {
    urlVariants.push(`https://artofproblemsolving.com/wiki/index.php/${year}_AMC_12_Answer_Key`);
  }

  for (const url of urlVariants) {
    const html = await fetchPage(url);
    if (!html) continue;
    const answers = parseAnswerKeyPage(html, isAime);
    if (Object.keys(answers).length >= 10) return answers;
  }
  return {};
}

function parseAnswerKeyPage(html, isAime) {
  const answers = {};
  if (isAime) {
    // Try numbered list
    const rows = [...html.matchAll(/(?:^|\n)\s*(?:\d+[\.\)]?\s+)?(\d{1,3})\s*(?:\n|$)/gm)];
    const nums = rows.map(r => r[1]).filter(n => parseInt(n) <= 999);
    if (nums.length >= 10) nums.slice(0, 15).forEach((n, i) => { answers[i+1] = String(parseInt(n)).padStart(3,'0'); });
  } else {
    // Try to find 25-30 consecutive A/B/C/D/E answers
    const allLetters = [...html.matchAll(/\b([ABCDE])\b/g)].map(m => m[1]);
    // Find longest consecutive run
    let best = [], cur = [];
    for (const l of allLetters) {
      cur.push(l);
      if (cur.length > best.length) best = [...cur];
      if (cur.length > 30) cur.shift();
    }
    if (best.length >= 20) {
      // Find the 25-30 length window
      const window = best.slice(0, Math.min(30, best.length));
      window.forEach((l, i) => { answers[i+1] = l; });
    }

    // Also try explicit list patterns
    const listMatch = [...html.matchAll(/<li>\s*([ABCDE])\s*<\/li>/gi)];
    if (listMatch.length >= 20) {
      listMatch.forEach((m, i) => { answers[i+1] = m[1]; });
    }
  }
  return answers;
}

async function main() {
  console.log('MathAtlas Final Answer Patcher');
  console.log('================================');

  const problems = JSON.parse(readFileSync(join(__dirname, 'problems-base.json'), 'utf8'));
  const before = problems.filter(p => p.answer).length;
  const missing = problems.filter(p => !p.answer);

  console.log(`Before: ${before}/${problems.length} (${Math.round(before/problems.length*100)}%)`);
  console.log(`Missing: ${missing.length}\n`);

  if (missing.length === 0) { console.log('Already at 100%!'); return; }

  // Group by contest+year
  const groups = {};
  for (const p of missing) {
    const key = `${p.contestFull}-${p.year}`;
    if (!groups[key]) groups[key] = { contestFull: p.contestFull, year: p.year, problems: [] };
    groups[key].problems.push(p);
  }

  const entries = Object.entries(groups).sort((a,b) => b[1].problems.length - a[1].problems.length);
  console.log(`${entries.length} contest groups to process\n`);

  let filled = 0;

  for (let gi = 0; gi < entries.length; gi++) {
    const [, group] = entries[gi];
    const n = group.problems.length;
    const isAime = group.contestFull.includes('aime');
    process.stdout.write(`[${gi+1}/${entries.length}] ${group.year} ${group.contestFull} (${n} missing)... `);

    let count = 0;

    // Step 1: Try answer key page if many missing
    if (n >= 10) {
      const keyAnswers = await tryAnswerKey(group.contestFull, group.year);
      if (Object.keys(keyAnswers).length >= 10) {
        for (const p of group.problems) {
          if (keyAnswers[p.num] && !p.answer) {
            p.answer = keyAnswers[p.num];
            count++; filled++;
          }
        }
        if (count === n) { console.log(`✅ +${count} from key page`); continue; }
      }
    }

    // Step 2: Individual problem pages for remaining
    const stillMissing = group.problems.filter(p => !p.answer);
    if (stillMissing.length > 0) {
      for (const p of stillMissing) {
        const html = await fetchPage(p.link);
        if (html) {
          const ans = extractAnswer(html, isAime);
          if (ans) { p.answer = ans; count++; filled++; }
        }
        await sleep(60);
      }
    }

    console.log(count > 0 ? `✅ +${count}` : `❌ none`);

    if ((gi + 1) % 10 === 0) {
      writeFileSync(join(__dirname, 'problems-base.json'), JSON.stringify(problems, null, 0));
      process.stdout.write('  [saved]\n');
    }

    await sleep(100);
  }

  // Save
  writeFileSync(join(__dirname, 'problems-base.json'), JSON.stringify(problems, null, 0));
  const after = problems.filter(p => p.answer).length;
  writeFileSync(join(__dirname, 'problems.js'),
    `// MathAtlas Problem Database\n// Updated: ${new Date().toISOString()}\n// ${problems.length} problems, ${after} with answers\nwindow.MA_PROBLEMS = ${JSON.stringify(problems, null, 0)};\n`
  );

  console.log('\n════════════════════════════════');
  console.log(`✅ Filled: ${filled} new answers`);
  console.log(`📊 Before: ${before}/${problems.length} (${Math.round(before/problems.length*100)}%)`);
  console.log(`📊 After:  ${after}/${problems.length} (${Math.round(after/problems.length*100)}%)`);
  console.log('\nNext: git add problems-base.json problems.js && git commit && git push && vercel --prod');
}

main().catch(console.error);
