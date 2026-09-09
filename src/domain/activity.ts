import type { DailyWindow } from './daily-window.js'

export type ClaudePrompt = {
  readonly at: Date
  readonly text: string
}

export type LinkedPullRequest = {
  readonly repository: string
  readonly number: number
  readonly url: string
}

export type ClaudeSessionActivity = {
  readonly sessionId: string
  readonly projectPath: string
  readonly gitBranch: string | null
  readonly title: string | null
  readonly prompts: readonly ClaudePrompt[]
  readonly touchedFiles: readonly string[]
  readonly pullRequests: readonly LinkedPullRequest[]
  readonly startedAt: Date
  readonly endedAt: Date
}

export type CommitActivity = {
  readonly repository: string
  readonly title: string
  readonly url: string
  readonly at: Date
}

export type PullRequestRole = 'author' | 'reviewer'

export type PullRequestActivity = {
  readonly repository: string
  readonly number: number
  readonly title: string
  readonly url: string
  readonly state: string
  readonly role: PullRequestRole
  readonly at: Date
}

export type IssueRole = 'author' | 'commenter'

export type IssueActivity = {
  readonly repository: string
  readonly number: number
  readonly title: string
  readonly url: string
  readonly state: string
  readonly role: IssueRole
  readonly at: Date
}

export type GitHubActivity = {
  readonly login: string
  readonly commits: readonly CommitActivity[]
  readonly pullRequests: readonly PullRequestActivity[]
  readonly issues: readonly IssueActivity[]
}

export type DailyActivity = {
  readonly window: DailyWindow
  readonly sessions: readonly ClaudeSessionActivity[]
  readonly github: readonly GitHubActivity[]
}

export const isEmpty = (activity: DailyActivity): boolean =>
  activity.sessions.length === 0 &&
  activity.github.every(
    (account) =>
      account.commits.length === 0 &&
      account.pullRequests.length === 0 &&
      account.issues.length === 0,
  )

export const projectName = (projectPath: string): string =>
  projectPath.split('/').filter(Boolean).at(-1) ?? projectPath
