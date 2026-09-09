import type { ProgressReporter, ProgressTask } from '../application/ports.js'

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const FRAME_INTERVAL_MS = 80
const ESCAPE = '\u001b['
const ESCAPE_SEQUENCE = /\u001b\[[0-9;]*m/g

const paint =
  (code: string, reset: string) =>
  (text: string): string =>
    `${ESCAPE}${code}m${text}${ESCAPE}${reset}m`

const asIs = (text: string): string => text

const elapsedSince = (startedAt: number): string => `${((Date.now() - startedAt) / 1000).toFixed(1)}s`

const plain = (text: string): string => text.replace(ESCAPE_SEQUENCE, '')

const silentTask: ProgressTask = {
  update: () => {},
  done: () => {},
  fail: () => {},
}

export const createSilentProgressReporter = (): ProgressReporter => ({
  task: () => silentTask,
  note: () => {},
  stop: () => {},
})

type RunningTask = {
  readonly label: string
  readonly startedAt: number
  detail: string
}

export const createTerminalProgressReporter = (stream: NodeJS.WriteStream): ProgressReporter => {
  const interactive = stream.isTTY === true
  const colored = interactive && process.env['NO_COLOR'] === undefined
  const dim = colored ? paint('2', '22') : asIs
  const green = colored ? paint('32', '39') : asIs
  const yellow = colored ? paint('33', '39') : asIs
  const cyan = colored ? paint('36', '39') : asIs
  const running = new Set<RunningTask>()
  let frame = 0
  let timer: NodeJS.Timeout | null = null
  let spinnerDrawn = false

  const eraseSpinner = (): void => {
    if (!spinnerDrawn) return
    stream.clearLine(0)
    stream.cursorTo(0)
    spinnerDrawn = false
  }

  const drawSpinner = (): void => {
    if (!interactive || running.size === 0) return
    const parts = [...running].map((task) =>
      task.detail === '' ? task.label : `${task.label} ${dim(task.detail)}`,
    )
    const line = `${cyan(FRAMES[frame % FRAMES.length] ?? '')} ${parts.join(dim(' · '))}`
    const width = (stream.columns ?? 80) - 1
    stream.write(plain(line).length > width ? plain(line).slice(0, width) : line)
    spinnerDrawn = true
  }

  const startTicking = (): void => {
    if (!interactive || timer !== null) return
    timer = setInterval(() => {
      frame += 1
      eraseSpinner()
      drawSpinner()
    }, FRAME_INTERVAL_MS)
    timer.unref()
  }

  const stopTicking = (): void => {
    if (timer === null) return
    clearInterval(timer)
    timer = null
  }

  const writeLine = (line: string): void => {
    eraseSpinner()
    stream.write(`${line}\n`)
    drawSpinner()
  }

  return {
    task(label) {
      const task: RunningTask = { label, startedAt: Date.now(), detail: '' }
      running.add(task)
      startTicking()
      if (!interactive) stream.write(`… ${label}\n`)
      drawSpinner()

      const settle = (line: string): void => {
        running.delete(task)
        if (running.size === 0) stopTicking()
        writeLine(line)
        if (running.size === 0) eraseSpinner()
      }

      return {
        update(detail) {
          task.detail = detail
        },
        done(summary) {
          settle(`${green('✓')} ${label} ${dim(`— ${summary} (${elapsedSince(task.startedAt)})`)}`)
        },
        fail(reason) {
          settle(`${yellow('⚠')} ${label} ${dim(`— ${reason}`)}`)
        },
      }
    },
    note(message) {
      writeLine(`${yellow('⚠')} ${dim(message)}`)
    },
    stop() {
      stopTicking()
      eraseSpinner()
    },
  }
}
