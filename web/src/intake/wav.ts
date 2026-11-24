import { MAX_AUDIO_MB } from '../../../shared/contracts'

export function isSupportedWav(file: File) {
  return /\.wav$/iu.test(file.name) && file.size > 0 && file.size <= MAX_AUDIO_MB * 1024 * 1024
}
