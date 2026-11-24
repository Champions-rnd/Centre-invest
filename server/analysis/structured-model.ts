import { z } from 'zod'
import type { coachProvider } from './local-coach'

export async function generate<T>(
  provider: NonNullable<Awaited<ReturnType<typeof coachProvider>>>,
  signal: AbortSignal,
  prompt: string,
  content: string,
  schema: z.ZodType<T>,
  maxTokens: number,
  schemaName = 'interview_recommendations',
) {
  const response = await fetch(provider.baseUrl + '/chat/completions', {
    method: 'POST',
    redirect: 'error',
    signal: AbortSignal.any([signal, AbortSignal.timeout(180_000)]),
    headers: {
      'Content-Type': 'application/json',
      ...(provider.key ? { Authorization: `Bearer ${provider.key}` } : {}),
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.1,
      max_tokens: maxTokens,
      messages: [{ role: 'system', content: prompt }, { role: 'user', content }],
      response_format: {
        type: 'json_schema',
        json_schema: { name: schemaName, schema: z.toJSONSchema(schema), strict: true },
      },
    }),
  })
  if (!response.ok) throw new Error('Модель не приняла запрос.')
  const payload = await response.json()
  return schema.parse(JSON.parse(payload.choices[0].message.content))
}
