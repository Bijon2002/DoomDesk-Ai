/**
 * 64-bit SimHash implementation for near-duplicate text detection in Cloudflare Workers.
 * Computes a fingerprint representing the semantic token distribution of text (such as news titles).
 */

function fnv1a64(text: string): bigint {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i));
    hash = (hash * prime) & 0xffffffffffffffffn;
  }
  return hash;
}

export function computeSimHash(text: string): string {
  // Normalize and tokenize (words of length >= 2)
  const tokens = text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 2);

  if (tokens.length === 0) {
    return '0'.repeat(16);
  }

  const v = new Array(64).fill(0);

  for (const token of tokens) {
    const hash = fnv1a64(token);
    for (let i = 0; i < 64; i++) {
      const bit = (hash >> BigInt(i)) & 1n;
      if (bit === 1n) {
        v[i] += 1;
      } else {
        v[i] -= 1;
      }
    }
  }

  let fingerprint = 0n;
  for (let i = 0; i < 64; i++) {
    if (v[i] > 0) {
      fingerprint |= 1n << BigInt(i);
    }
  }

  return fingerprint.toString(16).padStart(16, '0');
}

/**
 * Calculates the Hamming distance between two 64-bit hex SimHashes.
 * A distance <= 3 typically indicates identical or near-identical reporting across news outlets.
 */
export function simHashDistance(hashA: string, hashB: string): number {
  try {
    const a = BigInt('0x' + hashA);
    const b = BigInt('0x' + hashB);
    let xor = a ^ b;
    let distance = 0;
    while (xor > 0n) {
      if ((xor & 1n) === 1n) distance++;
      xor >>= 1n;
    }
    return distance;
  } catch {
    return 64;
  }
}
