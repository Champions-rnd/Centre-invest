import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream } from 'node:fs'
import { access, copyFile, mkdir, mkdtemp, rename, rm } from 'node:fs/promises'
import { basename, join, posix } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const whisperBuilds = {
  arm64: ['whisper-bin-win-cpu-arm64.zip', '4e522946827dcbc517d3cd7ee8d6cfe760e8143076924ac8513622694aa3ccfd'],
  x64: ['whisper-bin-x64.zip', 'ecca07b277d943e9b9f4712856a144b857271a6b333104e511e1988e80db582b'],
}
const runtime = fileURLToPath(new URL('../.speech/', import.meta.url))
const coachRuntime = join(runtime, 'coach')
const coachBuilds = {
  arm64: '272cce4ec53aff079cc32d0362932684b444b08d9f9e34924b9f7ebcae680b9d',
  x64: 'fdf78a3924fe92ccfb24af58544a6dccbc1feeb0587e77fca9ec3bef6737086c',
}
const coachModel = ['qwen2.5-1.5b-instruct-q4_k_m.gguf', 'Qwen/Qwen2.5-1.5B-Instruct-GGUF', '6a1a2eb6d15622bf3c96857206351ba97e1af16c30d7a74ee38970e434e9407e']
const headers = { 'User-Agent': 'HR-Analytics' }
const models = [
  ['ggml-base.bin', 'ggerganov/whisper.cpp', '60ed5bc3dd14eea856493d334349b405782ddcaf0028d4b5df4088345fba2efe'],
  ['ggml-silero-v6.2.0.bin', 'ggml-org/whisper-vad', '2aa269b785eeb53a82983a20501ddf7c1d9c48e33ab63a41391ac6c9f7fb6987'],
]

async function sha256(path) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return hash.digest('hex')
}

async function download(url, path, expected) {
  if (!/^[0-9a-f]{64}$/i.test(expected)) throw new Error('Контрольная сумма недоступна.')
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(30 * 60_000) })
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status} при загрузке ${url}.`)
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path))
  if (await sha256(path) !== expected.toLowerCase()) throw new Error(`Контрольная сумма ${basename(path)} не совпала.`)
}

function tar(args) {
  return execFileSync('tar.exe', args, { encoding: 'utf8', windowsHide: true })
}

function entries(archive) {
  return tar(['-tf', archive]).split(/\r?\n/u)
    .filter(entry => /^(?:[a-zA-Z0-9._-]+\/)*[a-zA-Z0-9._-]+$/u.test(entry) && !entry.split('/').includes('..'))
}

async function installExecutable(staging, directory, command, name, url, digest) {
  if (await access(join(directory, command)).then(() => true, () => false)) return
  console.log(`Загрузка ${command}…`)
  const archive = join(staging, name)
  await download(url, archive, digest)
  const files = entries(archive)
  const cli = files.find(file => posix.basename(file) === command)
  if (!cli) throw new Error(`В архиве не найден ${command}.`)
  const dlls = files.filter(file => posix.dirname(file) === posix.dirname(cli) && file.endsWith('.dll'))
  tar(['-xf', archive, '-C', staging, ...dlls, cli])
  for (const file of [...dlls, cli]) await copyFile(join(staging, file), join(directory, posix.basename(file)))
}

async function installFfmpeg(staging) {
  const target = join(runtime, 'ffmpeg.exe')
  if (await access(target).then(() => true, () => false)) return
  console.log('Загрузка FFmpeg…')
  const response = await fetch('https://api.github.com/repos/FFmpeg-Builds/FFmpeg-Builds/releases/tags/latest', {
    headers, signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Релиз FFmpeg недоступен (HTTP ${response.status}).`)
  const release = await response.json()
  const platform = process.arch === 'arm64' ? 'winarm64' : 'win64'
  const asset = release.assets.find(item => item.name.match(new RegExp(`^ffmpeg-n.+-latest-${platform}-gpl-[0-9.]+\\.zip$`)))
  if (!asset?.digest?.startsWith('sha256:')) throw new Error('В релизе FFmpeg нет подходящего архива.')
  const archive = join(staging, 'ffmpeg.zip')
  await download(asset.browser_download_url, archive, asset.digest.slice(7))
  const entry = entries(archive).find(file => file.endsWith('/bin/ffmpeg.exe'))
  if (!entry) throw new Error('В архиве FFmpeg не найден ffmpeg.exe.')
  tar(['-xf', archive, '-C', staging, entry])
  await copyFile(join(staging, entry), target)
}

async function installModel(staging, directory, [name, repository, digest]) {
  const target = join(directory, name)
  if (await sha256(target).catch(() => '') === digest) return
  console.log(`Загрузка ${name}…`)
  const path = join(staging, name)
  await download(`https://huggingface.co/${repository}/resolve/main/${name}?download=true`, path, digest)
  await rename(path, target)
}

async function setup() {
  const build = whisperBuilds[process.arch]
  if (process.platform !== 'win32' || !build) throw new Error('Автоматическая установка поддерживает Windows ARM64 и x64. Для других систем см. README.')
  await mkdir(runtime, { recursive: true })
  const staging = await mkdtemp(join(runtime, 'setup-'))
  try {
    if (process.argv.includes('--coach')) {
      await mkdir(coachRuntime, { recursive: true })
      const archive = `llama-b12676-bin-win-cpu-${process.arch}.zip`
      await installExecutable(staging, coachRuntime, 'llama-server.exe', archive,
        `https://github.com/ggml-org/llama.cpp/releases/download/b12676/${archive}`, coachBuilds[process.arch])
      await installModel(staging, coachRuntime, coachModel)
      console.log('Локальная модель рекомендаций готова.')
    } else {
      const [archive, digest] = build
      await installExecutable(staging, runtime, 'whisper-cli.exe', archive,
        `https://github.com/ggml-org/whisper.cpp/releases/download/b5907/${archive}`, digest)
      await installFfmpeg(staging)
      for (const model of models) await installModel(staging, runtime, model)
      console.log('Движок распознавания готов.')
    }
  } finally {
    await rm(staging, { recursive: true, force: true })
  }
}

setup().catch(error => {
  console.error(error.message)
  process.exitCode = 1
})
