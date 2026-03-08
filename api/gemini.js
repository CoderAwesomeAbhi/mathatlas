module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set in environment variables' });

  const { problem, steps } = req.body || {};
  if (!problem || !steps || !Array.isArray(steps) || steps.length === 0) {
    return res.status(400).json({ error: 'Missing problem or steps' });
  }

  const prompt = `You are an expert AMC/AIME math competition tutor analyzing a student's solution.

PROBLEM:
${problem}

STUDENT STEPS:
${steps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n')}

Carefully analyze each step. Find the FIRST step that contains any error (logical mistake, wrong arithmetic, bad assumption, or incomplete casework).

You MUST respond with ONLY this JSON object and absolutely nothing else - no explanation, no markdown, no backticks:
{"firstErrorStep":1,"errorType":"Overcounting Error","errorCode":"C-2","stepFeedback":[{"step":1,"status":"ok","comment":null},{"step":2,"status":"error","comment":"Error explanation here"}],"mainFeedback":"2-3 sentence explanation of the main error","hint":"1-2 sentence hint toward the right approach","moduleLink":"Inclusion-Exclusion"}

If all steps are correct use: {"firstErrorStep":null,"errorType":"Correct","errorCode":null,"stepFeedback":[{"step":1,"status":"ok","comment":null}],"mainFeedback":"All steps are correct.","hint":"Double check your final arithmetic.","moduleLink":""}`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 1024
          }
        })
      }
    );

    const rawText = await geminiRes.text();

    if (!geminiRes.ok) {
      console.error('Gemini rejected:', rawText);
      return res.status(502).json({
        error: 'Gemini API rejected the request',
        detail: rawText
      });
    }

    let data;
    try { data = JSON.parse(rawText); }
    catch (e) { return res.status(502).json({ error: 'Could not parse Gemini response', detail: rawText }); }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return res.status(502).json({ error: 'Gemini returned no text', detail: JSON.stringify(data).substring(0, 500) });

    const cleaned = text.replace(/```json|```/g, '').trim();
    let parsed;
    try { parsed = JSON.parse(cleaned); }
    catch (e) { return res.status(502).json({ error: 'Could not parse JSON from Gemini', detail: cleaned }); }

    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Network error calling Gemini', detail: err.message });
  }
};
