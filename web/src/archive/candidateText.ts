function decodeText(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1251').decode(bytes)
  }
}

export function candidateText(bytes: Uint8Array) {
  const text = decodeText(bytes).trim()
  if (!text || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text)) {
    throw new Error('Выберите непустой текстовый файл TXT.')
  }
  return text
}
