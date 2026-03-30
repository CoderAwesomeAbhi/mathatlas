\/**
 * Atlas AI API Route — api/atlas.js
 * Math tutor assistant powered by Gemini
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not configured' });

  const { messages, system, max_tokens } = req.body || {};
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'Missing messages array' });
  }

  // Build Gemini prompt from system + conversation history
  const systemText = system || `You are Atlas, an expert AMC and AIME math competition tutor. You help students understand math concepts, solve problems, and improve their competition math skills. Be concise, encouraging, and use LaTeX for math ($...$). Focus on building intuition, not just giving answers.`;

  const conversationText = messages.map(m =>
    `${m.role === 'user' ? 'Student' : 'Atlas'}: ${m.content}`
  ).join('\n\n');

  const prompt = `${systemText}\n\n${conversationText}\n\nAtlas:`;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: max_tokens || 1000,
            thinkingConfig: { thinkingBudget: 0 }
          }
        })
      }
    );

    if (!geminiRes.ok) {
      const errBody = await geminiRes.text().catch(() => '');
      return res.status(502).json({ error: `Gemini API error ${geminiRes.status}`, detail: errBody.slice(0, 200) });
    }

    const data = await geminiRes.json();
    const parts = data?.candidates?.[0]?.content?.parts || [];
    let text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('');
    if (!text) text = parts.map(p => p.text || '').join('').trim();
    if (!text) return res.status(502).json({ error: 'Empty response from Gemini' });

    return res.status(200).json({ text, content: [{ text }] });
  } catch (err) {
    return res.status(500).json({ error: 'Network error', detail: err.message });
  }
};