import { computeSimHash, simHashDistance } from './lib/simhash';
import { parseRssOrAtom } from './lib/rss';
import { detectSignals } from './lib/detector';
import { formatColomboTime, getNowUTC } from './lib/time';

export interface Env {
  DB: D1Database;
}

interface SourceRow {
  id: string;
  name: string;
  base_url: string;
  feed_url: string;
  source_type: string;
  category: string;
  publisher_group: string | null;
  reliability_score: number;
  poll_interval_sec: number;
  etag: string | null;
  last_modified: string | null;
  last_content_hash: string | null;
  failure_count: number;
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...CORS_HEADERS,
    },
  });
}

/**
 * Runs a single small-batch ingestion cycle for the next due source.
 * Engineered to strictly respect Cloudflare Free CPU limit (<10ms CPU).
 */
async function processNextSource(env: Env): Promise<{ sourceId?: string; itemsFound: number; newArticles: number; alertsCreated: number; skipped304?: boolean; error?: string }> {
  // Priority queue: get 1 due source
  const source = await env.DB.prepare(`
    SELECT * FROM sources 
    WHERE is_active = 1 
    ORDER BY failure_count ASC, next_fetch_at ASC NULLS FIRST, last_checked_at ASC NULLS FIRST 
    LIMIT 1
  `).first<SourceRow>();

  if (!source) {
    return { itemsFound: 0, newArticles: 0, alertsCreated: 0 };
  }

  const nowUTC = getNowUTC();
  const nextFetchTime = new Date(Date.now() + source.poll_interval_sec * 1000).toISOString();

  const reqHeaders: Record<string, string> = {
    'User-Agent': 'DoomDesk-AI-Monitor/1.1 (https://github.com/Bijon2002/DoomDesk-Ai)',
    'Accept': 'application/rss+xml, application/atom+xml, text/xml, application/xml, */*'
  };

  if (source.etag) reqHeaders['If-None-Match'] = source.etag;
  if (source.last_modified) reqHeaders['If-Modified-Since'] = source.last_modified;

  try {
    const res = await fetch(source.feed_url, {
      headers: reqHeaders,
      redirect: 'follow',
    });

    // HTTP 304 Not Modified -> Skip processing entirely, 0 D1 write overhead
    if (res.status === 304) {
      await env.DB.prepare(`
        UPDATE sources 
        SET last_checked_at = ?, next_fetch_at = ?, failure_count = 0 
        WHERE id = ?
      `).bind(nowUTC, nextFetchTime, source.id).run();

      return { sourceId: source.id, itemsFound: 0, newArticles: 0, alertsCreated: 0, skipped304: true };
    }

    if (!res.ok) {
      await env.DB.prepare(`
        UPDATE sources 
        SET failure_count = failure_count + 1, last_checked_at = ?, next_fetch_at = ? 
        WHERE id = ?
      `).bind(nowUTC, nextFetchTime, source.id).run();

      return { sourceId: source.id, itemsFound: 0, newArticles: 0, alertsCreated: 0, error: `HTTP ${res.status}` };
    }

    const newEtag = res.headers.get('etag');
    const newLastModified = res.headers.get('last-modified');
    const text = await res.text();

    const items = parseRssOrAtom(text, 15);
    let newArticles = 0;
    let alertsCreated = 0;

    for (const item of items) {
      const canonicalUrl = item.link.trim();
      const simhash = computeSimHash(item.title);
      const articleId = 'art_' + Math.random().toString(36).substring(2, 11);

      // Check if article already exists
      const existing = await env.DB.prepare(`SELECT id FROM articles WHERE canonical_url = ?`).bind(canonicalUrl).first();
      if (existing) continue;

      // Detect urgent price or policy signal
      const signal = detectSignals(item.title, item.summary);

      // Insert article
      await env.DB.prepare(`
        INSERT INTO articles (
          id, source_id, canonical_url, title, summary, published_at, fetched_at, 
          category, title_simhash, publisher_group, verification_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        articleId,
        source.id,
        canonicalUrl,
        item.title,
        item.summary,
        item.pubDate || nowUTC,
        nowUTC,
        source.category,
        simhash,
        source.publisher_group,
        'unverified'
      ).run();

      newArticles++;

      // If critical signal detected, create preliminary alert immediately (never gate on cross-verification)
      if (signal) {
        const dedupeKey = `alert_${signal.alertType}_${simhash.slice(0, 8)}`;
        const alertRes = await env.DB.prepare(`
          INSERT OR IGNORE INTO alerts (
            alert_type, severity, verification_status, title, message, dedupe_key, metadata, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          signal.alertType,
          signal.severity,
          'unverified',
          signal.title,
          signal.message,
          dedupeKey,
          JSON.stringify({ sourceUrl: canonicalUrl, sourceName: source.name, entities: signal.entities }),
          nowUTC
        ).run();

        if (alertRes.meta && alertRes.meta.changes > 0) {
          alertsCreated++;
        }
      }
    }

    // Update source status
    await env.DB.prepare(`
      UPDATE sources 
      SET last_checked_at = ?, last_success_at = ?, next_fetch_at = ?, 
          etag = ?, last_modified = ?, failure_count = 0 
      WHERE id = ?
    `).bind(nowUTC, nowUTC, nextFetchTime, newEtag, newLastModified, source.id).run();

    return { sourceId: source.id, itemsFound: items.length, newArticles, alertsCreated };

  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    await env.DB.prepare(`
      UPDATE sources 
      SET failure_count = failure_count + 1, last_checked_at = ?, next_fetch_at = ? 
      WHERE id = ?
    `).bind(nowUTC, nextFetchTime, source.id).run();

    return { sourceId: source.id, itemsFound: 0, newArticles: 0, alertsCreated: 0, error: errorMsg };
  }
}

export default {
  /**
   * Cron Trigger handler: runs small-batch ingestion every 10 mins.
   */
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(processNextSource(env));
  },

  /**
   * HTTP Request handler for API and probes.
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    // Health check endpoint
    if (url.pathname === '/health' || url.pathname === '/') {
      const nowUTC = getNowUTC();
      const colomboTime = formatColomboTime(nowUTC);
      const articleCount = await env.DB.prepare(`SELECT count(*) as total FROM articles`).first<{ total: number }>();
      const alertCount = await env.DB.prepare(`SELECT count(*) as total FROM alerts`).first<{ total: number }>();

      return jsonResponse({
        status: 'ok',
        version: '1.1.0',
        system: 'DoomDesk-AI News & Price Intelligence',
        time_utc: nowUTC,
        time_colombo: colomboTime,
        stats: {
          articles: articleCount?.total || 0,
          alerts: alertCount?.total || 0,
        }
      });
    }

    // Monotonic Cursor Alerts endpoint for Windows Desktop recovery
    // GET /api/alerts?after_id=123&limit=50
    if (url.pathname === '/api/alerts' && request.method === 'GET') {
      const afterId = parseInt(url.searchParams.get('after_id') || '0', 10);
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10), 100);

      const alerts = await env.DB.prepare(`
        SELECT id, alert_type, severity, verification_status, title, message, metadata, created_at 
        FROM alerts 
        WHERE id > ? 
        ORDER BY id ASC 
        LIMIT ?
      `).bind(afterId, limit).all();

      return jsonResponse({
        cursor: alerts.results.length > 0 ? alerts.results[alerts.results.length - 1].id : afterId,
        count: alerts.results.length,
        alerts: alerts.results
      });
    }

    // Create test alert (for testing Windows native notifications in M3)
    if (url.pathname === '/api/alerts/test' && request.method === 'POST') {
      const body = await request.json().catch(() => ({})) as { title?: string; message?: string; severity?: string };
      const nowUTC = getNowUTC();
      const title = body.title || 'Fuel Price Alert: CPC Octane 92 Revision Watch';
      const message = body.message || 'Global crude oil price movements and currency indicators signal potential revision pressure.';
      const severity = body.severity || 'elevated';

      const insert = await env.DB.prepare(`
        INSERT INTO alerts (alert_type, severity, verification_status, title, message, dedupe_key, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind('price_risk', severity, 'unverified', title, message, `test_${Date.now()}`, nowUTC).run();

      return jsonResponse({
        success: true,
        alert_id: insert.meta.last_row_id,
        created_at: nowUTC
      });
    }

    // News Articles endpoint
    // GET /api/articles?category=sri_lanka&limit=40
    if (url.pathname === '/api/articles') {
      const category = url.searchParams.get('category');
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '40', 10), 100);

      let query = `
        SELECT a.id, a.title, a.summary, a.canonical_url, a.published_at, a.category, 
               a.verification_status, a.publisher_group, s.name as source_name 
        FROM articles a 
        LEFT JOIN sources s ON a.source_id = s.id
      `;
      const params: unknown[] = [];

      if (category) {
        query += ` WHERE a.category = ?`;
        params.push(category);
      }

      query += ` ORDER BY a.published_at DESC LIMIT ?`;
      params.push(limit);

      const result = await env.DB.prepare(query).bind(...params).all();

      return jsonResponse({
        count: result.results.length,
        articles: result.results
      });
    }

    // Sources registry endpoint
    if (url.pathname === '/api/sources') {
      const sources = await env.DB.prepare(`
        SELECT id, name, feed_url, category, reliability_score, failure_count, last_checked_at, last_success_at, is_active 
        FROM sources 
        ORDER BY category, reliability_score DESC
      `).all();

      return jsonResponse({ sources: sources.results });
    }

    // Milestone 0 Source Probe endpoint
    // GET /api/probe?url=https://ceypetco.gov.lk/marketing-sales/
    if (url.pathname === '/api/probe') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return jsonResponse({ error: 'Missing ?url= parameter' }, 400);
      }

      const startTime = Date.now();
      try {
        const probeRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 DoomDesk-AI-Probe',
          },
          redirect: 'follow',
        });
        const durationMs = Date.now() - startTime;
        const bodyPreview = await probeRes.text();

        return jsonResponse({
          url: targetUrl,
          status: probeRes.status,
          statusText: probeRes.statusText,
          duration_ms: durationMs,
          headers: {
            etag: probeRes.headers.get('etag'),
            last_modified: probeRes.headers.get('last-modified'),
            content_type: probeRes.headers.get('content-type'),
            content_length: probeRes.headers.get('content-length') || bodyPreview.length,
          },
          body_preview: bodyPreview.slice(0, 500)
        });
      } catch (err: unknown) {
        return jsonResponse({
          url: targetUrl,
          error: err instanceof Error ? err.message : String(err),
          duration_ms: Date.now() - startTime
        }, 500);
      }
    }

    // Manual run trigger for collector (test small-batch ingestion)
    if (url.pathname === '/api/collect/run' && request.method === 'POST') {
      const result = await processNextSource(env);
      return jsonResponse(result);
    }

    return jsonResponse({ error: 'Not found' }, 404);
  }
};
