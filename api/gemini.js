/**
 * Gemini Step Checker — api/gemini.js
 * Analyzes student solution steps and finds errors
 */
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

  const prompt = `You are an expert AMC/AIME math competition tutor analyzing a student's solution.

PROBLEM: ${problem}

STUDENT STEPS:
${steps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n')}

Find the FIRST step with any error. Reply with ONLY this JSON, no other text:

If all correct: {"firstErrorStep":null,"errorType":"Correct","errorCode":null,"stepFeedback":[{"step":1,"status":"ok","comment":null}],"mainFeedback":"All steps are correct! Great work.","hint":"Double-check your final answer matches the answer choices.","moduleLink":""}

If error found: {"firstErrorStep":2,"errorType":"Arithmetic Error","errorCode":"A-1","stepFeedback":[{"step":1,"status":"ok","comment":null},{"step":2,"status":"error","comment":"Describe exactly what is wrong here"}],"mainFeedback":"2-3 sentences explaining the error and why it matters.","hint":"1-2 sentence hint pointing toward the fix without giving it away.","moduleLink":"algebra"}`;

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
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      return res.status(502).json({ error: `Gemini error ${geminiRes.status}`, detail: errBody.slice(0, 200) });
    }

    const data = await geminiRes.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
    if (!text) text = parts.map(p => p.text || '').join('').trim();
    if (!text) return res.status(502).json({ error: 'No response from Gemini' });

    // Try to parse JSON
    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try { return res.status(200).json(JSON.parse(clean)); } catch (_) {}
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try { return res.status(200).json(JSON.parse(match[0])); } catch (_) {}
    }
    return res.status(502).json({ error: 'Could not parse Gemini response as JSON', raw: clean.slice(0, 300) });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};