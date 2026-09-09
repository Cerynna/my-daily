import {
  isEmpty,
  projectName,
  type ClaudeSessionActivity,
  type DailyActivity,
  type GitHubActivity,
} from './activity.js'

const asTime = (moment: Date): string =>
  `${String(moment.getHours()).padStart(2, '0')}:${String(moment.getMinutes()).padStart(2, '0')}`

const bullet = (line: string): string => `- ${line}`

const renderSession = (session: ClaudeSessionActivity): string => {
  const header = [
    `### ${session.title ?? projectName(session.projectPath)}`,
    `dossier : ${session.projectPath}`,
    session.gitBranch === null ? null : `branche : ${session.gitBranch}`,
    `plage : ${asTime(session.startedAt)} → ${asTime(session.endedAt)}`,
  ]
    .filter((line): line is string => line !== null)
    .join('\n')

  const sections = [
    header,
    session.prompts.length === 0
      ? null
      : ['demandes :', ...session.prompts.map((prompt) => bullet(`${asTime(prompt.at)} — ${prompt.text}`))].join('\n'),
    session.touchedFiles.length === 0
      ? null
      : ['fichiers modifiés :', ...session.touchedFiles.map(bullet)].join('\n'),
    session.pullRequests.length === 0
      ? null
      : [
          'pull requests liées :',
          ...session.pullRequests.map((pr) => bullet(`${pr.repository}#${pr.number} — ${pr.url}`)),
        ].join('\n'),
  ]

  return sections.filter((section): section is string => section !== null).join('\n\n')
}

const renderGitHub = (account: GitHubActivity): string => {
  const sections = [
    `### GitHub — ${account.login}`,
    account.commits.length === 0
      ? null
      : [
          'commits :',
          ...account.commits.map((commit) => bullet(`${commit.repository} — ${commit.title}`)),
        ].join('\n'),
    account.pullRequests.length === 0
      ? null
      : [
          'pull requests :',
          ...account.pullRequests.map((pr) =>
            bullet(`[${pr.role === 'author' ? 'auteur' : 'relecteur'}] ${pr.repository}#${pr.number} (${pr.state}) — ${pr.title}`),
          ),
        ].join('\n'),
    account.issues.length === 0
      ? null
      : [
          'issues :',
          ...account.issues.map((issue) =>
            bullet(`[${issue.role === 'author' ? 'auteur' : 'commentaire'}] ${issue.repository}#${issue.number} (${issue.state}) — ${issue.title}`),
          ),
        ].join('\n'),
  ]

  return sections.filter((section): section is string => section !== null).join('\n\n')
}

export const renderActivity = (activity: DailyActivity): string => {
  if (isEmpty(activity)) return `# Activité du ${activity.window.label}\n\nAucune activité trouvée.`

  const blocks = [
    `# Activité du ${activity.window.label}`,
    activity.sessions.length === 0
      ? null
      : ['## Sessions Claude Code', ...activity.sessions.map(renderSession)].join('\n\n'),
    activity.github.length === 0
      ? null
      : ['## Activité GitHub', ...activity.github.map(renderGitHub)].join('\n\n'),
  ]

  return blocks.filter((block): block is string => block !== null).join('\n\n')
}

export const buildSummaryPrompt = (activity: DailyActivity): string =>
  [
    "Tu prépares le point quotidien (daily stand-up) d'un développeur.",
    `Voici les traces brutes de son activité du ${activity.window.label} : sessions Claude Code (ses demandes, les fichiers touchés) et activité GitHub.`,
    '',
    'Consignes :',
    "- Réponds en français, à la première personne (\"j'ai\"), prêt à être lu à l'oral.",
    '- Regroupe par projet / sujet, pas par outil ni par ordre chronologique brut.',
    "- Décris le résultat métier obtenu, pas la mécanique (\"j'ai corrigé le tri des colonnes de date\", pas \"j'ai édité 3 fichiers\").",
    '- Ignore le bruit : essais avortés, questions de navigation, commandes utilitaires.',
    '- Fusionne les doublons entre sessions Claude et GitHub : une même PR ne doit apparaître qu\'une fois.',
    '',
    'Format de sortie exact :',
    '## Hier',
    "- une puce par sujet, avec le numéro de PR/issue entre parenthèses quand il existe",
    '## En cours',
    '- ce qui est visiblement inachevé (PR ouverte, travail interrompu) ; omets la section si rien',
    '## Points de blocage',
    "- uniquement s'il y a une trace explicite de blocage ; sinon omets la section",
    '',
    "N'invente rien : si une trace est ambiguë, reste factuel ou ignore-la.",
    '',
    '---',
    '',
    renderActivity(activity),
  ].join('\n')
