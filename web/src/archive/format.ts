const dateTime = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' })

export function formatDate(date: string) {
  return dateTime.format(new Date(date))
}

export function formatCount(count: number, forms: [string, string, string]) {
  const last = count % 10
  const tens = count % 100
  const index = tens >= 11 && tens <= 14 ? 2 : last === 1 ? 0 : last >= 2 && last <= 4 ? 1 : 2
  return `${count} ${forms[index]}`
}
