const HREF_REGEX = /<a\b[^>]*\bhref\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi;

export function extractLinksFromHtml(html) {
  const links = [];
  if (typeof html !== "string" || html.length === 0) {
    return links;
  }

  let match;
  while ((match = HREF_REGEX.exec(html)) !== null) {
    const href = match[1] ?? match[2] ?? match[3];
    if (href) {
      links.push(href.trim());
    }
  }

  return links;
}
