/**
 * Lightweight, fast RSS 2.0 and Atom XML parser for Cloudflare Workers.
 * Parses titles, links, descriptions, and publication dates without heavyweight XML dom libraries.
 */

export interface ParsedItem {
  title: string;
  link: string;
  summary: string;
  pubDate?: string;
  guid?: string;
}

function cleanText(text: string): string {
  if (!text) return '';
  return text
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(xml: string, tagName: string): string {
  const cdataRegex = new RegExp(`<${tagName}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tagName}>`, 'i');
  const cdataMatch = xml.match(cdataRegex);
  if (cdataMatch) return cdataMatch[1].trim();

  const standardRegex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const standardMatch = xml.match(standardRegex);
  if (standardMatch) return cleanText(standardMatch[1]);

  return '';
}

function extractAtomLink(itemXml: string): string {
  // Check <link href="..." />
  const linkHrefMatch = itemXml.match(/<link[^>]+href=["']([^"']+)["']/i);
  if (linkHrefMatch) return linkHrefMatch[1].trim();

  return extractTag(itemXml, 'link');
}

export function parseRssOrAtom(xmlContent: string, maxItems = 25): ParsedItem[] {
  const items: ParsedItem[] = [];

  // Match RSS <item> tags
  const rssItemMatches = xmlContent.match(/<item[\s\S]*?<\/item>/gi);
  if (rssItemMatches && rssItemMatches.length > 0) {
    for (const itemXml of rssItemMatches.slice(0, maxItems)) {
      const title = extractTag(itemXml, 'title');
      const link = extractTag(itemXml, 'link') || extractTag(itemXml, 'guid');
      const summary = extractTag(itemXml, 'description') || extractTag(itemXml, 'content:encoded');
      const pubDate = extractTag(itemXml, 'pubDate') || extractTag(itemXml, 'dc:date');
      const guid = extractTag(itemXml, 'guid');

      if (title && link) {
        items.push({
          title,
          link,
          summary: summary.slice(0, 500),
          pubDate: pubDate ? new Date(pubDate).toISOString() : undefined,
          guid: guid || link
        });
      }
    }
    return items;
  }

  // Fallback to Atom <entry> tags
  const atomEntryMatches = xmlContent.match(/<entry[\s\S]*?<\/entry>/gi);
  if (atomEntryMatches && atomEntryMatches.length > 0) {
    for (const entryXml of atomEntryMatches.slice(0, maxItems)) {
      const title = extractTag(entryXml, 'title');
      const link = extractAtomLink(entryXml);
      const summary = extractTag(entryXml, 'summary') || extractTag(entryXml, 'content');
      const pubDate = extractTag(entryXml, 'published') || extractTag(entryXml, 'updated');
      const guid = extractTag(entryXml, 'id');

      if (title && link) {
        items.push({
          title,
          link,
          summary: summary.slice(0, 500),
          pubDate: pubDate ? new Date(pubDate).toISOString() : undefined,
          guid: guid || link
        });
      }
    }
  }

  return items;
}
