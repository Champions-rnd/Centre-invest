import type { AnalysisRequest, Finding } from '../../shared/contracts'
import { ApiError } from '../errors'

export async function analyzeInterview(_input: AnalysisRequest): Promise<Finding[]> {
  // Подключите ИИ-прокси по параметрам оргкомитета. Модель возвращает ID реплик.
  throw new ApiError(501, 'ANALYSIS_NOT_CONFIGURED', 'Анализ будет доступен после подключения ИИ-прокси.')
}
