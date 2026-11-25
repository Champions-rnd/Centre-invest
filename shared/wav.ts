// Read the WAV container directly so duration can be checked before transcription.
export function wavDurationSeconds(bytes: Uint8Array): number | undefined {
  if (bytes.byteLength < 12) return
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const tag = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
  const container = tag(0)
  const extended = container === 'RF64' || container === 'BW64'
  const littleEndian = container !== 'RIFX'
  if ((!extended && container !== 'RIFF' && container !== 'RIFX') || tag(8) !== 'WAVE') return

  const uint32 = (offset: number) => view.getUint32(offset, littleEndian)
  let end = uint32(4) + 8
  let extendedDataSize: number | undefined
  let extendedFrames = 0
  if (extended) {
    if (bytes.byteLength < 48 || tag(12) !== 'ds64') return
    const length = uint32(16)
    if (length < 28 || length > bytes.byteLength - 20) return
    end = Number(view.getBigUint64(20, true)) + 8
    extendedDataSize = Number(view.getBigUint64(28, true))
    extendedFrames = Number(view.getBigUint64(36, true))
  }
  if (end < 12 || end > bytes.byteLength) return

  let sampleRate = 0
  let blockAlign = 0
  let linear = false
  let dataBytes = 0
  let factFrames = 0
  for (let offset = 12; offset + 8 <= end;) {
    const id = tag(offset)
    const size = uint32(offset + 4)
    const start = offset + 8
    const length = id === 'data' && size === 0xffffffff && extendedDataSize !== undefined
      ? extendedDataSize : size
    if (length > end - start) return

    if (id === 'fmt ' && length >= 16) {
      let format = view.getUint16(start, littleEndian)
      sampleRate = uint32(start + 4)
      blockAlign = view.getUint16(start + 12, littleEndian)
      if (format === 0xfffe && length >= 40) format = uint32(start + 24)
      linear = format === 1 || format === 3
    } else if (id === 'data') {
      dataBytes += length
    } else if (id === 'fact' && length >= 4) {
      factFrames = uint32(start)
    }
    offset = start + length + length % 2
  }

  if (!sampleRate || !blockAlign || !dataBytes) return
  if (linear && dataBytes % blockAlign !== 0) return
  const frames = linear ? dataBytes / blockAlign : extendedFrames || factFrames
  if (frames > 0) return frames / sampleRate
}
