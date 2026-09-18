import type { DailyActivity } from './activity.js'
import { buildArchitectureWeeklyPrompt } from './architecture-weekly-brief.js'
import { buildSummaryPrompt } from './daily-brief.js'

export type BriefKind = 'daily' | 'architecture-weekly'

export const summaryPromptFor = (kind: BriefKind, activity: DailyActivity): string => {
  switch (kind) {
    case 'daily':
      return buildSummaryPrompt(activity)
    case 'architecture-weekly':
      return buildArchitectureWeeklyPrompt(activity)
  }
}
