const MILLISECONDS_PER_DAY = 24 * 60 * 60 * 1000

export type DailyWindow = {
  readonly from: Date
  readonly to: Date
  readonly label: string
}

export type DailyWindowRequest = {
  readonly reference: Date
  readonly date?: string
  readonly days?: number
  readonly includeToday?: boolean
}

const startOfDay = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate())

const addDays = (date: Date, amount: number): Date =>
  new Date(date.getTime() + amount * MILLISECONDS_PER_DAY)

const isWeekend = (date: Date): boolean => date.getDay() === 0 || date.getDay() === 6

const parseIsoDay = (value: string): Date => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value)
  if (!match) throw new Error(`Date invalide : "${value}" (attendu YYYY-MM-DD)`)
  const [, year, month, day] = match
  return new Date(Number(year), Number(month) - 1, Number(day))
}

const previousWorkingDay = (reference: Date): Date => {
  let candidate = addDays(startOfDay(reference), -1)
  while (isWeekend(candidate)) candidate = addDays(candidate, -1)
  return candidate
}

export const formatDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

const describe = (from: Date, to: Date): string => {
  const lastCoveredDay = addDays(to, -1)
  return formatDay(from) === formatDay(lastCoveredDay)
    ? formatDay(from)
    : `${formatDay(from)} → ${formatDay(lastCoveredDay)}`
}

export const createDailyWindow = (request: DailyWindowRequest): DailyWindow => {
  const today = startOfDay(request.reference)
  const upperBound = request.includeToday === true ? addDays(today, 1) : today

  if (request.date !== undefined) {
    const day = parseIsoDay(request.date)
    return { from: day, to: addDays(day, 1), label: describe(day, addDays(day, 1)) }
  }

  if (request.days !== undefined) {
    if (!Number.isInteger(request.days) || request.days < 1) {
      throw new Error(`Nombre de jours invalide : "${request.days}"`)
    }
    const from = addDays(upperBound, -request.days)
    return { from, to: upperBound, label: describe(from, upperBound) }
  }

  const from = previousWorkingDay(request.reference)
  const to = from >= upperBound ? addDays(from, 1) : upperBound
  return { from, to, label: describe(from, to) }
}

export const contains = (window: DailyWindow, moment: Date): boolean =>
  moment >= window.from && moment < window.to

export const searchRange = (window: DailyWindow): string =>
  `${formatDay(window.from)}..${formatDay(addDays(window.to, -1))}`
