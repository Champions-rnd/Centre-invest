import { MAX_AUDIO_MB } from '../../../shared/contracts'

export function isSupportedWav(file: File) {
  return /\.wav$/iu.test(file.name) && file.size > 0 && file.size <= MAX_AUDIO_MB * 1024 * 1024
}

export const wavAccept = '.wav,audio/wav,audio/x-wav,audio/wave,audio/vnd.wave'

export async function validateWav(file: File) {
  if (!isSupportedWav(file)) throw new Error(`Выберите непустой WAV до ${MAX_AUDIO_MB} МБ.`)
  const header = new Uint8Array(await file.slice(0, 12).arrayBuffer())
  const container = String.fromCharCode(...header.subarray(0, 4))
  const type = String.fromCharCode(...header.subarray(8, 12))
  if (!['RIFF', 'RIFX', 'RF64', 'BW64'].includes(container) || type !== 'WAVE') {
    throw new Error('Этот файл не является записью WAV. Выберите исходный WAV или экспортируйте запись в этом формате.')
  }
}
