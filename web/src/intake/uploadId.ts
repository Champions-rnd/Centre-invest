export function createUploadId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // randomUUID is available only in secure contexts, including localhost.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const id = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
  return [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join('-')
}
