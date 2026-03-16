/**
 * MathAtlas Answer Scraper
 * ========================
 * Scrapes all AMC/AIME answer keys from AoPS wiki
 * Run: node scrape-answers.js
 * Output: problems.js (commit this to GitHub)
 *
 * Requirements: Node.js 18+ (uses built-in fetch)
 * Cost: $0.00 — just HTTP requests to public pages
 * Time: ~12-15 minutes (rate limited to be polite to AoPS)
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load base problem list ───────────────────────────────
const problems = JSON.parse(readFileSync(join(__dirname, 'problems-base.json'), 'utf8'));

// ─── AoPS answer key page URLs ────────────────────────────
function answerPageUrl(prob) {
  const { contestFull, year, link } = prob;
  // Answer keys are on the main contest page, not individual problem pages
  const cf = contestFull || prob.contest;
  if (cf === 'amc8')   return `https://artofproblemsolving.com/wiki/index.php/${year}_AMC_8_Answer_Key`;
  if (cf === 'amc10a') return `https://artofproblemsolving.com/wiki/index.php/${year}_AMC_10A_Answer_Key`;
  if (cf === 'amc10b') return `https://artofproblemsolving.com/wiki/index.php/${year}_AMC_10B_Answer_Key`;
  if (cf === 'amc12a') return `https://artofproblemsolving.com/wiki/index.php/${year}_AMC_12A_Answer_Key`;
  if (cf === 'amc12b') return `https://artofproblemsolving.com/wiki/index.php/${year}_AMC_12B_Answer_Key`;
  if (cf === 'aime1')  return `https://artofproblemsolving.com/wiki/index.php/${year}_AIME_I_Answer_Key`;
  if (cf === 'aime2')  return `https://artofproblemsolving.com/wiki/index.php/${year}_AIME_II_Answer_Key`;
  // fallback
  return null;
}

// ─── Parse AMC answers from AoPS answer key page ──────────
function parseAmcAnswers(html) {
  // AoPS answer key pages list answers like:
  // "1. B  2. C  3. A ..." or in a table/list format
  const answers = {};

  // Pattern 1: ordered list items with answer letters
  const olPattern = /<li>\s*([ABCDE])\s*<\/li>/gi;
  let liMatches = [...html.matchAll(olPattern)];
  if (liMatches.length >= 10) {
    liMatches.forEach((m, i) => { answers[i + 1] = m[1]; });
    return answers;
  }

  // Pattern 2: "Problem N: X" style
  const pPattern = /problem\s+(\d+)[:\.\s]+([ABCDE])\b/gi;
  let pMatches = [...html.matchAll(pPattern)];
  if (pMatches.length >= 10) {
    pMatches.forEach(m => { answers[parseInt(m[1])] = m[2]; });
    return answers;
  }

  // Pattern 3: bold/strong tagged answers in a list
  const boldPattern = /<(?:b|strong)>\s*([ABCDE])\s*<\/(?:b|strong)>/gi;
  let boldMatches = [...html.matchAll(boldPattern)];
  if (boldMatches.length >= 10) {
    boldMatches.forEach((m, i) => { answers[i + 1] = m[1]; });
    return answers;
  }

  // Pattern 4: wikitable rows
  const tdPattern = /<td[^>]*>\s*([ABCDE])\s*<\/td>/gi;
  let tdMatches = [...html.matchAll(tdPattern)];
  if (tdMatches.length >= 10) {
    tdMatches.forEach((m, i) => { answers[i + 1] = m[1]; });
    return answers;
  }

  return answers;
}

// ─── Parse AIME answers (3-digit integers 000-999) ────────
function parseAimeAnswers(html) {
  const answers = {};

  // Pattern: list items with 3-digit numbers
  const liPattern = /<li>\s*(\d{1,3})\s*<\/li>/gi;
  let liMatches = [...html.matchAll(liPattern)];
  if (liMatches.length >= 10) {
    liMatches.forEach((m, i) => {
      answers[i + 1] = String(parseInt(m[1])).padStart(3, '0');
    });
    return answers;
  }

  // Pattern: "Problem N: DDD"
  const pPattern = /problem\s+(\d+)[:\.\s]+(\d{1,3})\b/gi;
  let pMatches = [...html.matchAll(pPattern)];
  if (pMatches.length >= 10) {
    pMatches.forEach(m => {
      answers[parseInt(m[1])] = String(parseInt(m[2])).padStart(3, '0');
    });
    return answers;
  }

  // Pattern: bold 1-3 digit numbers in sequence
  const boldPattern = /<(?:b|strong)>\s*(\d{1,3})\s*<\/(?:b|strong)>/gi;
  let boldMatches = [...html.matchAll(boldPattern)];
  if (boldMatches.length >= 10) {
    boldMatches.forEach((m, i) => {
      answers[i + 1] = String(parseInt(m[1])).padStart(3, '0');
    });
    return answers;
  }

  return answers;
}

// ─── Fetch with retry and rate limiting ───────────────────
async function fetchWithRetry(url, retries = 3, delay = 300) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'MathAtlas/1.0 (educational platform; mathatlas.vercel.app)',
          'Accept': 'text/html'
        },
        signal: AbortSignal.timeout(15000)
      });
      if (res.ok) return await res.text();
      if (res.status === 404) return null; // page doesn't exist
      if (res.status === 429) {
        console.log(`  Rate limited, waiting ${delay * 3}ms...`);
        await sleep(delay * 3);
      }
    } catch (e) {
      if (attempt === retries - 1) console.log(`  Failed: ${url} — ${e.message}`);
      await sleep(delay);
    }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Main scrape loop ─────────────────────────────────────
async function scrapeAll() {
  console.log('MathAtlas Answer Scraper');
  console.log('========================');
  console.log(`Loaded ${problems.length} problems`);

  // Group problems by their answer key page
  const pageGroups = {};
  for (const prob of problems) {
    if (prob.answer) continue; // already have it
    const url = answerPageUrl(prob);
    if (!url) continue;
    if (!pageGroups[url]) pageGroups[url] = [];
    pageGroups[url].push(prob);
  }

  const totalPages = Object.keys(pageGroups).length;
  console.log(`\nFetching ${totalPages} answer key pages...`);
  console.log('(~12-15 minutes with rate limiting)\n');

  let filled = 0;
  let failed = 0;
  let pagesDone = 0;

  for (const [url, probs] of Object.entries(pageGroups)) {
    pagesDone++;
    const isAime = url.includes('AIME');
    process.stdout.write(`[${pagesDone}/${totalPages}] ${url.split('/').pop()}... `);

    const html = await fetchWithRetry(url);
    if (!html) {
      console.log('❌ failed');
      failed += probs.length;
      await sleep(500);
      continue;
    }

    const answers = isAime ? parseAimeAnswers(html) : parseAmcAnswers(html);
    const found = Object.keys(answers).length;

    if (found < 5) {
      // Try fallback: scrape individual problem pages
      console.log(`⚠️  only ${found} answers found, trying individual pages...`);
      for (const prob of probs) {
        const probHtml = await fetchWithRetry(prob.link);
        if (probHtml) {
          // Look for answer in problem page
          const match = probHtml.match(/answer[^<]*?is[^<]*?\\b([ABCDE]|\\d{1,3})\\b/i);
          if (match) {
            prob.answer = isAime ? String(parseInt(match[1])).padStart(3,'0') : match[1];
            filled++;
          }
        }
        await sleep(200);
      }
    } else {
      probs.forEach(prob => {
        const ans = answers[prob.num];
        if (ans) { prob.answer = ans; filled++; }
        else failed++;
      });
      console.log(`✅ ${found} answers`);
    }

    // Rate limit: wait 200-400ms between pages
    await sleep(200 + Math.random() * 200);
  }

  // ─── Write output ───────────────────────────────────────
  const alreadyHad = problems.filter(p => p.answer).length - filled;
  console.log('\n════════════════════════════');
  console.log(`✅ Filled: ${filled} new answers`);
  console.log(`📦 Already had: ${alreadyHad}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total with answers: ${problems.filter(p=>p.answer).length} / ${problems.length}`);

  // Write problems.js
  const jsContent = `// MathAtlas Problem Database
// Generated: ${new Date().toISOString()}
// ${problems.length} problems, ${problems.filter(p=>p.answer).length} with verified answers
// DO NOT EDIT — regenerate with: node scrape-answers.js

window.MA_PROBLEMS = ${JSON.stringify(problems, null, 0)};
`;

  writeFileSync(join(__dirname, 'problems.js'), jsContent);
  console.log('\n✅ Written to problems.js — commit this to GitHub!');
  console.log('   Next step: run node tag-topics.js to add technique tags');
}

scrapeAll().catch(console.error);
