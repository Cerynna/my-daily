import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createGenerateDailyBrief } from './application/generate-daily-brief.js'
import { createDailyWindow } from './domain/daily-window.js'
import { buildSummaryPrompt } from './domain/daily-brief.js'
import { createClaudeCliSummarizer } from './infrastructure/claude-cli-summarizer.js'
import { createClaudeSessionStore } from './infrastructure/claude-session-store.js'
import { createGitHubCliActivitySource } from './infrastructure/github-cli-activity-source.js'
import { expandHome, loadConfig, writeInitialConfig } from './infrastructure/config.js'
import {
  createSilentProgressReporter,
  createTerminalProgressReporter,
} from './infrastructure/terminal-progress.js'

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const USAGE = `my-daily — reconstitue ta veille pour le daily

Usage : yarn daily [options]

  --date <YYYY-MM-DD>  Un jour précis
  --days <n>           Les n derniers jours
  --include-today      Inclut aussi aujourd'hui
  --raw                N'appelle pas Claude, affiche les traces brutes
  --prompt             Affiche le prompt qui serait envoyé à Claude
  --json               Sort l'activité collectée en JSON
  --no-github          Ignore GitHub
  --no-sessions        Ignore les sessions Claude Code
  --model <nom>        Modèle utilisé pour le résumé
  --out <fichier>      Écrit la sortie dans un fichier
  --quiet              Sans indicateur de progression
  --init               (Re)génère config.json avec les comptes gh détectés
  --help               Cette aide

Sans option : le dernier jour ouvré (vendredi si on est lundi).`

type Options = {
  readonly date: string | undefined
  readonly days: number | undefined
  readonly includeToday: boolean
  readonly raw: boolean
  readonly promptOnly: boolean
  readonly json: boolean
  readonly github: boolean
  readonly sessions: boolean
  readonly model: string | undefined
  readonly out: string | undefined
  readonly quiet: boolean
  readonly init: boolean
  readonly help: boolean
}

const requireValue = (flag: string, value: string | undefined): string => {
  if (value === undefined) throw new Error(`L'option ${flag} attend une valeur`)
  return value
}

const parseOptions = (argv: readonly string[]): Options => {
  const options = {
    date: undefined as string | undefined,
    days: undefined as number | undefined,
    includeToday: false,
    raw: false,
    promptOnly: false,
    json: false,
    github: true,
    sessions: true,
    model: undefined as string | undefined,
    out: undefined as string | undefined,
    quiet: false,
    init: false,
    help: false,
  }

  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index]
    switch (flag) {
      case '--date':
        options.date = requireValue(flag, argv[++index])
        break
      case '--days':
        options.days = Number(requireValue(flag, argv[++index]))
        break
      case '--model':
        options.model = requireValue(flag, argv[++index])
        break
      case '--out':
        options.out = requireValue(flag, argv[++index])
        break
      case '--include-today':
        options.includeToday = true
        break
      case '--raw':
        options.raw = true
        break
      case '--prompt':
        options.promptOnly = true
        break
      case '--json':
        options.json = true
        break
      case '--no-github':
        options.github = false
        break
      case '--no-sessions':
        options.sessions = false
        break
      case '--quiet':
        options.quiet = true
        break
      case '--init':
        options.init = true
        break
      case '--help':
      case '-h':
        options.help = true
        break
      default:
        throw new Error(`Option inconnue : ${flag}`)
    }
  }

  return options
}

const main = async (): Promise<void> => {
  const options = parseOptions(process.argv.slice(2))

  if (options.help) {
    process.stdout.write(`${USAGE}\n`)
    return
  }

  if (options.init) {
    const created = await writeInitialConfig(PROJECT_ROOT)
    process.stdout.write(
      `config.json écrit. Comptes GitHub détectés : ${created.githubLogins.join(', ') || 'aucun'}\n`,
    )
    return
  }

  const config = await loadConfig(PROJECT_ROOT)
  const window = createDailyWindow({
    reference: new Date(),
    includeToday: options.includeToday,
    ...(options.date === undefined ? {} : { date: options.date }),
    ...(options.days === undefined ? {} : { days: options.days }),
  })

  const progress = options.quiet
    ? createSilentProgressReporter()
    : createTerminalProgressReporter(process.stderr)

  if (options.github && config.githubLogins.length === 0) {
    progress.note('Aucun login GitHub configuré — lance `yarn daily --init`.')
  }

  const brief = await createGenerateDailyBrief({
    claudeSessions: options.sessions
      ? createClaudeSessionStore({
          projectsDirectory: expandHome(config.claudeProjectsDirectory),
          maxPromptLength: config.maxPromptLength,
          maxPromptsPerSession: config.maxPromptsPerSession,
          maxFilesPerSession: config.maxFilesPerSession,
          excludedProjectPaths: config.excludedProjectPaths.map(expandHome),
          progress,
        })
      : null,
    github:
      options.github && config.githubLogins.length > 0
        ? createGitHubCliActivitySource({
            logins: config.githubLogins,
            limit: config.githubResultLimit,
            timeoutMs: 90_000,
            throttleMs: config.githubThrottleMs,
            retries: 2,
            progress,
          })
        : null,
    summarizer: createClaudeCliSummarizer({
      model: options.model ?? config.model,
      timeoutMs: 300_000,
      progress,
    }),
  })({ window, summarize: !options.raw && !options.json && !options.promptOnly })

  const output = options.json
    ? JSON.stringify(brief.activity, null, 2)
    : options.promptOnly
      ? buildSummaryPrompt(brief.activity)
      : (brief.summary ?? brief.raw)

  progress.stop()

  if (options.out === undefined) {
    process.stdout.write(`${output}\n`)
    return
  }

  await writeFile(expandHome(options.out), `${output}\n`, 'utf8')
  process.stdout.write(`Écrit dans ${options.out}\n`)
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
