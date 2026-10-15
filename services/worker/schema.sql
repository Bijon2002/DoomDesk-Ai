-- DoomDesk-AI Cloudflare D1 Database Schema v1.1

CREATE TABLE IF NOT EXISTS sources (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    feed_url TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'rss', -- 'rss', 'api', 'scrape'
    category TEXT NOT NULL DEFAULT 'news',   -- 'sri_lanka', 'world', 'tech', 'ai', 'economic'
    publisher_group TEXT,                    -- wire services or shared parent publishers
    reliability_score REAL NOT NULL DEFAULT 70.0,
    poll_interval_sec INTEGER NOT NULL DEFAULT 600,
    etag TEXT,
    last_modified TEXT,
    last_content_hash TEXT,
    failure_count INTEGER NOT NULL DEFAULT 0,
    last_checked_at TEXT,
    last_success_at TEXT,
    next_fetch_at TEXT,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS articles (
    id TEXT PRIMARY KEY,
    source_id TEXT NOT NULL REFERENCES sources(id),
    canonical_url TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT,
    content TEXT,
    published_at TEXT,
    fetched_at TEXT NOT NULL,
    language TEXT NOT NULL DEFAULT 'en',
    category TEXT NOT NULL DEFAULT 'sri_lanka',
    content_hash TEXT,
    title_simhash TEXT,
    publisher_group TEXT,
    rank_score REAL DEFAULT 0.0,
    verification_status TEXT NOT NULL DEFAULT 'unverified', -- 'verified', 'partially_verified', 'unverified', 'conflicting', 'contradicted'
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_articles_canonical_url ON articles(canonical_url);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at);
CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
CREATE INDEX IF NOT EXISTS idx_articles_simhash ON articles(title_simhash);

CREATE TABLE IF NOT EXISTS claims (
    id TEXT PRIMARY KEY,
    article_id TEXT NOT NULL REFERENCES articles(id),
    normalized_claim TEXT NOT NULL,
    subject TEXT,
    claim_date TEXT,
    entities TEXT, -- JSON array of entities
    extraction_time TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS claim_evidence (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES claims(id),
    source_article_id TEXT NOT NULL REFERENCES articles(id),
    relationship TEXT NOT NULL, -- 'supports', 'contradicts', 'context'
    excerpt TEXT,
    independence_score REAL DEFAULT 1.0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS economic_series (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    frequency TEXT NOT NULL DEFAULT 'daily', -- 'daily', 'monthly', 'ad-hoc'
    category TEXT NOT NULL DEFAULT 'macro',  -- 'fuel', 'food', 'currency', 'inflation'
    source_id TEXT REFERENCES sources(id)
);

CREATE TABLE IF NOT EXISTS economic_observations (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES economic_series(id),
    observed_at TEXT NOT NULL,
    value REAL NOT NULL,
    is_official INTEGER NOT NULL DEFAULT 1,
    source_ref TEXT,
    fetched_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_observations_series_observed ON economic_observations(series_id, observed_at);

CREATE TABLE IF NOT EXISTS forecasts (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES economic_series(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    target_date TEXT NOT NULL,
    direction TEXT NOT NULL, -- 'increase', 'decrease', 'stable'
    probability_up REAL,
    predicted_change_pct REAL,
    model_version TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' -- 'active', 'evaluated', 'expired'
);

CREATE TABLE IF NOT EXISTS forecast_evidence (
    id TEXT PRIMARY KEY,
    forecast_id TEXT NOT NULL REFERENCES forecasts(id),
    article_id TEXT REFERENCES articles(id),
    observation_id TEXT REFERENCES economic_observations(id),
    contribution_weight REAL,
    explanation TEXT
);

CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    alert_type TEXT NOT NULL, -- 'news_critical', 'price_confirmed', 'price_risk', 'watch', 'data_warning'
    severity TEXT NOT NULL,   -- 'critical', 'elevated', 'watch', 'warning'
    verification_status TEXT NOT NULL DEFAULT 'unverified',
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    dedupe_key TEXT UNIQUE,
    metadata TEXT,            -- JSON object with source URLs, prices, evidence links
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_alerts_id ON alerts(id);
CREATE INDEX IF NOT EXISTS idx_alerts_created_at ON alerts(created_at);

CREATE TABLE IF NOT EXISTS alert_deliveries (
    id TEXT PRIMARY KEY,
    alert_id INTEGER NOT NULL REFERENCES alerts(id),
    client_id TEXT NOT NULL,
    delivered_at TEXT NOT NULL,
    acknowledged_at TEXT
);

-- Seed initial prioritized sources
INSERT OR IGNORE INTO sources (id, name, base_url, feed_url, source_type, category, publisher_group, reliability_score, poll_interval_sec) VALUES
('cbsl_press', 'Central Bank of Sri Lanka Notices', 'https://www.cbsl.gov.lk', 'https://www.cbsl.gov.lk/en/rss/notices.xml', 'rss', 'sri_lanka', 'government_cbsl', 99.0, 600),
('cpc_fuel', 'Ceylon Petroleum Corporation Fuel Notices', 'https://ceypetco.gov.lk', 'https://ceypetco.gov.lk/marketing-sales/', 'scrape', 'economic', 'government_cpc', 98.0, 1800),
('adaderana_en', 'Ada Derana English', 'https://www.adaderana.lk', 'http://www.adaderana.lk/rss.php', 'rss', 'sri_lanka', 'derana', 80.0, 600),
('dailymirror_news', 'Daily Mirror Sri Lanka', 'https://www.dailymirror.lk', 'https://www.dailymirror.lk/rss/top_stories', 'rss', 'sri_lanka', 'wijeya', 82.0, 600),
('economynext', 'EconomyNext Sri Lanka', 'https://economynext.com', 'https://economynext.com/feed/', 'rss', 'sri_lanka', 'economynext', 88.0, 900),
('reuters_energy', 'Reuters Energy & Commodities', 'https://www.reuters.com', 'https://news.google.com/rss/search?q=when:24h+allinurl:reuters.com+oil+OR+energy+OR+fuel&hl=en-US&gl=US&ceid=US:en', 'rss', 'world', 'reuters_wire', 95.0, 1200),
('bbc_world', 'BBC World News', 'https://www.bbc.com', 'http://feeds.bbci.co.uk/news/world/rss.xml', 'rss', 'world', 'bbc', 92.0, 1200),
('huggingface_blog', 'Hugging Face Blog', 'https://huggingface.co', 'https://huggingface.co/blog/feed.xml', 'rss', 'ai', 'huggingface', 90.0, 3600),
('openai_news', 'OpenAI News', 'https://openai.com', 'https://openai.com/news/rss.xml', 'rss', 'ai', 'openai', 90.0, 3600);

-- Seed initial economic series
INSERT OR IGNORE INTO economic_series (id, code, name, unit, frequency, category) VALUES
('es_petrol_92', 'LKR_PETROL_92', 'Octane 92 Petrol Retail Price', 'LKR/Litre', 'ad-hoc', 'fuel'),
('es_auto_diesel', 'LKR_AUTO_DIESEL', 'Auto Diesel Retail Price', 'LKR/Litre', 'ad-hoc', 'fuel'),
('es_super_diesel', 'LKR_SUPER_DIESEL', 'Super Diesel Retail Price', 'LKR/Litre', 'ad-hoc', 'fuel'),
('es_usd_lkr', 'USD_LKR_RATE', 'US Dollar to Sri Lankan Rupee Indicative Rate', 'LKR', 'daily', 'currency'),
('es_brent_crude', 'BRENT_CRUDE_USD', 'Brent Crude Global Oil Price', 'USD/Barrel', 'daily', 'fuel');
