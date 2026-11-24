import { candidateProfileSchema, type CandidateProfile } from '../../../shared/archive'

export const MAX_CANDIDATE_TEXT_BYTES = 128 * 1024

type CandidateText = Partial<Pick<CandidateProfile, 'specialty' | 'notes'>>
type Field = keyof CandidateText | 'ignore'

const fields: Record<string, Field> = {
  'специальность': 'specialty',
  'должность': 'specialty',
  'специализация': 'specialty',
  'профессия': 'specialty',
  'желаемая должность': 'specialty',
  'описание': 'notes',
  'описание кандидата': 'notes',
  'о себе': 'notes',
  'обо мне': 'notes',
  'фио': 'ignore',
  'ф.и.о.': 'ignore',
  'имя': 'ignore',
  'опыт': 'ignore',
  'зарплатные ожидания': 'ignore',
}

function decodeText(bytes: Uint8Array) {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le', { fatal: true }).decode(bytes)
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return new TextDecoder('utf-16be', { fatal: true }).decode(bytes)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return new TextDecoder('windows-1251').decode(bytes)
  }
}

function readLabel(line: string): { field: Field; value: string } | undefined {
  const input = line.trim().replace(/^(?:#{1,6}\s+|[-*•]\s+)/u, '')
  const match = /^(.+?)(?:\s*:\s*|\s+[—–=-]\s+)(.*)$/u.exec(input)
  const label = (match?.[1] ?? input).replace(/\*\*/gu, '').trim().toLocaleLowerCase('ru')
  if (!Object.hasOwn(fields, label)) return
  return { field: fields[label], value: (match?.[2] ?? '').replace(/^\*\*\s*/u, '').trim() }
}

export function parseCandidateText(bytes: Uint8Array): CandidateText {
  const text = decodeText(bytes).trim()
  if (!text || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text)) {
    throw new Error('Выберите TXT с текстом специальности или описания.')
  }

  const leading: string[] = []
  const description: string[] = []
  let specialty = ''
  let active: Field | undefined
  let hasSpecialtyLabel = false

  for (const line of text.split(/\r\n?|\n/u)) {
    const entry = readLabel(line)
    if (entry && (entry.field !== 'ignore' || active !== 'notes')) {
      active = entry.field
      if (active === 'specialty') {
        hasSpecialtyLabel = true
        if (entry.value) specialty = entry.value
      } else if (active === 'notes') {
        if (entry.value) description.push(entry.value)
      }
    } else if (active === 'notes' || (active === 'specialty' && specialty)) {
      description.push(line)
    } else if (active === 'specialty' && line.trim()) {
      specialty = line.trim()
    } else if (!active && line.trim()) {
      leading.push(line.trim())
    } else if (!active && leading.length) {
      leading.push('')
    }
  }

  if (!hasSpecialtyLabel && leading.length) specialty = leading.shift() ?? ''
  const notes = [...leading, ...description].join('\n').trim()
  if (!specialty && !notes) throw new Error('В TXT не найдены специальность или описание.')
  if (specialty && !candidateProfileSchema.shape.specialty.safeParse(specialty).success) {
    throw new Error('Специальность в TXT длиннее 120 символов.')
  }
  if (notes && !candidateProfileSchema.shape.notes.safeParse(notes).success) {
    throw new Error('Описание в TXT длиннее 1500 символов.')
  }
  return { ...(specialty && { specialty }), ...(notes && { notes }) }
}
