/**
 * Feedback API Route
 * Receives feedback and forwards via email using Gemini project's SMTP
 * Deploy to: api/feedback.js
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  const { message, email, type } = req.body || {};
  if (!message) return res.status(400).json({ error: 'No message' });

  // Forward to Formspree
  try {
    const formData = new URLSearchParams();
    formData.append('message', message);
    formData.append('email', email || 'anonymous');
    formData.append('type', type || 'general');
    formData.append('_subject', `MathAtlas Feedback — ${type || 'general'}`);

    const resp = await fetch('https://formspree.io/f/mreydzje', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json'
      },
      body: formData.toString()
    });

    if (resp.ok) {
      return res.status(200).json({ ok: true });
    }
    const data = await resp.json();
    return res.status(502).json({ error: data.errors?.[0]?.message || 'Formspree error' });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};