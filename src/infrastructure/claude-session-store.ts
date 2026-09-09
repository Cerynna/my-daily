import { createReadStream } from 'node:fs'
import { readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { createInterface } from 'node:readline'

import type { ClaudePrompt, ClaudeSessionActivity, LinkedPullRequest } from '../domain/activity.js'
import { contains, type DailyWindow } from '../domain/daily-window.js'
import type { ClaudeSessionSource, ProgressReporter } from '../application/ports.js'

const FILE_EDITING_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

const NOISE_PREFIXES = [
  '<command-name>',
  '<command-message>',
  '<local-command-stdout>',
  '<system-reminder>',
  '<user-prompt-submit-hook>',
  '<task-notification>',
  '<bash-input>',
  '<bash-stdout>',
  '[Request interrupted',
  'Caveat: The messages below',
]

export type ClaudeSessionStoreOptions = {
  readonly projectsDirectory: string
  readonly maxPromptLength: number
  readonly maxPromptsPerSession: number
  readonly maxFilesPerSession: number
  readonly excludedProjectPaths: readonly string[]
  readonly progress: ProgressReporter
}

type SessionDraft = {
  sessionId: string
  projectPath: string
  gitBranch: string | null
  title: string | null
  prompts: ClaudePrompt[]
  touchedFiles: Set<string>
  pullRequests: Map<string, LinkedPullRequest>
  startedAt: Date | null
  endedAt: Date | null
}

type JsonRecord = Record<string, unknown>

const asRecord = (value: unknown): JsonRecord | null =>
  typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as JsonRecord) : null

const asString = (value: unknown): string | null => (typeof value === 'string' ? value : null)

const parseTimestamp = (value: unknown): Date | null => {
  const raw = asString(value)
  if (raw === null) return null
  const moment = new Date(raw)
  return Number.isNaN(moment.getTime()) ? null : moment
}

const extractText = (content: unknown): string => {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      const block = asRecord(part)
      return block?.['type'] === 'text' ? (asString(block['text']) ?? '') : ''
    })
    .filter((text) => text.length > 0)
    .join('\n')
}

const isNoise = (text: string): boolean =>
  text.length === 0 || NOISE_PREFIXES.some((prefix) => text.startsWith(prefix))

const compact = (text: string, maxLength: number): string => {
  const flattened = text.replace(/\s+/g, ' ').trim()
  return flattened.length <= maxLength ? flattened : `${flattened.slice(0, maxLength).trimEnd()}…`
}

const draftFor = (drafts: Map<string, SessionDraft>, sessionId: string): SessionDraft => {
  const existing = drafts.get(sessionId)
  if (existing !== undefined) return existing
  const created: SessionDraft = {
    sessionId,
    projectPath: '',
    gitBranch: null,
    title: null,
    prompts: [],
    touchedFiles: new Set(),
    pullRequests: new Map(),
    startedAt: null,
    endedAt: null,
  }
  drafts.set(sessionId, created)
  return created
}

const widen = (draft: SessionDraft, moment: Date): void => {
  if (draft.startedAt === null || moment < draft.startedAt) draft.startedAt = moment
  if (draft.endedAt === null || moment > draft.endedAt) draft.endedAt = moment
}

export const createClaudeSessionStore = (options: ClaudeSessionStoreOptions): ClaudeSessionSource => {
  const readSessionFile = async (
    filePath: string,
    window: DailyWindow,
    drafts: Map<string, SessionDraft>,
  ): Promise<void> => {
    const lines = createInterface({
      input: createReadStream(filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    })

    for await (const line of lines) {
      if (line.length === 0) continue

      let entry: JsonRecord | null
      try {
        entry = asRecord(JSON.parse(line))
      } catch {
        continue
      }
      if (entry === null) continue

      const sessionId = asString(entry['sessionId'])
      if (sessionId === null) continue

      const type = asString(entry['type'])
      const timestamp = parseTimestamp(entry['timestamp'])

      if (type === 'ai-title') {
        const title = asString(entry['aiTitle'])
        if (title !== null) draftFor(drafts, sessionId).title = title
        continue
      }

      if (type === 'pr-link' && timestamp !== null && contains(window, timestamp)) {
        const url = asString(entry['prUrl'])
        const repository = asString(entry['prRepository'])
        const number = entry['prNumber']
        if (url !== null && repository !== null && typeof number === 'number') {
          const draft = draftFor(drafts, sessionId)
          draft.pullRequests.set(url, { repository, number, url })
          widen(draft, timestamp)
        }
        continue
      }

      if (timestamp === null || !contains(window, timestamp)) continue

      if (type === 'user' && entry['isMeta'] !== true && entry['isSidechain'] !== true) {
        const message = asRecord(entry['message'])
        if (message === null) continue
        const text = extractText(message['content']).trim()
        if (isNoise(text)) continue

        const draft = draftFor(drafts, sessionId)
        draft.projectPath = asString(entry['cwd']) ?? draft.projectPath
        draft.gitBranch = asString(entry['gitBranch']) ?? draft.gitBranch
        if (draft.prompts.length < options.maxPromptsPerSession) {
          draft.prompts.push({ at: timestamp, text: compact(text, options.maxPromptLength) })
        }
        widen(draft, timestamp)
        continue
      }

      if (type === 'assistant') {
        const message = asRecord(entry['message'])
        const content = message?.['content']
        if (!Array.isArray(content)) continue

        for (const part of content) {
          const block = asRecord(part)
          if (block?.['type'] !== 'tool_use') continue
          const toolName = asString(block['name'])
          if (toolName === null || !FILE_EDITING_TOOLS.has(toolName)) continue
          const input = asRecord(block['input'])
          const path = asString(input?.['file_path']) ?? asString(input?.['notebook_path'])
          if (path === null) continue

          const draft = draftFor(drafts, sessionId)
          draft.projectPath = asString(entry['cwd']) ?? draft.projectPath
          draft.touchedFiles.add(path)
          widen(draft, timestamp)
        }
      }
    }
  }

  const listSessionFiles = async (window: DailyWindow): Promise<readonly string[]> => {
    const projects = await readdir(options.projectsDirectory, { withFileTypes: true })
    const files: string[] = []

    for (const project of projects) {
      if (!project.isDirectory()) continue
      const projectDirectory = join(options.projectsDirectory, project.name)
      const entries = await readdir(projectDirectory, { withFileTypes: true })

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.jsonl')) continue
        const filePath = join(projectDirectory, entry.name)
        const { mtime } = await stat(filePath)
        if (mtime >= window.from) files.push(filePath)
      }
    }

    return files
  }

  const isExcluded = (projectPath: string): boolean =>
    options.excludedProjectPaths.some((excluded) => projectPath.startsWith(excluded))

  return {
    async collect(window) {
      const task = options.progress.task('Sessions Claude Code')
      const drafts = new Map<string, SessionDraft>()
      const files = await listSessionFiles(window)

      let read = 0
      task.update(`0/${files.length} fichiers`)
      await Promise.all(
        files.map(async (filePath) => {
          await readSessionFile(filePath, window, drafts)
          read += 1
          task.update(`${read}/${files.length} fichiers`)
        }),
      )

      const sessions = [...drafts.values()]
        .filter(
          (draft): draft is SessionDraft & { startedAt: Date; endedAt: Date } =>
            draft.startedAt !== null &&
            draft.endedAt !== null &&
            (draft.prompts.length > 0 || draft.touchedFiles.size > 0 || draft.pullRequests.size > 0),
        )
        .filter((draft) => !isExcluded(draft.projectPath))
        .map(
          (draft): ClaudeSessionActivity => ({
            sessionId: draft.sessionId,
            projectPath: draft.projectPath,
            gitBranch: draft.gitBranch,
            title: draft.title,
            prompts: draft.prompts,
            touchedFiles: [...draft.touchedFiles].slice(0, options.maxFilesPerSession),
            pullRequests: [...draft.pullRequests.values()],
            startedAt: draft.startedAt,
            endedAt: draft.endedAt,
          }),
        )
        .sort((left, right) => left.startedAt.getTime() - right.startedAt.getTime())

      task.done(`${sessions.length} session${sessions.length > 1 ? 's' : ''}`)
      return sessions
    },
  }
}
