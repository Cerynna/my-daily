import { execFile } from 'node:child_process'

import type { DailySummarizer, ProgressReporter } from '../application/ports.js'

export type ClaudeCliOptions = {
  readonly model: string | null
  readonly timeoutMs: number
  readonly progress: ProgressReporter
}

export const createClaudeCliSummarizer = (options: ClaudeCliOptions): DailySummarizer => ({
  summarize(prompt) {
    const args = ['-p', ...(options.model === null ? [] : ['--model', options.model])]
    const task = options.progress.task('Résumé par Claude')

    return new Promise((resolve, reject) => {
      const child = execFile(
        'claude',
        args,
        { timeout: options.timeoutMs, maxBuffer: 16 * 1024 * 1024 },
        (error, stdout, stderr) => {
          if (error !== null) {
            task.fail('échec')
            reject(new Error(`Appel à claude impossible : ${stderr.trim() || error.message}`))
            return
          }
          task.done(`${stdout.trim().split('\n').length} lignes`)
          resolve(stdout.trim())
        },
      )

      child.stdin?.end(prompt)
    })
  },
})
