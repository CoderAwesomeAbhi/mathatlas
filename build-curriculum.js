/**
 * MathAtlas Curriculum Builder
 * ============================
 * Uses Gemini 2.5 Pro for best possible hints and module assignment.
 * Run: node build-curriculum.js
 * Time: ~3 hours for all 2,170 problems
 * Cost: ~$7-8 from your $300 credits
 *
 * Requirements:
 *   - Node.js 18+
 *   - GEMINI_API_KEY in .env.local (must have billing enabled)
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Load API key ─────────────────────────────────────────
const envPath = join(__dirname, '.env.local');
if (!existsSync(envPath)) {
  console.error('ERROR: .env.local not found. Create it with GEMINI_API_KEY=your_key');
  process.exit(1);
}
const envContent = readFileSync(envPath, 'utf8');
const keyMatch = envContent.match(/GEMINI_API_KEY\s*=\s*["']?([^"'\n]+)["']?/);
if (!keyMatch) { console.error('ERROR: GEMINI_API_KEY not found in .env.local'); process.exit(1); }
const GEMINI_API_KEY = keyMatch[1].trim();

// ─── Config ───────────────────────────────────────────────
const MODEL = 'gemini-2.5-pro';         // Best model for math reasoning
const RPM = 10;                          // Requests per minute (safe for paid tier)
const DELAY_MS = Math.ceil(60000 / RPM); // ~6 seconds between requests
const BATCH_SAVE = 10;                   // Save checkpoint every N problems

// ─── Module definitions ───────────────────────────────────
const MODULES = {
  f1: { title: 'Algebraic Manipulation',            level: 1, eloMin: 500,  eloMax: 850,  domains: ['algebra'] },
  f2: { title: 'Ratios, Proportions & Percentages', level: 1, eloMin: 500,  eloMax: 850,  domains: ['algebra'] },
  f3: { title: 'Exponents & Polynomials',            level: 1, eloMin: 500,  eloMax: 850,  domains: ['algebra'] },
  f4: { title: 'Introductory Geometry',              level: 1, eloMin: 500,  eloMax: 850,  domains: ['geometry'] },
  f5: { title: 'Basic Number Theory',                level: 1, eloMin: 500,  eloMax: 850,  domains: ['number-theory'] },
  f6: { title: 'Elementary Counting',                level: 1, eloMin: 500,  eloMax: 850,  domains: ['counting'] },
  f7: { title: 'Sequences & Series',                 level: 1, eloMin: 500,  eloMax: 850,  domains: ['algebra'] },
  f8: { title: 'Introductory Inequalities',          level: 1, eloMin: 500,  eloMax: 850,  domains: ['algebra'] },
  c1: { title: "Quadratics & Vieta's Formulas",     level: 2, eloMin: 800,  eloMax: 1150, domains: ['algebra'] },
  c2: { title: 'Modular Arithmetic',                 level: 2, eloMin: 800,  eloMax: 1150, domains: ['number-theory'] },
  c3: { title: 'Intermediate Combinatorics',         level: 2, eloMin: 800,  eloMax: 1150, domains: ['counting'] },
  c4: { title: 'Probability',                        level: 2, eloMin: 800,  eloMax: 1150, domains: ['probability'] },
  c5: { title: 'Circle Geometry',                    level: 2, eloMin: 800,  eloMax: 1150, domains: ['geometry'] },
  c6: { title: 'Functional Equations & Systems',     level: 2, eloMin: 800,  eloMax: 1150, domains: ['algebra'] },
  c7: { title: 'Coordinate & Analytic Geometry',     level: 2, eloMin: 800,  eloMax: 1150, domains: ['geometry'] },
  c8: { title: 'Triangle Theorems & Advanced Geometry', level: 2, eloMin: 800, eloMax: 1150, domains: ['geometry'] },
  a1: { title: 'Advanced Algebraic Techniques',     level: 3, eloMin: 1100, eloMax: 1450, domains: ['algebra'] },
  a2: { title: 'Advanced Combinatorics',             level: 3, eloMin: 1100, eloMax: 1450, domains: ['counting'] },
  a3: { title: 'Complex Numbers & Polynomials',      level: 3, eloMin: 1100, eloMax: 1450, domains: ['algebra'] },
  a4: { title: '3D Geometry & Trigonometry',         level: 3, eloMin: 1100, eloMax: 1450, domains: ['geometry'] },
  a5: { title: 'Advanced Number Theory',             level: 3, eloMin: 1100, eloMax: 1450, domains: ['number-theory'] },
  a6: { title: 'Advanced Probability',               level: 3, eloMin: 1100, eloMax: 1450, domains: ['probability'] },
  p1: { title: 'AIME Algebra',                       level: 4, eloMin: 1300, eloMax: 1650, domains: ['algebra'] },
  p2: { title: 'AIME Number Theory',                 level: 4, eloMin: 1300, eloMax: 1650, domains: ['number-theory'] },
  p3: { title: 'AIME Combinatorics',                 level: 4, eloMin: 1300, eloMax: 1650, domains: ['counting'] },
  p4: { title: 'AIME Geometry',                      level: 4, eloMin: 1300, eloMax: 1650, domains: ['geometry'] },
  p5: { title: 'AIME Probability & Recursion',       level: 4, eloMin: 1300, eloMax: 1650, domains: ['probability'] },
  e1: { title: 'Hard AIME: Algebra & Number Theory', level: 5, eloMin: 1600, eloMax: 2800, domains: ['algebra','number-theory'] },
  e2: { title: 'Hard AIME: Combinatorics & Geometry',level: 5, eloMin: 1600, eloMax: 2800, domains: ['counting','geometry','probability'] },
};

const MODULE_LIST = Object.entries(MODULES)
  .map(([id, m]) => `${id}: ${m.title} (Level ${m.level}, elo ${m.eloMin}-${m.eloMax}, domains: ${m.domains.join('/')})`)
  .join('\n');

// ─── Fetch problem text from AoPS ─────────────────────────
async function fetchProblemText(link) {
  if (!link) return null;
  try {
    const res = await fetch(link, {
      headers: { 'User-Agent': 'MathAtlas/1.0 (educational; mathatlas.vercel.app)' },
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) return null;
    const html = await res.text();
    const bodyMatch = html.match(/<div[^>]*class="[^"]*mw-parser-output[^"]*"[^>]*>([\s\S]*?)<\/div>/);
    if (!bodyMatch) return null;
    let body = bodyMatch[1];
    body = body.replace(/==+\s*Solution[\s\S]*/i, '');
    body = body
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
      .replace(/\s+/g, ' ').trim();
    return body.substring(0, 1500) || null;
  } catch (e) { return null; }
}

// ─── Call Gemini 2.5 Pro ──────────────────────────────────
async function classifyProblem(prob, problemText) {
  const prompt = `You are an expert AMC/AIME math competition curriculum designer with deep knowledge of competition mathematics.

PROBLEM: ${prob.display}
PROBLEM TEXT: ${problemText || '(not available — use problem name and elo to infer)'}
CURRENT ELO: ${prob.elo}
CURRENT DOMAIN: ${prob.domain}

Available modules:
${MODULE_LIST}

Tasks:
1. Assign this problem to the SINGLE most appropriate module based on the PRIMARY mathematical technique required
2. Write exactly 3 hints of strictly increasing specificity:
   - Hint 1: Only a high-level conceptual nudge. What CATEGORY of approach? No specifics.
   - Hint 2: Name the specific technique or key observation needed
   - Hint 3: The core insight that unlocks the problem — specific but not the full solution
3. List 2-5 specific skill tags (lowercase, hyphenated, e.g. "pigeonhole", "stars-and-bars", "modular-arithmetic")

Rules for hints:
- Make hints SPECIFIC to THIS problem, not generic
- Hint 3 should reference specific numbers or relationships from the problem
- Never give the answer or final computation in any hint

Return ONLY valid JSON:
{
  "moduleId": "c3",
  "skills": ["pigeonhole", "casework"],
  "hint1": "High-level approach category",
  "hint2": "Specific technique for this problem",  
  "hint3": "The key insight specific to this problem's numbers/structure"
}`;

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    if (!res.ok) {
      const err = await res.text();
      if (res.status === 429) return { rateLimited: true };
      if (res.status === 503) return { rateLimited: true }; // overloaded
      console.log(`  Gemini error ${res.status}: ${err.substring(0, 150)}`);
      return null;
    }

    const data = await res.json();

    // Handle Gemini 2.5 Pro thought blocks
    let text = '';
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text && !part.thought) text += part.text;
    }
    if (!text) text = parts[0]?.text || '';
    if (!text) return null;

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    const parsed = JSON.parse(clean);
    if (!parsed.moduleId) return null;
    return parsed;
  } catch (e) {
    console.log(`  Error: ${e.message}`);
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

// ─── Main ─────────────────────────────────────────────────
async function main() {
  console.log('MathAtlas Curriculum Builder');
  console.log('============================');
  console.log(`Model: ${MODEL}`);
  console.log(`Rate: ${RPM} requests/minute (~${DELAY_MS/1000}s between requests)`);

  const problems = JSON.parse(readFileSync(join(__dirname, 'problems-base.json'), 'utf8'));
  console.log(`Loaded ${problems.length} problems`);

  const checkpointPath = join(__dirname, 'curriculum-checkpoint.json');
  const checkpoint = existsSync(checkpointPath)
    ? JSON.parse(readFileSync(checkpointPath, 'utf8'))
    : {};

  const toProcess = problems.filter(p => !checkpoint[p.id]);
  const alreadyDone = problems.length - toProcess.length;
  const estMinutes = Math.ceil(toProcess.length * DELAY_MS / 60000);

  console.log(`Already done: ${alreadyDone} | Remaining: ${toProcess.length}`);
  console.log(`Estimated time: ~${formatTime(toProcess.length * DELAY_MS)}`);
  console.log(`Estimated cost: ~$${(toProcess.length * 0.0035).toFixed(2)}`);
  console.log('');

  let done = 0, failed = 0, rateLimitHits = 0;
  const startTime = Date.now();

  for (const prob of toProcess) {
    const elapsed = Date.now() - startTime;
    const remaining = toProcess.length - done;
    const eta = done > 0 ? formatTime((elapsed / done) * remaining) : '?';

    process.stdout.write(`[${alreadyDone + done + 1}/${problems.length}] ${prob.display.padEnd(30)} `);

    const text = await fetchProblemText(prob.link);

    const result = await classifyProblem(prob, text);

    if (result?.rateLimited) {
      rateLimitHits++;
      console.log(`⏳ rate limited — waiting 90s...`);
      await sleep(90000);
      const retry = await classifyProblem(prob, text);
      if (retry && !retry.rateLimited && retry.moduleId) {
        checkpoint[prob.id] = retry;
        console.log(`✅ ${retry.moduleId} (retry)`);
        done++;
      } else {
        failed++;
        done++;
        console.log('❌ failed after retry');
      }
    } else if (result?.moduleId) {
      checkpoint[prob.id] = result;
      console.log(`✅ ${result.moduleId.padEnd(4)} [${(result.skills||[]).join(', ')}] ETA: ${eta}`);
      done++;
    } else {
      failed++;
      done++;
      console.log('❌ failed');
    }

    if (done % BATCH_SAVE === 0) {
      writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 0));
    }

    await sleep(DELAY_MS);
  }

  writeFileSync(checkpointPath, JSON.stringify(checkpoint, null, 0));

  // Merge into problems and write output
  console.log('\nMerging results into problems.js...');
  for (const prob of problems) {
    const c = checkpoint[prob.id];
    if (c) {
      if (c.moduleId) prob.moduleId = c.moduleId;
      if (c.skills?.length) prob.skills = c.skills;
      if (c.hint1) prob.hint1 = c.hint1;
      if (c.hint2) prob.hint2 = c.hint2;
      if (c.hint3) prob.hint3 = c.hint3;
    }
  }

  const withHints = problems.filter(p => p.hint1).length;
  const jsContent = `// MathAtlas Problem Database
// Generated: ${new Date().toISOString()}
// Model: ${MODEL}
// ${problems.length} problems | ${withHints} with AI hints
// Regenerate with: node build-curriculum.js

window.MA_PROBLEMS = ${JSON.stringify(problems, null, 0)};
`;

  writeFileSync(join(__dirname, 'problems.js'), jsContent);

  const totalTime = formatTime(Date.now() - startTime);
  console.log('\n════════════════════════════════');
  console.log(`✅ Completed in ${totalTime}`);
  console.log(`✅ Success: ${done - failed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`⏳ Rate limit hits: ${rateLimitHits}`);
  console.log(`📊 Problems with hints: ${withHints}/${problems.length}`);
  console.log('\n✅ Written to problems.js');
  console.log('Next: git add problems.js && git commit -m "feat: AI curriculum hints" && git push && vercel --prod');
}

main().catch(console.error);

// ─── ADDENDUM: Also process SolveFire problems ───────────
// Run this after the main loop to tag SolveFire problems too
// They already have hint1/hint2/hint3 from the initial setup,
// but Gemini can improve them

async function processSolveFire() {
  console.log('\n\nProcessing SolveFire problems...');

  // Read existing solvefire-problems.js
  const sfPath = join(__dirname, 'solvefire-problems.js');
  if (!existsSync(sfPath)) {
    console.log('solvefire-problems.js not found — skipping');
    return;
  }

  // Extract the problems array by evaluating the file
  const sfContent = readFileSync(sfPath, 'utf8');
  const match = sfContent.match(/window\.SF_PROBLEMS\s*=\s*(\[[\s\S]*?\]);/);
  if (!match) { console.log('Could not parse SF_PROBLEMS array'); return; }

  let sfProbs;
  try { sfProbs = eval(match[1]); } // safe — local file
  catch(e) { console.log('Could not eval SF_PROBLEMS:', e.message); return; }

  const sfCheckpointPath = join(__dirname, 'sf-curriculum-checkpoint.json');
  const sfCheckpoint = existsSync(sfCheckpointPath)
    ? JSON.parse(readFileSync(sfCheckpointPath, 'utf8'))
    : {};

  const toProcess = sfProbs.filter(p => !sfCheckpoint[p.id] && p.text);
  console.log(`${sfProbs.length} SolveFire problems, ${toProcess.length} to process`);

  for (const prob of toProcess) {
    process.stdout.write(`  [SF] ${prob.display}... `);
    const result = await classifyProblem(prob, prob.text);
    if (result?.moduleId) {
      sfCheckpoint[prob.id] = result;
      console.log(`✅ ${result.moduleId}`);
    } else {
      console.log('❌ skipped (using existing hints)');
    }
    await sleep(DELAY_MS);
  }

  writeFileSync(sfCheckpointPath, JSON.stringify(sfCheckpoint, null, 0));

  // Merge improvements back
  sfProbs.forEach(p => {
    const c = sfCheckpoint[p.id];
    if (c) {
      if (c.moduleId) p.moduleId = c.moduleId;
      if (c.skills?.length) p.skills = c.skills;
      // Only update hints if they're better (longer = more specific)
      if (c.hint1 && c.hint1.length > (p.hint1||'').length) p.hint1 = c.hint1;
      if (c.hint2 && c.hint2.length > (p.hint2||'').length) p.hint2 = c.hint2;
      if (c.hint3 && c.hint3.length > (p.hint3||'').length) p.hint3 = c.hint3;
    }
  });

  const sfOutput = `// SolveFire Problem Database
// Generated: ${new Date().toISOString()}
// Used with permission from SolveFire (solvefire.net)
// DO NOT REDISTRIBUTE without SolveFire's consent

window.SF_PROBLEMS = ${JSON.stringify(sfProbs, null, 2)};

if (typeof window !== 'undefined') {
  window.SF_PROBLEMS_LOADED = true;
}
`;
  writeFileSync(sfPath, sfOutput);
  console.log('✅ Updated solvefire-problems.js');
}

// Uncomment to also process SolveFire when running:
// processSolveFire().catch(console.error);
