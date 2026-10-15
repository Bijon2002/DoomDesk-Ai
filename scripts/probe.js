/**
 * Milestone 0 Local & Cloud Probe Tool
 * Checks reachability, response codes, latency, and caching headers (ETag, Last-Modified)
 * for all Sri Lanka primary sources and global feeds.
 */

const SOURCES = [
  { name: 'CBSL Notices RSS', url: 'https://www.cbsl.gov.lk/en/rss/notices.xml' },
  { name: 'CBSL Daily Price Report', url: 'https://www.cbsl.gov.lk/en/statistics/economic-indicators/price-report' },
  { name: 'CPC Official Fuel Prices', url: 'https://ceypetco.gov.lk/marketing-sales/' },
  { name: 'CPC Historical Prices', url: 'https://ceypetco.gov.lk/historical-prices/' },
  { name: 'Dept of Census & Statistics Inflation', url: 'https://www.statistics.gov.lk/InflationAndPrices/StaticalInformation' },
  { name: 'Government Gazette', url: 'https://documents.gov.lk/web/extra_gazettes' },
  { name: 'Ada Derana RSS', url: 'http://www.adaderana.lk/rss.php' },
  { name: 'Daily Mirror RSS', url: 'https://www.dailymirror.lk/rss/top_stories' },
  { name: 'EconomyNext Sri Lanka RSS', url: 'https://economynext.com/feed/' },
  { name: 'BBC World News RSS', url: 'http://feeds.bbci.co.uk/news/world/rss.xml' },
];

async function probeUrl(source) {
  const start = Date.now();
  try {
    const res = await fetch(source.url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 DoomDesk-AI-Probe/1.0',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      },
      signal: AbortSignal.timeout(12000)
    });
    const ms = Date.now() - start;
    const body = await res.text();
    return {
      name: source.name,
      url: source.url,
      status: res.status,
      durationMs: ms,
      bytes: body.length,
      etag: res.headers.get('etag') || 'None',
      lastModified: res.headers.get('last-modified') || 'None',
      contentType: res.headers.get('content-type') || 'Unknown',
      ok: res.ok
    };
  } catch (err) {
    return {
      name: source.name,
      url: source.url,
      status: 'FAILED',
      durationMs: Date.now() - start,
      error: err.message,
      ok: false
    };
  }
}

async function runAll() {
  console.log('=== DOOMDESK-AI SOURCE PROBE REPORT (Milestone 0) ===\n');
  const results = [];
  for (const src of SOURCES) {
    process.stdout.write(`Probing ${src.name.padEnd(35)} ... `);
    const result = await probeUrl(src);
    results.push(result);
    if (result.ok) {
      console.log(`[OK HTTP ${result.status}] (${result.durationMs}ms, ${(result.bytes / 1024).toFixed(1)} KB, ETag: ${result.etag !== 'None' ? 'Yes' : 'No'})`);
    } else {
      console.log(`[FAILED] (${result.status || result.error})`);
    }
  }

  console.log('\n--- Probe Summary ---');
  const passed = results.filter(r => r.ok).length;
  console.log(`Total: ${results.length} | Reachable: ${passed} | Blocked/Failed: ${results.length - passed}`);
}

runAll();
