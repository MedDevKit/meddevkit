/**
 * FNV-1a 32-bit hash of a string's UTF-16 code units, as 8 lowercase hex
 * digits. Synchronous and stable across browsers and Node, so the Azure
 * recording script and the demo's ReplayAdapter agree on input hashes.
 */
export function fnv1a32(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
