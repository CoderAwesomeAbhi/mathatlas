/**
 * MathAtlas Curriculum Builder — Paid Tier Final Edition
 * =======================================================
 * Model:  gemini-2.5-flash-lite (paid tier — no daily limits)
 * Cost:   ~$0.03 total for all remaining problems
 * Time:   ~5 minutes
 * Result: complete problems.js with hints + skills + lessons for ALL 6,446 problems
 *
 * WHAT THIS DOES:
 *   1. Reads your existing problems.js (6,446 problems with answers)
 *   2. Reads curriculum-checkpoint.json (4,364 already processed)
 *   3. Sends the remaining ~2,082 problems to Gemini in batches of 10
 *   4. Assigns lesson/module locally (no tokens wasted)
 *   5. Merges EVERYTHING and writes the final problems.js
 *
 * SETUP:
 *   .env.local must contain: GEMINI_API_KEY=your_paid_key
 *
 * Run:   node build-full-curriculum.js
 * After: git add problems.js && git commit -m "complete curriculum" && git push
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath }                           from 'url';
import { dirname, join }                           from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load API key ──────────────────────────────────────────────────────────────
const envPath = join(__dirname, '.env.local');
if (!existsSync(envPath)) {
  console.error('ERROR: .env.local not found. Add GEMINI_API_KEY=your_paid_key');
  process.exit(1);
}
const envContent     = readFileSync(envPath, 'utf8');
const GEMINI_API_KEY = (envContent.match(/GEMINI_API_KEY\s*=\s*["']?([^"'\n\r]+)["']?/) || [])[1]?.trim();
if (!GEMINI_API_KEY) {
  console.error('ERROR: GEMINI_API_KEY not found in .env.local');
  process.exit(1);
}

// ─── Config ────────────────────────────────────────────────────────────────────
// Paid tier: 2,000 RPM — we use 1s delay = ~40 RPM to be safe
// At batch 10: 40 batches/min = 400 problems/min → 2,082 problems in ~5 min
const MODEL         = 'gemini-2.5-flash-lite';
const BATCH_SIZE    = 10;
const DELAY_MS      = 1500;   // 1.5s = 40 RPM, well under 2,000 RPM paid limit
const MAX_RETRIES   = 5;
const RETRY_WAIT_MS = 3000;

// ─── Lesson assignment (local — no tokens wasted) ─────────────────────────────
const LESSON_MAP = [
  ['algebra',       500,  760,  'alg-1',  'f1'],
  ['algebra',       760,  900,  'alg-3',  'f3'],
  ['algebra',       900, 1100,  'alg-4',  'c1'],
  ['algebra',      1100, 1300,  'alg-6',  'a1'],
  ['algebra',      1300, 1550,  'alg-9',  'a1'],
  ['algebra',      1550, 1800,  'alg-12', 'p1'],
  ['algebra',      1800, 9999,  'alg-13', 'e1'],
  ['geometry',      500,  760,  'geo-1',  'f4'],
  ['geometry',      760,  900,  'geo-2',  'c8'],
  ['geometry',      900, 1100,  'geo-3',  'c5'],
  ['geometry',     1100, 1300,  'geo-4',  'c7'],
  ['geometry',     1300, 1550,  'geo-5',  'a4'],
  ['geometry',     1550, 1800,  'geo-7',  'p4'],
  ['geometry',     1800, 9999,  'geo-8',  'e2'],
  ['number-theory', 500,  900,  'nt-1',   'f5'],
  ['number-theory', 900, 1100,  'nt-2',   'c2'],
  ['number-theory',1100, 1300,  'nt-3',   'a5'],
  ['number-theory',1300, 1550,  'nt-4',   'a5'],
  ['number-theory',1550, 1800,  'nt-6',   'p2'],
  ['number-theory',1800, 9999,  'nt-7',   'e1'],
  ['counting',      500,  760,  'cnt-1',  'f6'],
  ['counting',      760,  900,  'cnt-2',  'c3'],
  ['counting',      900, 1100,  'cnt-3',  'c3'],
  ['counting',     1100, 1300,  'cnt-4',  'c3'],
  ['counting',     1300, 1550,  'cnt-5',  'a2'],
  ['counting',     1550, 1800,  'cnt-7',  'p3'],
  ['counting',     1800, 9999,  'cnt-8',  'e2'],
  ['probability',   500, 1300,  'prb-1',  'c4'],
  ['probability',  1300, 9999,  'prb-2',  'p5'],
];

function assignLesson(domain, elo) {
  const d = (domain || 'algebra').toLowerCase().replace(' ', '-');
  const e = parseInt(elo) || 500;
  for (const [dom, eMin, eMax, lessonId, moduleId] of LESSON_MAP) {
    if (dom === d && e >= eMin && e < eMax) return { lessonId, moduleId };
  }
  const fallbacks = {
    algebra:        { lessonId: 'alg-1',  moduleId: 'f1' },
    geometry:       { lessonId: 'geo-1',  moduleId: 'f4' },
    'number-theory':{ lessonId: 'nt-1',   moduleId: 'f5' },
    counting:       { lessonId: 'cnt-1',  moduleId: 'f6' },
    probability:    { lessonId: 'prb-1',  moduleId: 'c4' },
  };
  return fallbacks[d] || { lessonId: 'alg-1', moduleId: 'f1' };
}

// ─── Parse curriculum-checkpoint keys (handles all historical formats) ─────────
function parseCpKey(k) {
  // Format 1: YEAR-CF-NUM  e.g. 2010-amc8-1
  let m = k.match(/^(\d{4})-([a-z][a-z0-9]*)-(\d+)$/);
  if (m) return (m[2], parseInt(m[1]), parseInt(m[3]), m[2]);

  // Format 2: CFYEAR-NUM  e.g. ahsme1985-12, amc82000-1, amc102010b-2
  m = k.match(/^([a-z]+\d*[a-z]*)(\d{4})([a-z]*)-(\d+)$/);
  if (m) {
    let cf = (m[1] + m[3]).toLowerCase();
    if (cf === 'aimei')  cf = 'aime1';
    if (cf === 'aimeii') cf = 'aime2';
    return { cf, year: parseInt(m[2]), num: parseInt(m[4]) };
  }
  return null;
}

// ─── Utilities ─────────────────────────────────────────────────────────────────
const sleep = ms => new Promise(r => setTimeout(r, ms));

function formatTime(ms) {
  if (!ms || ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function extractJsonArray(raw, expectedLen) {
  let text = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  const start = text.indexOf('[');
  const end   = text.lastIndexOf(']');
  if (start !== -1 && end > start) {
    try {
      const arr = JSON.parse(text.slice(start, end + 1));
      if (Array.isArray(arr) && arr.length > 0) return normalizeLen(arr, expectedLen);
    } catch (_) {}
  }
  // Bracket-depth salvage
  if (start !== -1) {
    let depth = 0, deepEnd = -1, lastObj = -1;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (c === '[' || c === '{') depth++;
      else if (c === ']' || c === '}') {
        depth--;
        if (depth === 0) { deepEnd = i; break; }
        if (depth === 1 && c === '}') lastObj = i;
      }
    }
    const slice = deepEnd > start ? text.slice(start, deepEnd + 1)
                : lastObj > start ? text.slice(start, lastObj + 1) + ']'
                : null;
    if (slice) {
      try {
        const arr = JSON.parse(slice);
        if (Array.isArray(arr) && arr.length > 0) {
          if (arr.length < expectedLen) process.stdout.write(`[salvaged ${arr.length}/${expectedLen}] `);
          return normalizeLen(arr, expectedLen);
        }
      } catch (_) {}
    }
  }
  return null;
}

function normalizeLen(arr, n) {
  if (arr.length === n) return arr;
  if (arr.length > n)   return arr.slice(0, n);
  const padded = [...arr];
  while (padded.length < n) padded.push(null);
  return padded;
}

// ─── Gemini API call ──────────────────────────────────────────────────────────
async function callGemini(batch) {
  const problemList = batch.map((p, i) => `${i + 1}. ${p.display}`).join('\n');

  const prompt = `Return a JSON array of ${batch.length} objects for these AMC/AIME problems.
Each object must have exactly: {"text":"full problem with LaTeX $...$","hint":"one hint no spoilers","skills":["tag1","tag2"]}
IMPORTANT: Return ONLY the raw JSON array starting with [ and ending with ]. No markdown, no explanation.

Problems:
${problemList}`;

  let res;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature:       0.1,
            maxOutputTokens:   4096,
            thinkingConfig:    { thinkingBudget: 0 },
            responseMimeType:  'application/json',
            responseSchema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  text:   { type: 'string' },
                  hint:   { type: 'string' },
                  skills: { type: 'array', items: { type: 'string' } },
                },
                required: ['text', 'hint', 'skills'],
              },
            },
          },
        }),
      }
    );
  } catch (e) {
    return { status: 'network_err', message: e.message };
  }

  if (res.status === 429 || res.status === 503) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '0', 10);
    return { status: 'rate_limit', retryAfterMs: retryAfter > 0 ? retryAfter * 1000 : 10000 };
  }
  if (!res.ok) {
    let body = '';
    try { body = (await res.text()).slice(0, 200); } catch (_) {}
    return { status: 'api_error', code: res.status, body };
  }

  let data;
  try { data = await res.json(); }
  catch (_) { return { status: 'parse_fail', reason: 'response not JSON' }; }

  // With responseMimeType:'application/json' Gemini returns structured JSON directly
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const rawText = parts.filter(p => p.text && !p.thought).map(p => p.text).join('')
               || parts.map(p => p.text || '').join('').trim();
  if (!rawText) return { status: 'parse_fail', reason: 'empty response' };

  let arr;
  try {
    arr = JSON.parse(rawText);
  } catch (_) {
    // Fallback: strip any accidental markdown and try bracket-extraction
    const stripped = rawText.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const s = stripped.indexOf('[');
    const e = stripped.lastIndexOf(']');
    if (s !== -1 && e > s) {
      try { arr = JSON.parse(stripped.slice(s, e + 1)); } catch (_) {}
    }
    if (!arr) arr = extractJsonArray(stripped, batch.length);
  }

  // Unwrap if model returned { problems: [...] } or similar
  if (arr && !Array.isArray(arr) && typeof arr === 'object') {
    const first = Object.values(arr).find(v => Array.isArray(v));
    if (first) arr = first;
  }

  if (!Array.isArray(arr) || arr.length === 0) {
    return { status: 'parse_fail', reason: 'not a JSON array' };
  }

  return { status: 'ok', data: normalizeLen(arr, batch.length) };
}

// ─── Batch processor ──────────────────────────────────────────────────────────
async function processBatch(batch) {
  let failures = 0, postRL = false;

  while (true) {
    const result = await callGemini(batch);

    if (result.status === 'ok') return result.data;

    if (result.status === 'rate_limit') {
      const w = Math.round(result.retryAfterMs / 1000);
      process.stdout.write(`\n  ⏳ Rate limited — waiting ${w}s… `);
      await sleep(result.retryAfterMs);
      postRL = true;
      continue;
    }

    if (postRL && result.status === 'parse_fail') {
      await sleep(5000);
      postRL = false;
      continue;
    }

    postRL = false;
    failures++;
    const tag = result.status === 'parse_fail'  ? `parse_fail(${result.reason})`
              : result.status === 'network_err'  ? 'network_err'
              : result.status === 'api_error'    ? `HTTP ${result.code}`
              : result.status;

    process.stdout.write(`\n  ⚠️  ${tag} — attempt ${failures}/${MAX_RETRIES} `);
    if (failures >= MAX_RETRIES) return null;

    const wait = RETRY_WAIT_MS * Math.pow(2, failures - 1);
    process.stdout.write(`— retry in ${Math.round(wait / 1000)}s… `);
    await sleep(wait);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('MathAtlas Curriculum Builder — Paid Tier');
  console.log('══════════════════════════════════════════');
  console.log(`Model:  ${MODEL}  ($0.10/M input, $0.40/M output)`);
  console.log(`Speed:  40 req/min → ~5 minutes total`);
  console.log(`Cost:   ~$0.03`);
  console.log(`Saves:  after EVERY batch`);
  console.log('');

  // ── Load problems.js ──────────────────────────────────────────────────────────
  const pjsPath = join(__dirname, 'problemss.js');
  if (!existsSync(pjsPath)) {
    console.error('ERROR: problems.js not found');
    process.exit(1);
  }
  const pjsRaw = readFileSync(pjsPath, 'utf8');
  const pjsMatch = pjsRaw.match(/window\.MA_PROBLEMS\s*=\s*(\[[\s\S]*\]);/);
  if (!pjsMatch) {
    console.error('ERROR: Could not parse problems.js — expected window.MA_PROBLEMS = [...]');
    process.exit(1);
  }
  const problems = JSON.parse(pjsMatch[1]);
  console.log(`Loaded ${problems.length} problems from problems.js`);

  // ── Load curriculum checkpoint ────────────────────────────────────────────────
  const cpPath     = join(__dirname, 'curriculum-checkpoint.json');
  const checkpoint = existsSync(cpPath) ? JSON.parse(readFileSync(cpPath, 'utf8')) : {};

  // Build checkpoint lookup by (contestFull, year, num)
  const cpByKey = {};
  for (const [k, v] of Object.entries(checkpoint)) {
    // Try direct ID match first
    cpByKey[k] = v;
    // Also index by parsed key
    const parsed = parseCpKey(k);
    if (parsed && parsed.cf) {
      const normKey = `${parsed.cf}|${parsed.year}|${parsed.num}`;
      cpByKey[normKey] = v;
    }
  }

  // Function to find checkpoint entry for a problem
  function getCpEntry(p) {
    // Try direct ID match
    if (checkpoint[p.id]) return checkpoint[p.id];
    // Try (contestFull, year, num) key
    const normKey = `${(p.contestFull||'').toLowerCase()}|${p.year}|${p.num}`;
    return cpByKey[normKey] || null;
  }

  // ── Determine what needs processing ───────────────────────────────────────────
  const toProcess = problems.filter(p => !getCpEntry(p));
  const alreadyDone = problems.length - toProcess.length;
  const totalBatches = Math.ceil(toProcess.length / BATCH_SIZE);

  console.log(`Already processed: ${alreadyDone}`);
  console.log(`Remaining: ${toProcess.length}  (${totalBatches} batches)`);
  console.log(`Estimated cost: $${(toProcess.length * 0.5 / 1_000_000 * 0.40 + toProcess.length * 0.2 / 1_000_000 * 0.10).toFixed(4)}`);
  console.log(`ETA: ~${formatTime(totalBatches * (DELAY_MS + 800))}`);
  console.log('');

  if (toProcess.length === 0) {
    console.log('All problems already processed — merging now.');
  }

  let totalOk = 0, totalFailed = 0;
  const runStart = Date.now(), recentMs = [];

  // ── AI processing loop ────────────────────────────────────────────────────────
  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch    = toProcess.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;

    let eta = '?';
    if (recentMs.length > 0) {
      const avg = recentMs.reduce((a, b) => a + b, 0) / recentMs.length;
      eta = formatTime(avg * (totalBatches - batchNum + 1));
    }

    process.stdout.write(`[${batchNum}/${totalBatches}] ${String(batch[0].display || '').slice(0, 28)}… ETA:${eta} `);

    const t0      = Date.now();
    const results = await processBatch(batch);
    const batchMs = Date.now() - t0;

    if (batchMs < 5 * 60 * 1000) {
      recentMs.push(batchMs + DELAY_MS);
      if (recentMs.length > 30) recentMs.shift();
    }

    if (results && Array.isArray(results)) {
      let batchOk = 0;
      for (let j = 0; j < batch.length; j++) {
        const prob = batch[j];
        const r    = results[j];
        if (r && r.hint) {
          checkpoint[prob.id] = {
            text:     r.text   || prob.text   || '',
            hint:     r.hint,
            skills:   Array.isArray(r.skills) ? r.skills.slice(0, 4) : [],
          };
          batchOk++;
          totalOk++;
        } else {
          totalFailed++;
        }
      }
      console.log(`✅ ${batchOk}/${batch.length}`);
    } else {
      console.log(`❌ skipped`);
      totalFailed += batch.length;
    }

    // Save checkpoint after EVERY batch
    writeFileSync(cpPath, JSON.stringify(checkpoint, null, 0));

    if (i + BATCH_SIZE < toProcess.length) await sleep(DELAY_MS);
  }

  // ── MERGE: build final problems.js ────────────────────────────────────────────
  console.log('\nMerging everything into problems.js…');

  let hintsAdded = 0, textAdded = 0, lessonsAssigned = 0;

  for (const p of problems) {
    const cp = getCpEntry(p);

    if (cp) {
      // Add hint
      if (cp.hint && !p.hint) { p.hint = cp.hint; hintsAdded++; }
      // Add/update text (AI-generated is usually cleaner than scraped)
      if (cp.text && cp.text.length > 20 && (!p.text || cp.text.length > p.text.length)) {
        p.text = cp.text; textAdded++;
      }
      // Add skills
      if (cp.skills?.length && !p.skills?.length) p.skills = cp.skills;
    }

    // Assign lesson from elo+domain (always — ensures every problem has one)
    if (!p.lessonId) {
      const { lessonId, moduleId } = assignLesson(p.domain, p.elo);
      p.lessonId = lessonId;
      p.moduleId = moduleId;
      lessonsAssigned++;
    }
  }

  console.log(`  Hints added:    ${hintsAdded}`);
  console.log(`  Text added:     ${textAdded}`);
  console.log(`  Lessons auto:   ${lessonsAssigned}`);

  // ── Write problems.js ─────────────────────────────────────────────────────────
  const withText   = problems.filter(p => p.text   && p.text.length > 10).length;
  const withHint   = problems.filter(p => p.hint).length;
  const withLesson = problems.filter(p => p.lessonId).length;
  const withAnswer = problems.filter(p => p.answer).length;

  const output =
    `// MathAtlas Problem Database\n` +
    `// Generated: ${new Date().toISOString()}\n` +
    `// ${problems.length} problems | ${withAnswer} answers | ${withHint} hints | ${withText} with text | ${withLesson} with lesson\n` +
    `// Regenerate: node build-full-curriculum.js\n\n` +
    `window.MA_PROBLEMS = ${JSON.stringify(problems, null, 0)};\n`;

  writeFileSync(pjsPath, output);

  const elapsed = Date.now() - runStart;
  console.log('');
  console.log('══════════════════════════════════════════');
  console.log(`✅  Finished in ${formatTime(elapsed)}`);
  console.log(`📄  Total problems:  ${problems.length}`);
  console.log(`✅  With answers:    ${withAnswer}`);
  console.log(`💡  With hints:      ${withHint}`);
  console.log(`📝  With text:       ${withText}`);
  console.log(`📚  With lesson:     ${withLesson}`);
  console.log(`❌  AI skipped:      ${totalFailed}`);
  if (totalFailed > 0) console.log(`    Re-run to retry skipped problems.`);
  console.log('');
  console.log('Next steps:');
  console.log('  git add problems.js');
  console.log('  git commit -m "Complete curriculum — all hints and lessons"');
  console.log('  git push');
  console.log('');
  console.log('Your site will update automatically on Vercel after git push.');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});