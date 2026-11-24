import { vacancyCriteria, type AnalysisRequest, type Finding } from '../../shared/contracts'

const commonWords = new Set([
  'кандидат', 'умение', 'наличие', 'знание', 'работа', 'также', 'который', 'могут',
  'with', 'about', 'using', 'their', 'experience', 'skills', 'knowledge', 'ability',
])

export function words(text: string) {
  return new Set((text.toLowerCase().replaceAll('ё', 'е').match(/[\p{L}\p{N}]+/gu) ?? [])
    .filter(word => word.length >= 3 && !commonWords.has(word))
    .map(word => /^[а-я]{6,}$/u.test(word) ? word.slice(0, 5) : word))
}

export function analyzeInterview({ vacancy, transcript }: AnalysisRequest): Finding[] {
  const segments = transcript.map(segment => ({ id: segment.id, words: words(segment.text) }))
  return vacancyCriteria(vacancy).map(({ id, label }) => {
    const terms = [...words(label)]
    const evidenceIds = segments
      .map(segment => ({ id: segment.id, score: terms.filter(term => segment.words.has(term)).length }))
      .filter(segment => segment.score > 0)
      .sort((first, second) => second.score - first.score)
      .slice(0, 3)
      .map(segment => segment.id)
    const hasEvidence = evidenceIds.length > 0

    return {
      criterionId: id,
      status: hasEvidence ? 'partial' : 'missing',
      conclusion: hasEvidence ? 'Найдены фрагменты с ключевыми словами критерия.' : 'В расшифровке не найдено совпадений по ключевым словам критерия.',
      evidenceIds,
      gaps: [hasEvidence ? 'Проверьте контекст и уточните личный вклад кандидата.' : 'Уточните этот опыт на следующей встрече. В записи могли использоваться другие формулировки.'],
      nextQuestions: [`Приведите пример по критерию «${label}». Какова была ваша роль и каков был результат?`],
    }
  })
}
