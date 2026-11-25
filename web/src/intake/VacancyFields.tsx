import { vacancySchema } from '../../../shared/contracts'

export function readVacancy(fields: FormData) {
  const description = String(fields.get('description') ?? '').trim()
  const criteria = String(fields.get('criteria') ?? '').split(/\r?\n/u).map(line => line.trim()).filter(Boolean)
  return vacancySchema.nullable().safeParse(description || criteria.length ? { description, criteria } : null)
}

export const vacancyError = 'Укажите до 20 критериев по одному на строку. Максимум 300 символов на критерий.'

export function VacancyFields({ values, onChange }: {
  values?: { criteria: string; description: string }
  onChange?: (field: 'criteria' | 'description', value: string) => void
} = {}) {
  return (
    <div className="vacancy-grid vacancy-context">
      <label>Критерии анализа
        <textarea name="criteria" value={values?.criteria} onChange={onChange && (event => onChange('criteria', event.target.value))} placeholder="По одному критерию на строку" rows={4} />
      </label>
      <label>Описание вакансии
        <textarea name="description" value={values?.description} onChange={onChange && (event => onChange('description', event.target.value))} maxLength={12000} rows={4} />
      </label>
    </div>
  )
}
