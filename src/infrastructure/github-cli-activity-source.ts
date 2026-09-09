import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import type {
  CommitActivity,
  GitHubActivity,
  IssueActivity,
  PullRequestActivity,
} from '../domain/activity.js'
import { searchRange, type DailyWindow } from '../domain/daily-window.js'
import type { GitHubActivitySource, ProgressReporter } from '../application/ports.js'

const run = promisify(execFile)

export type GitHubCliOptions = {
  readonly logins: readonly string[]
  readonly limit: number
  readonly timeoutMs: number
  readonly throttleMs: number
  readonly retries: number
  readonly progress: ProgressReporter
}

type ExecutionFailure = { readonly stderr?: string; readonly message?: string }

const wait = (durationMs: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, durationMs))

const describeFailure = (error: unknown): string => {
  const failure = error as ExecutionFailure
  const detail = (failure.stderr ?? '').trim() || (failure.message ?? String(error))
  return detail.split('\n').filter((line) => line.trim().length > 0)[0] ?? 'erreur inconnue'
}

type CommitPayload = {
  readonly repository?: { readonly fullName?: string }
  readonly commit?: { readonly message?: string; readonly author?: { readonly date?: string } }
  readonly url?: string
}

type IssuePayload = {
  readonly repository?: { readonly nameWithOwner?: string }
  readonly number?: number
  readonly title?: string
  readonly url?: string
  readonly state?: string
  readonly updatedAt?: string
  readonly isPullRequest?: boolean
}

const firstLine = (message: string): string => message.split('\n')[0] ?? message

const parseDate = (value: string | undefined): Date | null => {
  if (value === undefined) return null
  const moment = new Date(value)
  return Number.isNaN(moment.getTime()) ? null : moment
}

const SEARCHES_PER_LOGIN = 5

export const createGitHubCliActivitySource = (options: GitHubCliOptions): GitHubActivitySource => {
  let pending: Promise<unknown> = Promise.resolve()
  let completed = 0
  let reportProgress: (completed: number) => void = () => {}

  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const scheduled = pending.then(task, task)
    pending = scheduled.then(() => wait(options.throttleMs), () => wait(options.throttleMs))
    return scheduled
  }

  const search = async <T>(args: readonly string[]): Promise<readonly T[]> => {
    const attempt = async (): Promise<readonly T[]> => {
      const { stdout } = await run('gh', [...args], {
        timeout: options.timeoutMs,
        maxBuffer: 16 * 1024 * 1024,
      })
      const parsed: unknown = JSON.parse(stdout)
      return Array.isArray(parsed) ? (parsed as T[]) : []
    }

    let lastFailure = 'erreur inconnue'

    for (let remaining = options.retries; remaining >= 0; remaining -= 1) {
      try {
        const result = await enqueue(attempt)
        completed += 1
        reportProgress(completed)
        return result
      } catch (error) {
        lastFailure = describeFailure(error)
        if (remaining > 0) await wait(options.throttleMs * 4)
      }
    }

    completed += 1
    reportProgress(completed)
    options.progress.note(`gh ${args.slice(0, 2).join(' ')} (${args[3]}) a échoué : ${lastFailure}`)
    return []
  }

  const collectCommits = async (login: string, range: string): Promise<readonly CommitActivity[]> => {
    const payloads = await search<CommitPayload>([
      'search',
      'commits',
      '--author',
      login,
      '--author-date',
      range,
      '--limit',
      String(options.limit),
      '--json',
      'repository,commit,url',
    ])

    return payloads.flatMap((payload): CommitActivity[] => {
      const repository = payload.repository?.fullName
      const message = payload.commit?.message
      const at = parseDate(payload.commit?.author?.date)
      if (repository === undefined || message === undefined || at === null) return []
      return [{ repository, title: firstLine(message), url: payload.url ?? '', at }]
    })
  }

  const collectPullRequests = async (
    login: string,
    range: string,
  ): Promise<readonly PullRequestActivity[]> => {
    const fields = 'repository,number,title,url,state,updatedAt'
    const [authored, reviewed] = await Promise.all([
      search<IssuePayload>([
        'search', 'prs', '--author', login, '--updated', range,
        '--limit', String(options.limit), '--json', fields,
      ]),
      search<IssuePayload>([
        'search', 'prs', '--reviewed-by', login, '--updated', range,
        '--limit', String(options.limit), '--json', fields,
      ]),
    ])

    const byUrl = new Map<string, PullRequestActivity>()

    const absorb = (payloads: readonly IssuePayload[], role: PullRequestActivity['role']): void => {
      for (const payload of payloads) {
        const repository = payload.repository?.nameWithOwner
        const at = parseDate(payload.updatedAt)
        if (repository === undefined || payload.number === undefined || at === null) continue
        const url = payload.url ?? `${repository}#${payload.number}`
        if (byUrl.has(url)) continue
        byUrl.set(url, {
          repository,
          number: payload.number,
          title: payload.title ?? '',
          url,
          state: payload.state ?? 'unknown',
          role,
          at,
        })
      }
    }

    absorb(authored, 'author')
    absorb(reviewed, 'reviewer')

    return [...byUrl.values()]
  }

  const collectIssues = async (login: string, range: string): Promise<readonly IssueActivity[]> => {
    const fields = 'repository,number,title,url,state,updatedAt,isPullRequest'
    const [authored, commented] = await Promise.all([
      search<IssuePayload>([
        'search', 'issues', '--author', login, '--updated', range,
        '--limit', String(options.limit), '--json', fields,
      ]),
      search<IssuePayload>([
        'search', 'issues', '--commenter', login, '--updated', range,
        '--limit', String(options.limit), '--json', fields,
      ]),
    ])

    const byUrl = new Map<string, IssueActivity>()

    const absorb = (payloads: readonly IssuePayload[], role: IssueActivity['role']): void => {
      for (const payload of payloads) {
        if (payload.isPullRequest === true) continue
        const repository = payload.repository?.nameWithOwner
        const at = parseDate(payload.updatedAt)
        if (repository === undefined || payload.number === undefined || at === null) continue
        const url = payload.url ?? `${repository}#${payload.number}`
        if (byUrl.has(url)) continue
        byUrl.set(url, {
          repository,
          number: payload.number,
          title: payload.title ?? '',
          url,
          state: payload.state ?? 'unknown',
          role,
          at,
        })
      }
    }

    absorb(authored, 'author')
    absorb(commented, 'commenter')

    return [...byUrl.values()]
  }

  return {
    async collect(window) {
      const range = searchRange(window)
      const total = options.logins.length * SEARCHES_PER_LOGIN
      const task = options.progress.task('GitHub')

      completed = 0
      reportProgress = (done) => task.update(`${done}/${total} recherches`)
      reportProgress(0)

      const accounts = await Promise.all(
        options.logins.map(async (login): Promise<GitHubActivity> => {
          const [commits, pullRequests, issues] = await Promise.all([
            collectCommits(login, range),
            collectPullRequests(login, range),
            collectIssues(login, range),
          ])
          return { login, commits, pullRequests, issues }
        }),
      )

      const count = (pick: (account: GitHubActivity) => readonly unknown[]): number =>
        accounts.reduce((total, account) => total + pick(account).length, 0)

      task.done(
        `${count((account) => account.commits)} commits · ${count((account) => account.pullRequests)} PR · ${count((account) => account.issues)} issues`,
      )
      return accounts
    },
  }
}
