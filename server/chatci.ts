export const CHATCI_BASE_URL = 'https://chatci.online/proxy/v1'

export function chatciKey() {
  return process.env.HR_CHATCI_API_KEY?.trim() || undefined
}

export function chatciTextProvider() {
  const key = chatciKey()
  if (!key) return
  return {
    source: 'chatci' as const,
    baseUrl: CHATCI_BASE_URL,
    model: process.env.HR_CHATCI_TEXT_MODEL?.trim() || 'gpt-6.2-sol',
    key,
  }
}
