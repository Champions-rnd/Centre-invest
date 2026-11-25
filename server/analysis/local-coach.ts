import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

type Provider = { source: 'local' | 'configured'; baseUrl: string; model: string; key?: string }
let startup: Promise<Provider | undefined> | undefined

function availablePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const address = probe.address()
      probe.close(error => {
        if (error || !address || typeof address === 'string') reject(error ?? new Error('Нет свободного порта.'))
        else resolve(address.port)
      })
    })
  })
}

async function launchLocal(): Promise<Provider | undefined> {
  const directory = join(process.cwd(), '.speech', 'coach')
  const command = join(directory, 'llama-server.exe')
  const model = join(directory, 'qwen2.5-1.5b-instruct-q4_k_m.gguf')
  if (!await Promise.all([access(command), access(model)]).then(() => true, () => false)) return

  const port = await availablePort()
  const address = `http://127.0.0.1:${port}`
  const child = spawn(command, ['-m', model, '--alias', 'hr-coach', '--host', '127.0.0.1', '--port',
    String(port), '-c', '8192', '-np', '1', '-ngl', '0', '--log-disable'],
  { cwd: directory, windowsHide: true, stdio: 'ignore' })
  const stop = () => { child.kill() }
  const interrupt = () => process.exit(130)
  const terminate = () => process.exit(143)
  let stopped = false
  process.once('exit', stop)
  process.once('SIGINT', interrupt)
  process.once('SIGTERM', terminate)
  const ended = () => {
    stopped = true
    process.removeListener('exit', stop)
    process.removeListener('SIGINT', interrupt)
    process.removeListener('SIGTERM', terminate)
    startup = undefined
  }
  child.once('exit', ended)
  child.once('error', ended)
  child.unref()

  for (let attempt = 0; attempt < 100 && !stopped; attempt++) {
    const ready = await fetch(address + '/health', { signal: AbortSignal.timeout(1000) })
      .then(response => response.ok, () => false)
    if (ready && !stopped) return { source: 'local', baseUrl: address + '/v1', model: 'hr-coach' }
    await delay(300)
  }
  stop()
}

export async function coachProvider(): Promise<Provider | undefined> {
  const baseUrl = process.env.HR_COACH_BASE_URL?.trim().replace(/\/+$/u, '')
  const model = process.env.HR_COACH_MODEL?.trim()
  if (baseUrl || model) {
    if (!baseUrl || !model) throw new Error('Заполните HR_COACH_BASE_URL и HR_COACH_MODEL.')
    const url = new URL(baseUrl)
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
      throw new Error('Для удалённой модели укажите HTTPS.')
    }
    return { source: 'configured', baseUrl, model, key: process.env.HR_COACH_API_KEY }
  }
  startup ??= launchLocal().catch(error => {
    startup = undefined
    throw error
  })
  const provider = await startup
  if (!provider) startup = undefined
  return provider
}
