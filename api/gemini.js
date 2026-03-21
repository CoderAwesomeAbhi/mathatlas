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

If correct: {"firstErrorStep":null,"errorType":"Correct","errorCode":null,"stepFeedback":[{"step":1,"status":"ok","comment":null}],"mainFeedback":"All steps are correct.","hint":"Double-check your final answer.","moduleLink":""}

If error: {"firstErrorStep":1,"errorType":"Arithmetic Error","errorCode":"A-1","stepFeedback":[{"step":1,"status":"error","comment":"what is wrong"}],"mainFeedback":"2-3 sentences about the error.","hint":"1-2 sentence hint.","moduleLink":"topic"}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.0, maxOutputTokens: 8192 }
        })
      }
    );

    const data = await geminiRes.json();

    let text = '';
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text && !part.thought) text += part.text;
    }
    if (!text) return res.status(502).json({ error: 'No response from Gemini', raw: JSON.stringify(data).substring(0, 300) });

    const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();

    try { return res.status(200).json(JSON.parse(clean)); } catch (e) {}

    const match = clean.match(/\{[\s\S]*\}/);
    if (match) {
      try { return res.status(200).json(JSON.parse(match[0])); } catch (e) {}
    }

    return res.status(502).json({ error: 'Bad JSON', detail: clean.substring(0, 300) });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
