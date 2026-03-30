// api/problem.js — fetches AMC/AIME problem text from AoPS wiki
// Called by index.html: /api/problem?display=...&year=...&num=...&contest=...
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { display = '', year = '', num = '', contest = '' } = req.query;
  if (!display && !year) return res.status(400).json({ error: 'Missing params' });

  // Build AoPS wiki URL from display string or params
  // display examples: "AMC 10A 2018 #4", "AIME I 2022 #7", "AMC 8 2019 #15"
  const aopsUrl = buildAoPSUrl(display, year, num, contest);
  if (!aopsUrl) return res.status(400).json({ error: 'Could not build AoPS URL', display });

  try {
    const r = await fetch(aopsUrl, {
      headers: { 'User-Agent': 'MathAtlas/1.0 (educational platform; mathatlas.vercel.app)' },
      signal: AbortSignal.timeout(10000)
    });
    if (!r.ok) return res.status(502).json({ error: `AoPS returned ${r.status}`, url: aopsUrl });

    const html = await r.text();
    const text = extractProblemText(html);
    if (!text) return res.status(404).json({ error: 'Problem text not found', url: aopsUrl });

    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.status(200).json({ text, url: aopsUrl });
  } catch (err) {
    return res.status(500).json({ error: err.message, url: aopsUrl });
  }
};

// ─── Build AoPS URL from params ───────────────────────────────────────────────
function buildAoPSUrl(display, year, num, contest) {
  const d = display.toLowerCase();
  const y = year || (display.match(/\b(19|20)\d{2}\b/) || [])[0] || '';
  const n = num || (display.match(/#(\d+)/) || [])[1] || '';
  if (!y || !n) return null;

  let contestPart = '';

  if (d.includes('aime ii') || d.includes('aime 2') || contest === 'aime2') {
    contestPart = `${y}_AIME_II`;
  } else if (d.includes('aime i') || d.includes('aime 1') || d.includes('aime i ') || (contest === 'aime' || contest === 'aime1') && !d.includes('ii')) {
    contestPart = parseInt(y) >= 2000 ? `${y}_AIME_I` : `${y}_AIME`;
  } else if (d.includes('amc 10a') || d.includes('amc10a')) {
    contestPart = `${y}_AMC_10A`;
  } else if (d.includes('amc 10b') || d.includes('amc10b')) {
    contestPart = `${y}_AMC_10B`;
  } else if (d.includes('amc 10') || contest === 'amc10') {
    // Pre-2002: unified AMC 10
    contestPart = parseInt(y) <= 2001 ? `${y}_AMC_10` : `${y}_AMC_10A`;
  } else if (d.includes('amc 12a') || d.includes('amc12a')) {
    contestPart = `${y}_AMC_12A`;
  } else if (d.includes('amc 12b') || d.includes('amc12b')) {
    contestPart = `${y}_AMC_12B`;
  } else if (d.includes('amc 12') || contest === 'amc12') {
    contestPart = parseInt(y) <= 2001 ? `${y}_AMC_12` : `${y}_AMC_12A`;
  } else if (d.includes('amc 8') || d.includes('amc8') || contest === 'amc8') {
    contestPart = `${y}_AMC_8`;
  } else if (d.includes('ajhsme')) {
    contestPart = `${y}_AJHSME`;
  } else if (d.includes('ahsme')) {
    contestPart = `${y}_AHSME`;
  } else if (contest === 'aime') {
    contestPart = parseInt(y) >= 2000 ? `${y}_AIME_I` : `${y}_AIME`;
  } else {
    return null;
  }

  return `https://artofproblemsolving.com/wiki/index.php/${contestPart}_Problems/Problem_${n}`;
}

// ─── Extract clean problem text from AoPS HTML ────────────────────────────────
function extractProblemText(html) {
  // Find the main content div
  const contentMatch = html.match(/<div[^>]+id="mw-content-text"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]+id="mw-normal-catlinks"/);
  let body = contentMatch ? contentMatch[1] : html;

  // Cut off at Solution/See Also/Video Solution headings
  body = body.replace(/(<h[23][^>]*>[\s\S]*?(Solution|See Also|Video|Resources|Related)[\s\S]*)/i, '');

  // Preserve LaTeX: AoPS uses <img class="latex"> with alt text containing the LaTeX
  // Convert to $...$ format for KaTeX rendering
  body = body.replace(/<img[^>]+class="[^"]*latex[^"]*"[^>]+alt="([^"]*)"[^>]*\/?>/gi, (_, alt) => {
    const decoded = alt
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#039;/g, "'");
    // If it looks like display math (has \\ or \begin), wrap in $$
    if (decoded.includes('\\\\') || decoded.includes('\\begin') || decoded.includes('\\frac') && decoded.length > 30) {
      return `$$${decoded}$$`;
    }
    return `$${decoded}$`;
  });

  // Clean up HTML tags while preserving structure
  body = body
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '\n• ')
    .replace(/<\/li>/gi, '')
    .replace(/<ul[^>]*>|<\/ul>|<ol[^>]*>|<\/ol>/gi, '\n')
    .replace(/<b[^>]*>(.*?)<\/b>/gis, '**$1**')
    .replace(/<strong[^>]*>(.*?)<\/strong>/gis, '**$1**')
    .replace(/<i[^>]*>(.*?)<\/i>/gis, '*$1*')
    .replace(/<em[^>]*>(.*?)<\/em>/gis, '*$1*')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&#\d+;/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return body && body.length > 20 ? body.substring(0, 3000) : null;
}