import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)

export type Config = {
  readonly githubLogins: readonly string[]
  readonly claudeProjectsDirectory: string
  readonly model: string | null
  readonly maxPromptLength: number
  readonly maxPromptsPerSession: number
  readonly maxFilesPerSession: number
  readonly githubResultLimit: number
  readonly githubThrottleMs: number
  readonly excludedProjectPaths: readonly string[]
}

const DEFAULTS: Config = {
  githubLogins: [],
  claudeProjectsDirectory: '~/.claude/projects',
  model: null,
  maxPromptLength: 400,
  maxPromptsPerSession: 15,
  maxFilesPerSession: 25,
  githubResultLimit: 60,
  githubThrottleMs: 1500,
  excludedProjectPaths: [],
}

export const expandHome = (path: string): string =>
  path.startsWith('~/') ? join(homedir(), path.slice(2)) : isAbsolute(path) ? path : resolve(path)

export const configPath = (projectRoot: string): string => join(projectRoot, 'config.json')

export const loadConfig = async (projectRoot: string): Promise<Config> => {
  try {
    const raw = await readFile(configPath(projectRoot), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULTS
    return { ...DEFAULTS, ...(parsed as Partial<Config>) }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return DEFAULTS
    throw error
  }
}

export const detectGitHubLogins = async (): Promise<readonly string[]> => {
  try {
    const { stdout } = await run('gh', ['auth', 'status'], { timeout: 15_000 })
    return [...stdout.matchAll(/Logged in to \S+ account (\S+)/g)].flatMap((match) =>
      match[1] === undefined ? [] : [match[1]],
    )
  } catch {
    return []
  }
}

export const writeInitialConfig = async (projectRoot: string): Promise<Config> => {
  const config: Config = { ...DEFAULTS, githubLogins: await detectGitHubLogins() }
  await writeFile(configPath(projectRoot), `${JSON.stringify(config, null, 2)}\n`, 'utf8')
  return config
}
