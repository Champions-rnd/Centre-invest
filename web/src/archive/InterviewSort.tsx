import { SelectField } from '../ui/SelectField'
import type { InterviewSummary } from '../../../shared/archive'

const options = {
  recent: 'Сначала новые',
  oldest: 'Сначала старые',
  name: 'По названию файла',
  segments: 'По количеству фрагментов',
} as const

export type InterviewOrder = keyof typeof options

const filenames = new Intl.Collator('ru', { numeric: true, sensitivity: 'base' })

export function sortInterviews<T extends InterviewSummary>(items: T[], order: InterviewOrder): T[] {
  return [...items].sort((a, b) => {
    const newest = b.createdAt.localeCompare(a.createdAt)
    if (order === 'oldest') return -newest
    if (order === 'name') return filenames.compare(a.fileName, b.fileName) || newest
    if (order === 'segments') return b.segmentCount - a.segmentCount || newest
    return newest
  })
}

export function InterviewSort({ value, onChange }: { value: InterviewOrder; onChange: (order: InterviewOrder) => void }) {
  return <SelectField label="Сортировка интервью" className="sort-field" value={value}
    onChange={value => onChange(value as InterviewOrder)}
    options={Object.entries(options).map(([value, label]) => ({ value, label }))} />
}
