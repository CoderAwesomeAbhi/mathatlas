module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { problem, steps } = req.body || {};

  if (!problem || !steps || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'Missing problem or steps' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });
  }

  const prompt = `You are an expert AMC/AIME mathematics tutor. A student submitted a solution to the following problem.

PROBLEM:
${problem}

STUDENT SOLUTION STEPS:
${steps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n')}

Analyze the student's reasoning. Identify the first step with a logical error, arithmetic mistake, unjustified assumption, or incomplete casework. Classify the error type and give targeted feedback.

Respond ONLY with a valid JSON object, no markdown, no backticks:
{
  "firstErrorStep": <step number as integer, or null if all correct>,
  "errorType": "<one of: Arithmetic Error | Overcounting Error | Undercounting Error | Unjustified Assumption | Incomplete Casework | Setup Error | Correct>",
  "errorCode": "<e.g. C-2 for counting, A-1 for algebra, G-3 for geometry, or null if correct>",
  "stepFeedback": [
    { "step": <number>, "status": "<ok | error | warning>", "comment": "<brief comment or null>" }
  ],
  "mainFeedback": "<2-3 sentence explanation of the primary error>",
  "hint": "<1-2 sentence hint toward correct approach without giving answer away>",
  "moduleLink": "<relevant topic module name, e.g. Inclusion-Exclusion>"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 1024 }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini error:', err);
      return res.status(502).json({ error: 'Gemini API error', detail: err });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) return res.status(502).json({ error: 'Empty response from Gemini' });

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
