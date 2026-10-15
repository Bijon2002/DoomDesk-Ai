/**
 * Critical event and price signal detection engine.
 * Scans incoming headlines and summaries for high-priority economic and price triggers.
 */

export interface DetectedSignal {
  isCritical: boolean;
  alertType: 'price_confirmed' | 'price_risk' | 'news_critical' | 'watch';
  severity: 'critical' | 'elevated' | 'watch';
  title: string;
  message: string;
  entities: string[];
}

export function detectSignals(title: string, summary: string): DetectedSignal | null {
  const combined = `${title} ${summary}`.toLowerCase();

  // 1. Confirmed Fuel Price Revision
  const hasFuelWords = /\b(petrol|diesel|kerosene|fuel price|cpc|ceypetco|octane 92|octane 95)\b/i.test(combined);
  const hasRevisionWords = /\b(revised|revision|increased by|reduced by|hiked|slashed|new price|effective from)\b/i.test(combined);

  if (hasFuelWords && hasRevisionWords) {
    const isOfficialNotice = /\b(cpc|ceypetco|ministry of energy|government|gazette)\b/i.test(combined);
    return {
      isCritical: true,
      alertType: isOfficialNotice ? 'price_confirmed' : 'price_risk',
      severity: isOfficialNotice ? 'critical' : 'elevated',
      title: `Fuel Price Action: ${title.slice(0, 80)}`,
      message: summary.slice(0, 200) || title,
      entities: ['fuel', 'cpc', 'energy']
    };
  }

  // 2. Central Bank / Currency / Interest Rate Actions
  const hasCBSL = /\b(central bank|cbsl|monetary policy|sdfr|slfr|statutory reserve|usd\/lkr)\b/i.test(combined);
  const hasPolicyAction = /\b(rate hike|rate cut|raised rates|lowered rates|rupee depreciates|rupee strengthens|inflation surges)\b/i.test(combined);

  if (hasCBSL && hasPolicyAction) {
    return {
      isCritical: true,
      alertType: 'news_critical',
      severity: 'elevated',
      title: `Monetary / Currency Event: ${title.slice(0, 80)}`,
      message: summary.slice(0, 200) || title,
      entities: ['cbsl', 'monetary_policy', 'rupee']
    };
  }

  // 3. Gazette / Tax / Import Duty / Tariffs
  const hasTaxAction = /\b(gazette|import duty|vat|cess|electricity tariff|water tariff|price control)\b/i.test(combined);
  const hasUrgentAction = /\b(effective immediately|tax increase|tariff hike|imposed|announced)\b/i.test(combined);

  if (hasTaxAction && hasUrgentAction) {
    return {
      isCritical: true,
      alertType: 'news_critical',
      severity: 'elevated',
      title: `Policy / Regulatory Alert: ${title.slice(0, 80)}`,
      message: summary.slice(0, 200) || title,
      entities: ['gazette', 'tax', 'regulations']
    };
  }

  // 4. Global Oil & Geopolitical Shock
  const hasGlobalOil = /\b(brent crude|opec|strait of hormuz|oil surge|crude spikes)\b/i.test(combined);
  if (hasGlobalOil) {
    return {
      isCritical: false,
      alertType: 'watch',
      severity: 'watch',
      title: `Global Energy Watch: ${title.slice(0, 80)}`,
      message: summary.slice(0, 200) || title,
      entities: ['crude_oil', 'global_energy']
    };
  }

  return null;
}
