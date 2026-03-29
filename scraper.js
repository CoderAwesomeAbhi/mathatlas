/**
 * MathAtlas AoPS Scraper — All Time Complete Edition
 * ====================================================
 * Scrapes every MAA competition problem from AoPS wiki.
 * Re-run at any time — skips already-scraped problems,
 * retries only the ones that previously errored.
 *
 * Run:    node scraper.js
 * Output: problems-base.json
 * Needs:  npm install node-html-parser
 */

import { parse }                                   from 'node-html-parser';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname }                           from 'path';
import { fileURLToPath }                           from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const DELAY_MS      = 1200;
const JITTER_MS     = 500;
const MAX_RETRIES   = 5;
const RETRY_WAIT_MS = 10000;
const SAVE_EVERY    = 50;

// ─── Contest list ──────────────────────────────────────────────────────────────
function buildContestList() {
  const contests = [];

  // AHSME 1950–1999 (problem counts changed over eras)
  function ahsmeProbs(y) {
    if (y <= 1959) return 50;
    if (y <= 1967) return 40;
    if (y <= 1973) return 35;
    return 30;
  }
  for (let y = 1950; y <= 1999; y++) {
    contests.push({ type:'ahsme',  year:y, variant:'', numProbs:ahsmeProbs(y),
                    baseElo:800, topElo:1400, urlSlug:`${y}_AHSME` });
  }

  // AJHSME 1985–1999, AMC 8 2000–2024 (skip 2020)
  for (let y = 1985; y <= 2024; y++) {
    if (y === 2020) continue;
    const isAjhsme = y <= 1999;
    contests.push({ type: isAjhsme ? 'ajhsme' : 'amc8', year:y, variant:'', numProbs:25,
                    baseElo:400, topElo:850,
                    urlSlug: isAjhsme ? `${y}_AJHSME` : `${y}_AMC_8` });
  }

  // AIME single 1983–1999
  for (let y = 1983; y <= 1999; y++) {
    contests.push({ type:'aime', year:y, variant:'', numProbs:15,
                    baseElo:1350, topElo:2000, urlSlug:`${y}_AIME` });
  }

  // AIME I & II 2000–2024
  for (let y = 2000; y <= 2024; y++) {
    contests.push({ type:'aime', year:y, variant:'I',  numProbs:15,
                    baseElo:1350, topElo:2000, urlSlug:`${y}_AIME_I` });
    contests.push({ type:'aime', year:y, variant:'II', numProbs:15,
                    baseElo:1350, topElo:2000, urlSlug:`${y}_AIME_II` });
  }

  // AMC 10 single 2000–2001, A+B 2002–2024
  for (let y = 2000; y <= 2024; y++) {
    if (y <= 2001) {
      contests.push({ type:'amc10', year:y, variant:'', numProbs:25,
                      baseElo:750, topElo:1300, urlSlug:`${y}_AMC_10` });
    } else {
      contests.push({ type:'amc10', year:y, variant:'A', numProbs:25,
                      baseElo:750, topElo:1300, urlSlug:`${y}_AMC_10A` });
      contests.push({ type:'amc10', year:y, variant:'B', numProbs:25,
                      baseElo:750, topElo:1300, urlSlug:`${y}_AMC_10B` });
    }
  }

  // AMC 12 single 2000–2001, A+B 2002–2024
  for (let y = 2000; y <= 2024; y++) {
    if (y <= 2001) {
      contests.push({ type:'amc12', year:y, variant:'', numProbs:25,
                      baseElo:900, topElo:1550, urlSlug:`${y}_AMC_12` });
    } else {
      contests.push({ type:'amc12', year:y, variant:'A', numProbs:25,
                      baseElo:900, topElo:1550, urlSlug:`${y}_AMC_12A` });
      contests.push({ type:'amc12', year:y, variant:'B', numProbs:25,
                      baseElo:900, topElo:1550, urlSlug:`${y}_AMC_12B` });
    }
  }

  return contests;
}

function buildUrl(contest, num) {
  return `https://artofproblemsolving.com/wiki/index.php/${contest.urlSlug}_Problems/Problem_${num}`;
}

function buildFallbackUrls(contest, num) {
  const { type, year, variant } = contest;
  const fallbacks = [];
  if (type === 'aime') {
    if (variant === 'I' || variant === '') {
      fallbacks.push(`https://artofproblemsolving.com/wiki/index.php/${year}_AIME_Problems/Problem_${num}`);
      fallbacks.push(`https://artofproblemsolving.com/wiki/index.php/${year}_AIME_1_Problems/Problem_${num}`);
    }
    if (variant === 'II') {
      fallbacks.push(`https://artofproblemsolving.com/wiki/index.php/${year}_AIME_2_Problems/Problem_${num}`);
    }
  }
  if (type === 'ahsme') {
    fallbacks.push(`https://artofproblemsolving.com/wiki/index.php/${year}_AHSME_Problems/Problem_${num}`);
  }
  if ((type === 'amc10' || type === 'amc12') && year === 2021 && variant) {
    const label = type === 'amc10' ? 'AMC_10' : 'AMC_12';
    fallbacks.push(`https://artofproblemsolving.com/wiki/index.php/2021_Fall_${label}${variant}_Problems/Problem_${num}`);
  }
  return fallbacks;
}

function buildId(contest, num) {
  const v = contest.variant ? contest.variant.toLowerCase() : '';
  return `${contest.type}${contest.year}${v}-${num}`;
}

function buildDisplay(contest, num) {
  const labels = { ahsme:'AHSME', ajhsme:'AJHSME', amc8:'AMC 8',
                   amc10:'AMC 10', amc12:'AMC 12', aime:'AIME' };
  const v = contest.variant ? ` ${contest.variant}` : '';
  return `${contest.year} ${labels[contest.type]}${v} #${num}`;
}

function buildContestFull(contest) {
  const { type, variant } = contest;
  if (type === 'ahsme')  return 'amc12';
  if (type === 'ajhsme') return 'amc8';
  if (!variant)          return type;
  return type + variant.toLowerCase();
}

function calcElo(contest, num) {
  if (contest.type === 'aime') {
    return Math.round(1350 + (num - 1) * 45 + (num - 1) ** 1.4 * 4);
  }
  const t = ((num - 1) / (contest.numProbs - 1)) ** 1.3;
  return Math.round(contest.baseElo + t * (contest.topElo - contest.baseElo));
}

function calcDomain(contest, num) {
  if (contest.type === 'aime') {
    const p = num / 15;
    if (p < 0.3)  return 'number-theory';
    if (p < 0.55) return 'algebra';
    if (p < 0.75) return 'counting';
    return 'geometry';
  }
  const p = num / contest.numProbs;
  if (p < 0.25) return 'algebra';
  if (p < 0.5)  return 'number-theory';
  if (p < 0.75) return 'geometry';
  return 'counting';
}

function extractProblemText(html) {
  const root    = parse(html);
  const content = root.querySelector('.mw-parser-output');
  if (!content) return null;

  // Remove everything that's never part of the problem statement
  content.querySelectorAll(
    '.NavFrame, .NavContent, .navigation-box, #toc, .toc, ' +
    '.printfooter, .catlinks, .mw-editsection, script, style, ' +
    '.amcbox, .hatnote, table.wikitable, .thumb, .gallery, ' +
    '[id^="solution"], [id^="Solution"], [id^="see"], [id^="See"]'
  ).forEach(el => el.remove());

  // Strategy 1: grab all <p> tags before any solution/see-also heading
  // This is the most reliable approach for AoPS pages
  const allNodes  = content.querySelectorAll('p, h1, h2, h3, h4, li');
  const parts     = [];
  let   hitStop   = false;

  for (const node of allNodes) {
    const tag  = node.tagName.toLowerCase();
    const text = node.text.trim();

    // Stop at solution/see-also headings
    if (['h1','h2','h3','h4'].includes(tag)) {
      const t = text.toLowerCase();
      if (t.includes('solution') || t.includes('see also') ||
          t.includes('video')    || t.includes('answer')   ||
          t.includes('problem 2')|| t.includes('problem 3')) {
        hitStop = true;
        break;
      }
      // Skip headings that are just the problem number e.g. "Problem 1"
      if (/^problem\s+\d+$/i.test(t)) continue;
    }

    if (!text || text.length < 3) continue;

    // Skip lines that are just navigation artifacts
    if (/^(previous problem|next problem|problem list|back to)$/i.test(text)) continue;

    parts.push(text);
    if (parts.join(' ').length > 1500) break;
  }

  let combined = parts.join('\n\n').trim();

  // Strategy 2: if Strategy 1 got nothing, grab the raw innerText of the
  // entire content div up to the first solution heading — handles pages
  // where the problem is in a non-<p> container
  if (combined.length < 20) {
    const fullText = content.innerText || content.text || '';
    const stopIdx  = fullText.search(/\n(Solution|See [Aa]lso|Video)/);
    combined       = (stopIdx > 0 ? fullText.slice(0, stopIdx) : fullText)
                       .replace(/\[\d+\]/g, '')   // remove citation brackets [1]
                       .replace(/\n{3,}/g, '\n\n')
                       .trim();
  }

  return combined.length > 20 ? combined : null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchUrl(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':      'MathAtlas-Scraper/3.0 (educational non-commercial)',
          'Accept':          'text/html,application/xhtml+xml',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: AbortSignal.timeout(20000),
      });
      if (res.status === 404)                       return { status: 404 };
      if (res.status === 429 || res.status === 503) {
        process.stdout.write(`[rate-limit ${attempt * 10}s] `);
        await sleep(RETRY_WAIT_MS * attempt);
        continue;
      }
      if (!res.ok) { await sleep(RETRY_WAIT_MS); continue; }
      return { status: 200, html: await res.text() };
    } catch (e) {
      if (attempt < MAX_RETRIES) {
        process.stdout.write(`[retry ${attempt}] `);
        await sleep(RETRY_WAIT_MS * attempt);
      } else return { status: 'error', message: e.message };
    }
  }
  return { status: 'error', message: 'max retries' };
}

async function fetchWithFallbacks(contest, num) {
  const urls = [buildUrl(contest, num), ...buildFallbackUrls(contest, num)];
  for (const url of urls) {
    const r = await fetchUrl(url);
    if (r.status === 200)     return { ...r, url };
    if (r.status === 'error') return r;
  }
  return { status: 404 };
}

async function main() {
  try { await import('node-html-parser'); } catch {
    console.error('ERROR: Run:  npm install node-html-parser');
    process.exit(1);
  }

  const contests    = buildContestList();
  const allProblems = [];

  for (const contest of contests) {
    for (let n = 1; n <= contest.numProbs; n++) {
      allProblems.push({
        id:          buildId(contest, n),
        contest:     contest.type,
        contestFull: buildContestFull(contest),
        year:        contest.year,
        variant:     contest.variant,
        num:         n,
        display:     buildDisplay(contest, n),
        link:        buildUrl(contest, n),
        url:         buildUrl(contest, n),
        elo:         calcElo(contest, n),
        domain:      calcDomain(contest, n),
        text:        null,
        _contest:    contest,
      });
    }
  }

  // Count by type
  const byType = {};
  for (const p of allProblems) byType[p.contest] = (byType[p.contest] || 0) + 1;

  console.log('MathAtlas AoPS Scraper — All Time Complete Edition');
  console.log('══════════════════════════════════════════════════════');
  for (const [type, count] of Object.entries(byType)) {
    console.log(`  ${type.padEnd(8)} ${count}`);
  }
  console.log(`  ${'TOTAL'.padEnd(8)} ${allProblems.length}`);
  console.log('');
  console.log('Resumable — Ctrl+C safe. Retries errors, skips successes.');
  console.log('══════════════════════════════════════════════════════\n');

  const cpPath   = join(__dirname, 'scraper-checkpoint.json');
  let checkpoint = {};
  if (existsSync(cpPath)) {
    try {
      checkpoint = JSON.parse(readFileSync(cpPath, 'utf8'));
    } catch { console.log('Checkpoint corrupted — starting fresh.\n'); }
  }

  // KEY FIX: skip problems that succeeded OR were 404 (missing).
  // Only retry problems that had actual errors (not in checkpoint at all).
  const toScrape = allProblems.filter(p => {
    const cp = checkpoint[p.id];
    if (!cp) return true;                    // never attempted
    if (cp.missing) return false;            // confirmed 404 — skip
    if (cp.text) return false;               // successfully scraped — skip
    if (cp.parseError) return true;          // parse failed last time — retry
    return false;
  });

  const done    = allProblems.filter(p => checkpoint[p.id]?.text || checkpoint[p.id]?.missing).length;
  const retrying = allProblems.filter(p => checkpoint[p.id]?.parseError).length;

  console.log(`Already done: ${done} | Retrying errors: ${retrying} | New: ${toScrape.length - retrying}`);
  console.log(`Total to fetch: ${toScrape.length}\n`);

  let ok = 0, missing = 0, failed = 0, saved = 0;

  for (let i = 0; i < toScrape.length; i++) {
    const prob    = toScrape[i];
    const contest = prob._contest;
    const pct     = ((i + 1) / toScrape.length * 100).toFixed(1);

    process.stdout.write(`[${i+1}/${toScrape.length}] ${pct}%  ${prob.display.padEnd(32)} `);

    const result = await fetchWithFallbacks(contest, prob.num);

    if (result.status === 200) {
      const text = extractProblemText(result.html);
      if (text) {
        checkpoint[prob.id] = { ...prob, text, parseError: undefined, _contest: undefined };
        process.stdout.write(`✅ ${text.length}ch\n`);
        ok++;
      } else {
        checkpoint[prob.id] = { ...prob, text: null, parseError: true, _contest: undefined };
        process.stdout.write(`⚠️  parse fail\n`);
        failed++;
      }
    } else if (result.status === 404) {
      checkpoint[prob.id] = { ...prob, text: null, missing: true, _contest: undefined };
      process.stdout.write(`–  not on AoPS\n`);
      missing++;
    } else {
      process.stdout.write(`❌ ${result.message || result.status}\n`);
      failed++;
      // Don't write to checkpoint — will retry next run
    }

    saved++;
    if (saved % SAVE_EVERY === 0) {
      writeFileSync(cpPath, JSON.stringify(checkpoint, null, 0));
      process.stdout.write(`    💾 checkpoint (${Object.keys(checkpoint).length} total)\n`);
    }

    if (i < toScrape.length - 1) await sleep(DELAY_MS + Math.random() * JITTER_MS);
  }

  writeFileSync(cpPath, JSON.stringify(checkpoint, null, 0));

  console.log('\n══════════════════════════════════════════════════════');
  console.log('Building problems-base.json...');

  const output = allProblems
    .map(p => {
      const cp = checkpoint[p.id];
      if (!cp) return null;
      return {
        id:          cp.id,
        contest:     cp.contest,
        contestFull: cp.contestFull,
        year:        cp.year,
        variant:     cp.variant || '',
        num:         cp.num,
        display:     cp.display,
        link:        cp.link,
        url:         cp.url,
        elo:         cp.elo,
        domain:      cp.domain,
        text:        cp.text || null,
      };
    })
    .filter(Boolean);

  writeFileSync(join(__dirname, 'problems-base.json'), JSON.stringify(output, null, 0));

  const withText = output.filter(p => p.text).length;
  console.log(`\n✅  Done!`);
  console.log(`📄  Total:          ${output.length}`);
  console.log(`✅  With text:      ${withText}`);
  console.log(`⚠️   Without text:  ${output.length - withText}  ← Gemini fills from training`);
  console.log(`–   Not on AoPS:   ${missing}`);
  console.log(`❌  Errors/retry:   ${failed}`);
  if (failed > 0) console.log(`\nRe-run scraper.js to retry ${failed} failed problems.`);
  console.log('\nNext step:  node build-full-curriculum.js');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});