import type { InterviewResult } from '../shared/contracts'

export const demo: InterviewResult = {
  mode: 'demo',
  vacancy: {
    description: 'Младший геймдизайнер в компании, разрабатывающей интерактивные тренажёры.',
    criteria: ['Проектирование сценариев', 'Проверка сценариев с пользователями'],
  },
  transcript: [
    { id: 's1', speaker: 'Интервьюер', startMs: 0, endMs: 5200, text: 'Какой игровой сценарий вы проектировали?' },
    { id: 's2', speaker: 'Кандидат', startMs: 5400, endMs: 11700, text: 'Я спроектировал обучающий квест: описал цель игрока и условия победы.' },
  ],
  report: [
    {
      criterionId: 'c1',
      status: 'supported',
      conclusion: 'Кандидат описал свой вклад в проектирование обучающего квеста.',
      evidenceIds: ['s2'],
      gaps: [],
      nextQuestions: ['Как вы решили, какие действия игрок должен освоить в квесте?'],
    },
    {
      criterionId: 'c2',
      status: 'missing',
      conclusion: 'Интервью не содержит сведений о проверке сценария с пользователями.',
      evidenceIds: [],
      gaps: ['Неизвестно, проводилось ли пользовательское тестирование.'],
      nextQuestions: ['Как вы проверяли, что игроки понимают цель и правила квеста?'],
    },
  ],
}
