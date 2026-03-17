export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { problem, steps } = req.body;

  if (!problem || !steps || !Array.isArray(steps)) {
    return res.status(400).json({ error: 'Missing problem or steps' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const prompt = `You are an expert AMC/AIME mathematics tutor. A student has submitted a solution to the following problem.

PROBLEM:
${problem}

STUDENT'S SOLUTION STEPS:
${steps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n')}

Analyze the student's reasoning carefully. Your job is to:
1. Identify which step (if any) first contains a logical error, unjustified assumption, arithmetic mistake, or incomplete casework
2. Classify the error type
3. Provide targeted feedback

Respond ONLY with a valid JSON object in this exact format (no markdown, no backticks):
{
  "firstErrorStep": <step number as integer, or null if all steps are correct>,
  "errorType": "<one of: Arithmetic Error | Overcounting Error | Undercounting Error | Unjustified Assumption | Incomplete Casework | Setup Error | Correct>",
  "errorCode": "<e.g. C-2 for counting errors, A-1 for algebra, G-3 for geometry, or null if correct>",
  "stepFeedback": [
    {
      "step": <step number>,
      "status": "<ok | error | warning>",
      "comment": "<brief comment on this step, or null if no comment needed>"
    }
  ],
  "mainFeedback": "<2-3 sentence explanation of the primary error, specific to the student's reasoning>",
  "hint": "<1-2 sentence hint toward the correct approach without giving the answer away>",
  "moduleLink": "<name of the relevant topic module to review, e.g. 'Inclusion-Exclusion' or 'Polynomial Roots'>"
}`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${AIzaSyAQidovR1Hv5LQIPqqD1PDnYIWEFGR9_3M}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1024,
          }
        })
      }
    );

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemini error:', err);
      return res.status(502).json({ error: 'Gemini API error' });
    }

    const data = await response.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!raw) {
      return res.status(502).json({ error: 'Empty response from Gemini' });
    }

    // Strip any accidental markdown fences
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return res.status(200).json(parsed);
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
