/**
 * Atlas AI API Route
 * Proxies frontend AI requests to Gemini 2.5 Flash
 * Deploy to: api/atlas.js
 */

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://mathatlas.vercel.app');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'GEMINI_API_KEY not set' });

  const { messages, system } = req.body || {};
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Missing messages array' });
  }

  // Build prompt from system + messages
  const systemText = system || '';
  const conversationText = messages.map(m =>
    `${m.role === 'user' ? 'Student' : 'Atlas AI'}: ${m.content}`
  ).join('\n\n');

  const prompt = systemText
    ? `${systemText}\n\n${conversationText}`
    : conversationText;

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 2048 }
        })
      }
    );

    const data = await geminiRes.json();

    // Filter out thought blocks
    let text = '';
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.text && !part.thought) text += part.text;
    }
    if (!text) return res.status(502).json({ error: 'No response from Gemini' });

    return res.status(200).json({ text, content: [{ text }] });
  } catch (err) {
    return res.status(500).json({ error: 'Network error', detail: err.message });
  }
};