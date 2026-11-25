import { z } from 'zod'
import type { coachProvider } from './local-coach'
import type { chatciTextProvider } from '../chatci'

type Provider = NonNullable<Awaited<ReturnType<typeof coachProvider>> | ReturnType<typeof chatciTextProvider>>

class ModelError extends Error {
  constructor(readonly reason: string, readonly status?: number) {
    super(reason)
  }
}

export function modelFailure(error: unknown) {
  if (error instanceof ModelError) return error.message
  if (error instanceof Error && error.name === 'TimeoutError') return 'превышено время ожидания'
  return 'ответ не прошёл проверку'
}

async function request<T>(
  provider: Provider, signal: AbortSignal, model: string, body: object, schema: z.ZodType<T>,
  validate?: (data: T) => boolean,
) {
  const chatci = provider.source === 'chatci'
  let response: Response
  try {
    response = await fetch(provider.baseUrl + '/chat/completions', {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.any([signal, AbortSignal.timeout(chatci ? 45_000 : 180_000)]),
      headers: {
        'Content-Type': 'application/json',
        ...(provider.key ? { Authorization: `Bearer ${provider.key}` } : {}),
      },
      body: JSON.stringify({ model, ...body }),
    })
    if (!response.ok) {
      void response.body?.cancel().catch(() => {})
      throw new ModelError(`HTTP ${response.status}`, response.status)
    }
    const payload = await response.json()
    const message: unknown = payload?.choices?.[0]?.message?.content
    if (typeof message !== 'string' || !message.trim()) throw new ModelError('пустой текст ответа')
    const json = message.trim().replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1')
    const parsed = schema.safeParse(JSON.parse(json))
    if (!parsed.success) {
      const paths = [...new Set(parsed.error.issues.map(issue => issue.path.join('.')))].slice(0, 4)
      throw new ModelError('JSON не соответствует схеме' + (paths.length ? ` (${paths.join(', ')})` : ''))
    }
    if (validate && !validate(parsed.data)) throw new ModelError('ответ ссылается на непроверенные данные или неполон')
    return parsed.data
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (error instanceof ModelError) throw error
    if (error instanceof SyntaxError) throw new ModelError('некорректный JSON')
    if (error instanceof Error && error.name === 'TimeoutError') throw new ModelError('превышено время ожидания')
    throw new ModelError('ошибка соединения')
  }
}

export async function generate<T>(
  provider: Provider, signal: AbortSignal, prompt: string, content: string, schema: z.ZodType<T>,
  maxTokens: number, schemaName = 'interview_recommendations', validate?: (data: T) => boolean,
  promptSchema: z.ZodType = schema,
) {
  const shape = z.toJSONSchema(promptSchema)
  const chatci = provider.source === 'chatci'
  const system = chatci ? prompt + '\nВерни только объект JSON по этой схеме: ' + JSON.stringify(shape) : prompt
  const messages = [{ role: 'system', content: system }, { role: 'user', content }]
  if (!chatci) return request(provider, signal, provider.model, {
    messages, temperature: 0.1, max_tokens: maxTokens,
    response_format: { type: 'json_schema', json_schema: { name: schemaName, schema: shape, strict: true } },
  }, schema, validate)

  try {
    return await request(provider, signal, provider.model, { messages }, schema, validate)
  } catch (error) {
    if (signal.aborted) signal.throwIfAborted()
    if (provider.model === 'deepseek-v4.1-flash' || (error instanceof ModelError && error.status === 401)) throw error
    console.warn(`ChatCI: ${modelFailure(error)} у основной модели, пробуем DeepSeek Flash.`)
    return request(provider, signal, 'deepseek-v4.1-flash', { messages }, schema, validate)
  }
}
