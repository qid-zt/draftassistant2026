// GET /api/news?q=Josh%20Allen
// Fetches Google News RSS server-side and returns headlines as JSON.
// No API key needed. Runs on Vercel's Node runtime.

const clean = (s) =>
  s.replace(/<!\[CDATA\[|\]\]>/g, "")
   .replace(/<[^>]+>/g, "")
   .replace(/&amp;/g, "&")
   .replace(/&#39;|&apos;/g, "'")
   .replace(/&quot;/g, '"')
   .replace(/&lt;/g, "<")
   .replace(/&gt;/g, ">")
   .trim();

const tag = (block, name) => {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? clean(m[1]) : "";
};

export default async function handler(req, res) {
  const q = String(req.query.q || "").slice(0, 80).trim();
  if (!q) {
    res.status(400).json({ error: "missing q", items: [] });
    return;
  }

  const url =
    "https://news.google.com/rss/search?q=" +
    encodeURIComponent(`"${q}" NFL when:14d`) +
    "&hl=en-US&gl=US&ceid=US:en";

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);

  try {
    const r = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (fantasy-draft-assistant)" },
    });
    clearTimeout(timer);

    if (!r.ok) {
      res.status(502).json({ error: "upstream " + r.status, items: [] });
      return;
    }

    const xml = await r.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .slice(0, 6)
      .map((m) => {
        const b = m[1];
        const source = tag(b, "source");
        let title = tag(b, "title");
        if (source && title.endsWith(" - " + source)) {
          title = title.slice(0, -(source.length + 3));
        }
        return { title, link: tag(b, "link"), source, date: tag(b, "pubDate") };
      })
      .filter((i) => i.title && i.link);

    // cached at the edge for 5 min so a draft room doesn't hammer the feed
    res.setHeader("Cache-Control", "s-maxage=300, stale-while-revalidate=900");
    res.status(200).json({ q, items });
  } catch (e) {
    clearTimeout(timer);
    res.status(502).json({ error: e.name === "AbortError" ? "timeout" : "fetch failed", items: [] });
  }
}
