/**
 * MathAtlas Full Problem Scraper
 * ==============================
 * Scrapes ALL AMC 8, AMC 10, AMC 12, AIME, AHSME, AJHSME problems from AoPS
 * Outputs: problems-base.json (complete database)
 *
 * Run: node scrape-all-problems.js
 * Time: ~25-35 minutes
 * Cost: $0 — just HTTP requests
 *
 * Requirements: Node.js 18+
 */

import { writeFileSync, existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECKPOINT_PATH = join(__dirname, 'scrape-checkpoint.json');
const OUTPUT_PATH = join(__dirname, 'problems-base.json');

// ─── All contests to scrape ───────────────────────────────
const CONTESTS = [
  // AMC 8 (1985–2024)
  ...range(1985, 2024).map(y => ({ year: y, contest: 'amc8', contestFull: 'amc8', display: `AMC 8 ${y}`, problems: 25, domain: 'mixed', elo_base: 600, url: `${y}_AMC_8` })),

  // AJHSME (1985–1999) — predecessor to AMC 8
  ...range(1985, 1999).map(y => ({ year: y, contest: 'amc8', contestFull: 'ajhsme', display: `AJHSME ${y}`, problems: 25, domain: 'mixed', elo_base: 600, url: `${y}_AJHSME` })),

  // AHSME (1950–1999) — predecessor to AMC 12
  ...range(1950, 1999).map(y => {
    const numProblems = y >= 1968 ? 30 : y >= 1960 ? 50 : 50;
    return { year: y, contest: 'amc12', contestFull: 'ahsme', display: `AHSME ${y}`, problems: numProblems, domain: 'mixed', elo_base: 950, url: `${y}_AHSME` };
  }),

  // AMC 10A (2002–2024)
  ...range(2002, 2024).map(y => ({ year: y, contest: 'amc10', contestFull: 'amc10a', display: `AMC 10A ${y}`, problems: 30, domain: 'mixed', elo_base: 900, url: `${y}_AMC_10A` })),

  // AMC 10B (2002–2024)
  ...range(2002, 2024).map(y => ({ year: y, contest: 'amc10', contestFull: 'amc10b', display: `AMC 10B ${y}`, problems: 30, domain: 'mixed', elo_base: 900, url: `${y}_AMC_10B` })),

  // AMC 10 unified (2000–2001, before A/B split)
  ...range(2000, 2001).map(y => ({ year: y, contest: 'amc10', contestFull: 'amc10', display: `AMC 10 ${y}`, problems: 25, domain: 'mixed', elo_base: 900, url: `${y}_AMC_10` })),

  // AMC 12A (2002–2024)
  ...range(2002, 2024).map(y => ({ year: y, contest: 'amc12', contestFull: 'amc12a', display: `AMC 12A ${y}`, problems: 30, domain: 'mixed', elo_base: 1100, url: `${y}_AMC_12A` })),

  // AMC 12B (2002–2024)
  ...range(2002, 2024).map(y => ({ year: y, contest: 'amc12', contestFull: 'amc12b', display: `AMC 12B ${y}`, problems: 30, domain: 'mixed', elo_base: 1100, url: `${y}_AMC_12B` })),

  // AMC 12 unified (2000–2001)
  ...range(2000, 2001).map(y => ({ year: y, contest: 'amc12', contestFull: 'amc12', display: `AMC 12 ${y}`, problems: 30, domain: 'mixed', elo_base: 1100, url: `${y}_AMC_12` })),

  // AIME I (1983–2024)
  ...range(1983, 2024).map(y => ({ year: y, contest: 'aime', contestFull: y >= 2000 ? 'aime1' : 'aime', display: y >= 2000 ? `AIME I ${y}` : `AIME ${y}`, problems: 15, domain: 'mixed', elo_base: 1400, url: y >= 2000 ? `${y}_AIME_I` : `${y}_AIME` })),

  // AIME II (2000–2024)
  ...range(2000, 2024).map(y => ({ year: y, contest: 'aime', contestFull: 'aime2', display: `AIME II ${y}`, problems: 15, domain: 'mixed', elo_base: 1450, url: `${y}_AIME_II` })),
];

function range(start, end) {
  return Array.from({ length: end - start + 1 }, (_, i) => start + i);
}

// ─── Elo estimation by position ──────────────────────────
function estimateElo(contestFull, year, num, totalProblems) {
  const bases = {
    amc8: 500, ajhsme: 500,
    amc10: 700, amc10a: 700, amc10b: 700,
    amc12: 900, amc12a: 900, amc12b: 900, ahsme: 900,
    aime: 1300, aime1: 1300, aime2: 1350
  };
  const base = bases[contestFull] || 800;
  const pct = (num - 1) / (totalProblems - 1);

  if (contestFull.includes('aime')) {
    return Math.round(1250 + pct * 700); // 1250–1950
  } else if (contestFull.includes('amc12') || contestFull === 'ahsme') {
    return Math.round(800 + pct * 700);  // 800–1500
  } else if (contestFull.includes('amc10')) {
    return Math.round(700 + pct * 600);  // 700–1300
  } else { // amc8 / ajhsme
    return Math.round(480 + pct * 480);  // 480–960
  }
}

// ─── Domain guesser by problem position ──────────────────
function guessDomain(num, total, contestFull) {
  if (contestFull.includes('aime')) {
    const domains = ['number-theory','algebra','counting','geometry','probability','algebra','number-theory','counting','geometry','algebra','number-theory','counting','probability','geometry','algebra'];
    return domains[(num - 1) % domains.length];
  }
  const pct = num / total;
  if (pct < 0.25) return 'algebra';
  if (pct < 0.45) return 'geometry';
  if (pct < 0.65) return 'counting';
  if (pct < 0.82) return 'number-theory';
  return 'probability';
}

// ─── Fetch with retry ─────────────────────────────────────
async function fetchWithRetry(url, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'MathAtlas/1.0 (educational; mathatlas.vercel.app)' },
        signal: AbortSignal.timeout(12000)
      });
      if (res.ok) return await res.text();
      if (res.status === 404) return null;
    } catch (e) {
      if (i === retries - 1) return null;
      await sleep(500);
    }
  }
  return null;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Parse answer from AoPS answer key page ───────────────
function parseAnswers(html, isAime) {
  const answers = {};
  if (isAime) {
    const patterns = [
      /<li>\s*(\d{1,3})\s*<\/li>/gi,
      /problem\s+(\d+)[:\.\s]+(\d{1,3})\b/gi,
      /<(?:b|strong)>\s*(\d{1,3})\s*<\/(?:b|strong)>/gi,
    ];
    for (const pat of patterns) {
      const matches = [...html.matchAll(pat)];
      if (matches.length >= 10) {
        if (pat.source.includes('problem')) {
          matches.forEach(m => { answers[parseInt(m[1])] = m[2].padStart(3,'0'); });
        } else {
          matches.forEach((m, i) => { answers[i + 1] = String(parseInt(m[1])).padStart(3,'0'); });
        }
        break;
      }
    }
  } else {
    const patterns = [
      /<li>\s*([ABCDE])\s*<\/li>/gi,
      /problem\s+(\d+)[:\.\s]+([ABCDE])\b/gi,
      /<(?:b|strong)>\s*([ABCDE])\s*<\/(?:b|strong)>/gi,
      /<td[^>]*>\s*([ABCDE])\s*<\/td>/gi,
    ];
    for (const pat of patterns) {
      const matches = [...html.matchAll(pat)];
      if (matches.length >= 10) {
        if (pat.source.includes('problem')) {
          matches.forEach(m => { answers[parseInt(m[1])] = m[2]; });
        } else {
          matches.forEach((m, i) => { answers[i + 1] = m[1]; });
        }
        break;
      }
    }
  }
  return answers;
}

// ─── Answer key URL ───────────────────────────────────────
function answerKeyUrl(contest) {
  const { url, contestFull } = contest;
  const isAime = contestFull.includes('aime');
  if (isAime) {
    return `https://artofproblemsolving.com/wiki/index.php/${url}_Answer_Key`;
  }
  return `https://artofproblemsolving.com/wiki/index.php/${url}_Answer_Key`;
}

// ─── Problem URL ──────────────────────────────────────────
function problemUrl(contest, num) {
  return `https://artofproblemsolving.com/wiki/index.php/${contest.url}_Problems/Problem_${num}`;
}

// ─── Problem ID ───────────────────────────────────────────
function probId(contest, num) {
  return `${contest.year}-${contest.contestFull.toUpperCase()}-${num}`;
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  console.log('MathAtlas Full Problem Scraper');
  console.log('==============================');
  console.log(`Target: ${CONTESTS.length} contest years`);

  // Load checkpoint
  const checkpoint = existsSync(CHECKPOINT_PATH)
    ? JSON.parse(readFileSync(CHECKPOINT_PATH, 'utf8'))
    : {};

  const allProblems = existsSync(OUTPUT_PATH)
    ? JSON.parse(readFileSync(OUTPUT_PATH, 'utf8'))
    : [];

  // Build lookup of existing problems
  const existing = new Set(allProblems.map(p => p.id));
  console.log(`Already have ${allProblems.length} problems in database\n`);

  let added = 0, skipped = 0, failed = 0;
  const startTime = Date.now();

  for (let ci = 0; ci < CONTESTS.length; ci++) {
    const contest = CONTESTS[ci];
    const key = `${contest.contestFull}-${contest.year}`;

    if (checkpoint[key]) {
      skipped++;
      continue;
    }

    const isAime = contest.contestFull.includes('aime');
    process.stdout.write(`[${ci+1}/${CONTESTS.length}] ${contest.display} (${contest.problems}p)... `);

    // Fetch answer key
    const answerKeyHtml = await fetchWithRetry(answerKeyUrl(contest));
    const answers = answerKeyHtml ? parseAnswers(answerKeyHtml, isAime) : {};
    const answerCount = Object.keys(answers).length;

    // Generate problem entries
    let contestAdded = 0;
    for (let num = 1; num <= contest.problems; num++) {
      const id = probId(contest, num);
      if (existing.has(id)) continue;

      const link = problemUrl(contest, num);
      const elo = estimateElo(contest.contestFull, contest.year, num, contest.problems);
      const domain = guessDomain(num, contest.problems, contest.contestFull);
      const answer = answers[num] || '';

      const prob = {
        id,
        display: `${contest.display} #${num}`,
        contest: contest.contest,
        contestFull: contest.contestFull,
        year: contest.year,
        num,
        domain,
        skills: [],
        elo,
        answer,
        link
      };

      allProblems.push(prob);
      existing.add(id);
      contestAdded++;
      added++;
    }

    checkpoint[key] = true;
    console.log(`✅ +${contestAdded} problems (${answerCount} answers)`);

    // Save checkpoint + output every 10 contests
    if ((ci + 1) % 10 === 0) {
      writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 0));
      writeFileSync(OUTPUT_PATH, JSON.stringify(allProblems, null, 0));
    }

    // Small delay to be polite to AoPS
    await sleep(150);
  }

  // Final save
  writeFileSync(CHECKPOINT_PATH, JSON.stringify(checkpoint, null, 0));
  writeFileSync(OUTPUT_PATH, JSON.stringify(allProblems, null, 0));

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  console.log('\n══════════════════════════════');
  console.log(`✅ Added: ${added} new problems`);
  console.log(`⏭  Skipped (already done): ${skipped} contests`);
  console.log(`📊 Total in database: ${allProblems.length}`);
  console.log(`⏱  Time: ${Math.floor(elapsed/60)}m ${elapsed%60}s`);
  console.log('\nNext steps:');
  console.log('1. node scrape-answers.js   ← fill missing answers');
  console.log('2. node build-curriculum.js ← AI tagging overnight');
  console.log('3. git add problems-base.json problems.js && git commit -m "feat: complete problem database"');
}

main().catch(console.error);
