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
  res.setHeader('Access-Control-Allow-Origin', '*');
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

Analyze the student's work. Find the FIRST step that contains any error (arithmetic, logical, or conceptual). If all steps are correct, report no error.

Respond with a JSON object using exactly this structure:
{
  "firstErrorStep": null or step number (integer),
  "errorType": "Correct" or short error type like "Arithmetic Error" / "Logic Error" / "Setup Error",
  "errorCode": null or short code like "A-1",
  "stepFeedback": [{"step": 1, "status": "ok" or "error" or "warn", "comment": null or brief comment}],
  "mainFeedback": "2-3 sentence explanation of what was done right/wrong",
  "hint": "1-2 sentence hint toward the correct approach without giving away the answer",
  "moduleLink": "relevant topic keyword or empty string"
}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.0,
            maxOutputTokens: 1024,
            responseMimeType: 'application/json'
          }
        })
      }
    );

    const rawText = await geminiRes.text();
    if (!geminiRes.ok) {
      return res.status(502).json({ error: 'Gemini API error', detail: rawText.substring(0, 300) });
    }

    let data;
    try { data = JSON.parse(rawText); }
    catch (e) { return res.status(502).json({ error: 'Could not parse Gemini response' }); }

    // Extract text from response parts (skip thought parts)
    let text = '';
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text && !part.thought) text += part.text;
    }
    if (!text && parts.length > 0) text = parts[parts.length - 1]?.text || '';
    if (!text) return res.status(502).json({ error: 'Gemini returned no text' });

    // Clean and parse JSON
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    try {
      return res.status(200).json(JSON.parse(clean));
    } catch (e) {}

    const match = clean.match(/\{[\s\S]*\}/);
    if (!match) return res.status(502).json({ error: 'No JSON in response', detail: clean.substring(0, 200) });

    try {
      return res.status(200).json(JSON.parse(match[0]));
    } catch (e) {
      return res.status(502).json({ error: 'Could not parse JSON', detail: match[0].substring(0, 200) });
    }

  } catch (err) {
    return res.status(500).json({ error: 'Network error', detail: err.message });
  }
};
