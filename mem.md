# Sri Lanka News Intelligence & Price Prediction System (DoomDesk-AI)
## Project Architecture & Implementation Memory

**Version:** 1.1 (Free-Tier Optimized / Production-Minded)  
**Primary Timezone:** UTC in storage / `Asia/Colombo` (UTC+5:30) in UI & daily briefings  
**Target Platform:** Cloudflare Workers + D1 (Cloud Ingestion & Intelligence) + React + Tauri (Windows Desktop & Native Notifications)

---

### 1. Executive Blueprint & Operating Principles

1. **Operating Rule:** Continuously collect facts, detect events, cross-verify claims, estimate economic risk, and alert only when evidence justifies it.
2. **Separation of Concerns:** 
   - News ranking is separate from price forecasting.
   - Breaking news alerts do not wait indefinitely for full cross-verification: send immediately labelled `Unverified`, then upgrade when corroborating evidence arrives.
   - Predictions are NEVER presented as official confirmed decisions.
3. **Hardware & Zero-Cost Constraints:**
   - Laptop: Intel i3 12th Gen, 8GB RAM, 1TB SSD, Windows 11. Heavy local AI models are avoided.
   - Cloud: Cloudflare Workers Free (10 ms CPU / cron run, 50 subrequests limit), Cloudflare D1 Free (5M rows read/day, 100k rows write/day, 5 GB storage), Cloudflare Pages Free.
   - Optional Batch Work: GitHub Actions cron (free tier) for heavy Python stats, or training models locally on laptop and exporting lightweight JSON rules to Workers.

---

### 2. Architecture & Tech Stack

| Layer | Technology | Key Responsibility |
|---|---|---|
| **Cloud Collector & API** | Cloudflare Workers (TypeScript) | Tiny scheduled runs, priority queue, ETag/Last-Modified check, SimHash fingerprinting |
| **Cloud Database** | Cloudflare D1 (SQLite engine) | Articles, claims, economic observations, forecasts, alerts, source registry |
| **Desktop Dashboard** | React + TypeScript + Tailwind CSS | News cards, verification badges, price trends, alert feeds |
| **Desktop Packaging** | Tauri (Rust + Webview2) | Tray background process, Windows startup, native Windows notifications |
| **Alert Transport** | Monotonic Cursor Polling (`/api/alerts?after_id=X`) | Reliable at-least-once alert recovery after sleep/restart without SSE limits |
| **Optional ML / Batch** | Python (statsmodels, scikit-learn, pandas) | Local laptop backtesting or GitHub Actions cron |

---

### 3. Data Sources Registry

#### A. Sri Lankan Primary & Economic Sources
- **Central Bank of Sri Lanka (CBSL):** Exchange rates (USD/LKR), policy rates, inflation, [Daily Price Report](https://www.cbsl.gov.lk/en/statistics/economic-indicators/price-report) (food prices).
- **Ceylon Petroleum Corporation (CPC):** Official fuel prices & [Historical Fuel Prices](https://ceypetco.gov.lk/historical-prices/). Detect language discrepancies (EN vs TM) and track effective dates.
- **Department of Census and Statistics (DCS):** CCPI inflation, producer price index (PPI), retail food prices.
- **Government Gazette:** Official regulations, tax changes, price orders.
- **Ministry of Energy / Power:** Tariff and fuel formula updates.

#### B. Global & Market Indicators
- **Commodity Prices:** Brent crude, refined petroleum products, World Bank Pink Sheet.
- **International Energy Agencies:** US EIA open API, IEA market reports.
- **Global News & Wires:** Reuters, AP, BBC, AFP feeds. Trusted publisher whitelist first; GDELT API used only as secondary discovery.

---

### 4. News Verification & Cross-Source Intelligence

The 5-question verification engine:
1. **Source Reliability:** Publisher track record, transparent corrections, domain reputation.
2. **Multi-Source Corroboration:** Are multiple outlets reporting the same facts?
3. **Source Independence:** Group wire copy (Reuters/AP/AFP) and common publisher groups so syndication is not miscounted as independent confirmation.
4. **Factual Consistency:** Match dates, numbers, figures, locations, and quotes.
5. **Conflicting / Contrary Evidence:** Identify explicit denials, corrections, or conflicting data.

**Verification Status Labels:**
- `Verified`: Supported by primary source or multiple independent trustworthy outlets.
- `Partially Verified`: Core fact supported, but numbers or timing remain unconfirmed.
- `Unverified`: Breaking news or single-source reporting with no independent backing yet.
- `Conflicting Reports`: Multiple credible outlets report incompatible facts.
- `Contradicted`: Strong primary evidence directly refutes the claim.

---

### 5. Prediction Engine & Economic Risk Analysis

- **Target Categories:**
  1. *Fuel (Petrol / Diesel / Kerosene):* Driven by global refined fuel prices, USD/LKR rate, taxes, and CPC pricing formulas.
  2. *Food & Essentials (Rice, Sugar, Wheat, Gas):* Wholesale/retail prices, import costs, freight, seasonal cycles.
  3. *Macroeconomic Indicators:* Inflation (CCPI), currency depreciation, interest rates.
- **Forecast Levels:**
  - `Confirmed`: Official Gazette, CPC, or CBSL published revision.
  - `Elevated Risk`: Calibrated statistical model indicates high probability of upward movement backed by verified indicators.
  - `Watch`: Early signals detected, but incomplete or volatile evidence.
  - `Data Warning`: Stale data, source downtime, or contradictory inputs.
- **Prediction Transparency:** Every prediction stores horizon (e.g. 14d, 30d), target change, probability, model version, freshness, and contributing evidence.

---

### 6. Cloudflare D1 Database Schema Summary

- `sources`: ID, name, base_url, feed_url, source_type, reliability_score, poll_interval_sec, etag, last_modified, last_content_hash, failure_count, next_fetch_at, is_active.
- `articles`: ID, source_id, canonical_url, title, summary, published_at, fetched_at, language, category, content_hash, title_simhash, publisher_group.
- `claims`: ID, article_id, normalized_claim, subject, claim_date, entities, extraction_time.
- `claim_evidence`: ID, claim_id, source_article_id, relationship (`supports` | `contradicts` | `context`), excerpt, independence_score.
- `economic_series`: ID, code, name, unit, frequency, category, source_id.
- `economic_observations`: ID, series_id, observed_at, value, is_official, source_ref.
- `forecasts`: ID, series_id, created_at, target_date, direction, probability_up, predicted_change_pct, model_version.
- `forecast_evidence`: forecast_id, article_id, observation_id, contribution_weight, explanation.
- `alerts`: ID (monotonically increasing integer), alert_type, severity (`critical` | `elevated` | `watch` | `warning`), verification_status, title, message, dedupe_key, created_at.
- `alert_deliveries`: ID, alert_id, client_id, delivered_at, acknowledged_at.

---

### 7. Implementation Roadmap

- [ ] **M0: Source Probes & Cloudflare Network Validation**
  - Verify access from Cloudflare Workers to CBSL, CPC, DCS, Gazette, and top RSS feeds.
  - Check HTTP headers (`ETag`, `Last-Modified`, content compression, CORS).
- [ ] **M1: Cloudflare Worker Ingestion & D1 Setup**
  - Project setup with `wrangler`, D1 migrations, small-batch scheduler, SimHash duplicate filtering.
- [ ] **M2: Alert API with Cursor Pagination**
  - `GET /api/alerts?after_id={id}&limit=50`, secure API keys/tokens, deduplication logic.
- [ ] **M3: Windows Desktop Application (React + Tauri)**
  - Windows system tray, background polling loop (60-120s), native desktop notifications, offline cursor persistence.
- [ ] **M4: Cross-Source News Verification Engine**
  - Publisher grouping, claim extraction, corroboration vs syndication check, reliability badges.
- [ ] **M5: Economic Data Pipeline & Historical Backfill**
  - CPC historical fuel prices table backfill, CBSL daily price ingestion, USD/LKR tracking.
- [ ] **M6: Forecasting & Risk Engine**
  - Rule-based fuel formula risk tracking, statistical baselines, backtesting framework, calibrated alerts.
