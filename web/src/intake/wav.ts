import { MAX_AUDIO_BYTES, MAX_AUDIO_MB, MAX_AUDIO_MINUTES } from '../../../shared/contracts'
import { wavDurationSeconds } from '../../../shared/wav'

export function isSupportedWav(file: File) {
  return /\.wav$/iu.test(file.name) && file.size > 0 && file.size <= MAX_AUDIO_BYTES
}

export const wavAccept = '.wav,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave'

export async function validateWav(file: File) {
  if (!isSupportedWav(file)) throw new Error(`Выберите непустой WAV до ${MAX_AUDIO_MB} МБ.`)
  const duration = wavDurationSeconds(new Uint8Array(await file.arrayBuffer()))
  if (duration === undefined) {
    throw new Error('Этот файл не является корректной записью WAV. Выберите исходный WAV или экспортируйте запись в этом формате.')
  }
  if (duration > MAX_AUDIO_MINUTES * 60) {
    throw new Error(`Длительность WAV должна быть не больше ${MAX_AUDIO_MINUTES} минут.`)
  }
}
