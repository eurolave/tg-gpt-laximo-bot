export function normalizeInput(s) {
  return (s || '').replace(/\s+/g, ' ').trim();
}
