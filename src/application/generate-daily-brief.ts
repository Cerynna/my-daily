import { buildSummaryPrompt, renderActivity } from '../domain/daily-brief.js'
import { isEmpty, type DailyActivity } from '../domain/activity.js'
import type { DailyWindow } from '../domain/daily-window.js'
import type { ClaudeSessionSource, DailySummarizer, GitHubActivitySource } from './ports.js'

export type DailyBrief = {
  readonly activity: DailyActivity
  readonly raw: string
  readonly summary: string | null
}

export type GenerateDailyBriefRequest = {
  readonly window: DailyWindow
  readonly summarize: boolean
}

type Dependencies = {
  readonly claudeSessions: ClaudeSessionSource | null
  readonly github: GitHubActivitySource | null
  readonly summarizer: DailySummarizer
}

export const createGenerateDailyBrief = ({ claudeSessions, github, summarizer }: Dependencies) => {
  return async ({ window, summarize }: GenerateDailyBriefRequest): Promise<DailyBrief> => {
    const [sessions, accounts] = await Promise.all([
      claudeSessions === null ? Promise.resolve([]) : claudeSessions.collect(window),
      github === null ? Promise.resolve([]) : github.collect(window),
    ])

    const activity: DailyActivity = { window, sessions, github: accounts }
    const raw = renderActivity(activity)

    if (!summarize || isEmpty(activity)) return { activity, raw, summary: null }

    return { activity, raw, summary: await summarizer.summarize(buildSummaryPrompt(activity)) }
  }
}
