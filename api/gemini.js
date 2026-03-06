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
  console.log('API key present:', !!apiKey);
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const prompt = `You are an expert AMC/AIME math tutor. Analyze these solution steps and return ONLY a JSON object with no markdown.

PROBLEM: ${problem}

STEPS:
${steps.map((s, i) => `Step ${i + 1}: ${s}`).join('\n')}

Return this exact JSON structure:
{"firstErrorStep":null,"errorType":"Correct","errorCode":null,"stepFeedback":[{"step":1,"status":"ok","comment":null}],"mainFeedback":"string","hint":"string","moduleLink":"string"}`;

  try {
    console.log('Calling Gemini...');
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 800 }
        })
      }
    );

    const responseText = await response.text();
    console.log('Gemini status:', response.status);
    console.log('Gemini response:', responseText.substring(0, 300));

    if (!response.ok) {
      return res.status(502).json({ error: 'Gemini error', detail: responseText });
    }

    const data = JSON.parse(responseText);
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return res.status(502).json({ error: 'Empty Gemini response', raw: JSON.stringify(data) });

    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return res.status(200).json(parsed);

  } catch (err) {
    console.error('Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
