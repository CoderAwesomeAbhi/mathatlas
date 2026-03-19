async function fetchProblemText(link) {
  if (!link) return null;
  try {
    const res = await fetch(link, {
      headers: { 'User-Agent': 'MathAtlas/1.0 (educational platform; mathatlas.vercel.app)' },
      signal: AbortSignal.timeout(8000)
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
    return body.substring(0, 1000) || null;
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://mathatlas.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const { problem, steps } = req.body || {};
  if (!problem || !steps || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'Missing problem or steps' });
  }

  const linkMatch = problem.match(/https?:\/\/\S+/);
  const aopsLink = linkMatch ? linkMatch[0] : null;
  let problemText = null;
  if (aopsLink) problemText = await fetchProblemText(aopsLink);

  const problemDescription = problemText
    ? `${problem}\n\nFULL PROBLEM TEXT:\n${problemText}`
    : `${problem}\n\n(Problem text could not be fetched.)`;

  const prompt = `You are an expert AMC/AIME math competition tutor analyzing a student's solution.

PROBLEM:
${problemDescription}

STUDENT STEPS:
${steps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n')}

Carefully analyze each step. Find the FIRST step that contains any error (logical mistake, wrong arithmetic, bad assumption, or incomplete casework).

Return ONLY a JSON object with these fields:
- firstErrorStep: integer (1-indexed) or null if all correct
- errorType: string describing error, or "Correct"
- errorCode: string like "A-1" or null
- stepFeedback: array of {step, status ("ok"/"error"/"warning"), comment (string or null)}
- mainFeedback: 2-3 sentence explanation
- hint: 1-2 sentence hint
- moduleLink: relevant topic or ""`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const rawText = await geminiRes.text();
    if (!geminiRes.ok) {
      return res.status(502).json({ error: 'Gemini API rejected the request', detail: rawText });
    }

    let data;
    try { data = JSON.parse(rawText); }
    catch (e) { return res.status(502).json({ error: 'Could not parse Gemini response', detail: rawText.substring(0, 300) }); }

    // Collect all non-thought text parts (Gemini 2.5 returns thinking blocks)
    let text = '';
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text && !part.thought) text += part.text;
    }
    if (!text) return res.status(502).json({ error: 'Gemini returned no text', detail: JSON.stringify(data).substring(0, 300) });

    // Strip markdown and parse JSON
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch (e) {
      const match = clean.match(/\{[\s\S]*\}/);
      if (!match) return res.status(502).json({ error: 'No JSON in response', detail: clean.substring(0, 300) });
      try { parsed = JSON.parse(match[0]); }
      catch (e2) { return res.status(502).json({ error: 'Could not parse JSON', detail: match[0].substring(0, 300) }); }
    }

    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: 'Network error calling Gemini', detail: err.message });
  }
};