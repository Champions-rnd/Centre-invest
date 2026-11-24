export const CHATCI_BASE_URL = 'https://chatci.online/proxy/v1'

export function chatciKey() {
  return process.env.HR_CHATCI_API_KEY?.trim() || undefined
}
