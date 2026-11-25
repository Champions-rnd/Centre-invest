import { vacancyImportSchema } from '../../shared/contracts'

type Field = 'specialty' | 'description' | 'criteria'

const headings: Record<string, Field> = {
  'специальность': 'specialty', 'должность': 'specialty', 'название вакансии': 'specialty',
  'специализация': 'specialty', 'позиция': 'specialty', 'вакансия': 'specialty',
  'описание вакансии': 'description', 'описание': 'description', 'о вакансии': 'description',
  'обязанности': 'description', 'задачи': 'description', 'контекст вакансии': 'description',
  'критерии анализа': 'criteria', 'критерии для анализа': 'criteria', 'критерии': 'criteria',
  'критерии для разбора интервью': 'criteria', 'критерии оценки': 'criteria',
  'критерии для интервью': 'criteria', 'требования': 'criteria', 'требования к кандидату': 'criteria',
}

const bullet = /^\s*(?:(?:[КK]\s*\d+|\d+)[.)](?:\s*|$)|[-*•▪]\s+)/iu
const criterionBullet = /^\s*[КK]\s*\d+[.)]/iu
const sectionNumber = /^\s*\d+[.)]\s*/u

function readHeading(raw: string) {
  const line = raw.trim().replace(/^#{1,6}\s*/u, '').replace(sectionNumber, '').replace(/\*\*/gu, '')
  const match = /^([^:–—]+?)\s*(?:[:–—]\s*(.*))?$/u.exec(line)
  if (!match) return
  const name = match[1].trim().toLocaleLowerCase('ru').replace(/\s+/gu, ' ')
  if (Object.hasOwn(headings, name)) return { field: headings[name], value: match[2]?.trim() ?? '' }
}

export function parseVacancyText(text: string) {
  const preamble: string[] = []
  const description: string[] = []
  const criteria: string[] = []
  let specialty = ''
  let section: Field | undefined
  let pending: string[] = []
  let listItem = false
  let structured = false

  function flushCriterion() {
    const criterion = pending.join(' ').replace(/\s+/gu, ' ').trim()
    if (criterion) criteria.push(criterion)
    pending = []
  }

  for (const raw of text.split(/\r\n?|\n/u)) {
    const line = raw.trim()
    const heading = readHeading(line)
    if (heading) {
      flushCriterion()
      listItem = bullet.test(heading.value)
      structured = true
      section = heading.field
      if (heading.value) {
        if (section === 'specialty') specialty = heading.value
        if (section === 'description') description.push(heading.value)
        if (section === 'criteria') pending.push(heading.value.replace(bullet, ''))
      }
      continue
    }
    if (criterionBullet.test(line)) {
      section = 'criteria'
      structured = true
    }
    if (section === 'criteria') {
      if (bullet.test(line)) {
        flushCriterion()
        listItem = true
      } else if (!line || !listItem) {
        flushCriterion()
        listItem = false
      }
      if (line) pending.push(line.replace(bullet, ''))
    } else if (section === 'specialty' && line && !specialty) {
      specialty = line
    } else if (section) {
      description.push(line)
    } else {
      preamble.push(line)
    }
  }
  flushCriterion()

  const intro = preamble.join('\n').trim().split('\n')
  if (!specialty && (description.length || criteria.length) && intro[0].trim().length <= 120) {
    specialty = intro.shift()?.replace(/^#+\s*|\*\*/gu, '').trim() ?? ''
  }
  const result = {
    specialty,
    description: (structured ? [...intro, ...description] : []).join('\n').trim(),
    criteria: [...new Set(criteria)],
  }
  return {
    specialty: result.specialty.length <= 120 ? result.specialty : '',
    description: result.description.length <= 12_000 ? result.description : '',
    criteria: vacancyImportSchema.shape.criteria.safeParse(result.criteria).success ? result.criteria : [],
  }
}
