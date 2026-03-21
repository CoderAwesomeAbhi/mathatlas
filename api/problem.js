// api/problem.js — fetches AMC problem text from AoPS
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { url } = req.query;
  if (!url || !url.includes('artofproblemsolving.com')) {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'MathAtlas/1.0 (educational platform; mathatlas.vercel.app)' },
      signal: AbortSignal.timeout(8000)
    });
    if (!r.ok) return res.status(502).json({ error: 'AoPS fetch failed' });

    const html = await r.text();

    // Extract the problem text from AoPS wiki page
    // The problem is in .mw-parser-output, before the first Solution heading
    const bodyMatch = html.match(/<div[^>]*class="[^"]*mw-parser-output[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/);
    if (!bodyMatch) return res.status(404).json({ error: 'Problem text not found' });

    let body = bodyMatch[1];

    // Remove everything from Solution heading onward
    body = body.replace(/(<h2[\s\S]*?>\s*(?:Solution|See Also|Video Solution)[\s\S]*)/i, '');

    // Convert math spans/spans to LaTeX-friendly format
    // AoPS uses <img> for math in some places, but wiki uses plain text with $
    // Clean up HTML tags but preserve math formatting
    body = body
      .replace(/<p[^>]*>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<b[^>]*>(.*?)<\/b>/gi, '**$1**')
      .replace(/<i[^>]*>(.*?)<\/i>/gi, '*$1*')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    if (!body || body.length < 10) return res.status(404).json({ error: 'No problem text found' });

    // Cache for 24 hours
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({ text: body.substring(0, 2000) });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
