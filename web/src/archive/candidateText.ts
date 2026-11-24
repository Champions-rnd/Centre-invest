import { candidateProfileSchema, type CandidateProfile } from '../../../shared/archive'

export const MAX_CANDIDATE_TEXT_BYTES = 128 * 1024

type CandidateText = Partial<Pick<CandidateProfile, 'specialty' | 'notes'>>

const fields: Record<string, keyof CandidateText | 'ignore'> = {
  'специальность': 'specialty',
  'должность': 'specialty',
  'специализация': 'specialty',
  'описание': 'notes',
  'описание кандидата': 'notes',
  'о себе': 'notes',
  'фио': 'ignore',
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

export function parseCandidateText(bytes: Uint8Array): CandidateText {
  const text = decodeText(bytes).trim()
  if (!text || /[\x00-\x08\x0b\x0c\x0e-\x1f]/u.test(text)) {
    throw new Error('Выберите TXT с текстом специальности или описания.')
  }
  const lines = text.split(/\r\n?|\n/u)
  const collected: Record<keyof CandidateText, string[]> = { specialty: [], notes: [] }
  let active: keyof CandidateText | 'ignore' | undefined
  let foundLabel = false
  for (const line of lines) {
    const match = line.match(/^\s*([^:]+):\s*(.*)$/u)
    const label = match?.[1].trim().toLocaleLowerCase('ru')
    if (match && label && Object.hasOwn(fields, label)) {
      foundLabel = true
      active = fields[label]
      if (active !== 'ignore') collected[active].push(match[2])
    } else if (active === 'notes') {
      collected.notes.push(line)
    } else if (active === 'specialty' && !collected.specialty.some(part => part.trim()) && line.trim()) {
      collected.specialty.push(line)
    }
  }

  const specialty = (foundLabel ? collected.specialty.filter(part => part.trim()).join(' / ') : lines[0]).trim()
  const notes = (foundLabel ? collected.notes : lines.slice(1)).join('\n').trim()
  if (!specialty && !notes) throw new Error('В TXT не найдены специальность или описание.')
  if (specialty && !candidateProfileSchema.shape.specialty.safeParse(specialty).success) {
    throw new Error('Специальность в TXT длиннее 120 символов.')
  }
  if (notes && !candidateProfileSchema.shape.notes.safeParse(notes).success) {
    throw new Error('Описание в TXT длиннее 1500 символов.')
  }
  return { ...(specialty && { specialty }), ...(notes && { notes }) }
}
