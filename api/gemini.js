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

Analyze the student's work and find the FIRST step with any error. Respond with ONLY a valid JSON object, no other text:

If correct: {"firstErrorStep":null,"errorType":"Correct","errorCode":null,"stepFeedback":[{"step":1,"status":"ok","comment":null}],"mainFeedback":"All steps are correct and well-reasoned.","hint":"Double-check your final answer matches the answer choices.","moduleLink":""}

If error: {"firstErrorStep":1,"errorType":"Arithmetic Error","errorCode":"A-1","stepFeedback":[{"step":1,"status":"error","comment":"brief explanation of error"}],"mainFeedback":"2-3 sentence explanation.","hint":"1-2 sentence hint without giving away the answer.","moduleLink":"relevant-topic"}`;

  // Try models in order until one works
  const MODELS = [
    'gemini-2.5-flash-preview-04-17',
    'gemini-2.0-flash-001',
    'gemini-1.5-flash-001',
    'gemini-1.5-flash-8b-001',
  ];

  for (const model of MODELS) {
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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

      // Rate limited or model not found — try next
      if (geminiRes.status === 429 || geminiRes.status === 404) continue;

      const rawText = await geminiRes.text();
      if (!geminiRes.ok) {
        return res.status(502).json({ error: 'Gemini API error', detail: rawText.substring(0, 300) });
      }

      let data;
      try { data = JSON.parse(rawText); }
      catch (e) { continue; }

      // Extract text, skipping internal thought parts
      let text = '';
      const parts = data?.candidates?.[0]?.content?.parts || [];
      for (const part of parts) {
        if (part.text && !part.thought) text += part.text;
      }
      if (!text && parts.length > 0) text = parts[parts.length - 1]?.text || '';
      if (!text) continue;

      // Clean and parse JSON
      const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

      try { return res.status(200).json(JSON.parse(clean)); } catch (e) {}

      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        try { return res.status(200).json(JSON.parse(match[0])); } catch (e) {}
      }

    } catch (err) {
      continue; // network error, try next model
    }
  }

  return res.status(503).json({ error: 'AI temporarily unavailable. Please try again in a moment.' });
};
