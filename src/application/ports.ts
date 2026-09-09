import type { ClaudeSessionActivity, GitHubActivity } from '../domain/activity.js'
import type { DailyWindow } from '../domain/daily-window.js'

export interface ClaudeSessionSource {
  collect(window: DailyWindow): Promise<readonly ClaudeSessionActivity[]>
}

export interface GitHubActivitySource {
  collect(window: DailyWindow): Promise<readonly GitHubActivity[]>
}

export interface DailySummarizer {
  summarize(prompt: string): Promise<string>
}

export interface ProgressTask {
  update(detail: string): void
  done(summary: string): void
  fail(reason: string): void
}

export interface ProgressReporter {
  task(label: string): ProgressTask
  note(message: string): void
  stop(): void
}
