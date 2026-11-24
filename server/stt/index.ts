import type { Segment } from '../../shared/contracts'
import { ApiError } from '../errors'

export async function transcribeWav(_audio: Express.Multer.File): Promise<Segment[]> {
  // Подключите модель WAV со спикерами и таймкодами от начала записи.
  throw new ApiError(501, 'STT_NOT_CONFIGURED', 'Распознавание WAV будет доступно после подключения модели.')
}
