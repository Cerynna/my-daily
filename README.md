# my-daily

Reconstitue ce que tu as fait la veille — sessions Claude Code + activité GitHub — et
te le rend prêt à lire au daily.

## Installation

```sh
yarn install
yarn daily --init   # détecte tes comptes gh et écrit config.json
```

Prérequis : `gh` authentifié (`gh auth status`) et le CLI `claude` dans le `PATH`.

Alias pratique :

```sh
echo "alias daily='~/Labo/my-daily/bin/my-daily'" >> ~/.zshrc
```

## Usage

```sh
yarn daily                    # dernier jour ouvré (vendredi si on est lundi)
yarn daily --date 2026-09-08  # un jour précis
yarn daily --days 7           # la semaine
yarn daily --raw              # les traces brutes, sans passer par Claude
yarn daily --prompt           # le prompt qui serait envoyé à Claude
yarn daily --json             # l'activité collectée, en JSON
yarn daily --out ~/daily.md   # dans un fichier
```

`--no-github` / `--no-sessions` coupent une source, `--model` change le modèle du résumé,
`--quiet` supprime l'indicateur de progression.

La progression s'affiche sur **stderr** — `yarn daily > daily.md` garde donc un fichier
propre. Hors terminal interactif, elle se réduit à une ligne par étape, sans couleur
(`NO_COLOR` est respecté).

```
✓ Sessions Claude Code — 11 sessions (0.1s)
✓ GitHub — 5 commits · 14 PR · 4 issues (14.7s)
✓ Résumé par Claude — 20 lignes (16.4s)
```

## D'où viennent les données

**Sessions Claude Code** (`~/.claude/projects/*/*.jsonl`) : tes prompts, le titre généré
de la session, les fichiers écrits ou édités, les PR ouvertes depuis la session.
Les messages système, retours d'outils et notifications sont écartés.

**GitHub** (via `gh search`) : commits, PR écrites et relues, issues ouvertes et
commentées, pour chaque login de `githubLogins`.

> La recherche GitHub voit les dépôts privés du **compte `gh` actif**. Avec plusieurs
> comptes, `gh auth switch --user <login>` avant de lancer le daily.

## Configuration

`config.json` (git-ignoré, voir `config.example.json`) :

| Clé | Rôle |
| --- | --- |
| `githubLogins` | Logins dont on cherche l'activité |
| `claudeProjectsDirectory` | Où sont les sessions Claude Code |
| `model` | Modèle du résumé (`null` = celui par défaut du CLI) |
| `maxPromptLength` / `maxPromptsPerSession` | Troncature des prompts collectés |
| `maxFilesPerSession` | Nombre de fichiers listés par session |
| `githubResultLimit` | Taille max d'une page de résultats `gh search` |
| `githubThrottleMs` | Délai entre deux appels `gh` (secondary rate limit) |
| `excludedProjectPaths` | Dossiers à ignorer (préfixes, `~` accepté) |

## L'app systray (Windows)

`tray/` contient une petite app .NET qui vit dans la barre des taches et pilote le
rapport toute seule :

| Heure | Ce qui se passe |
| --- | --- |
| 09:30 | Generation en tache de fond (aucune fenetre), pastille orange puis verte |
| 09:45 | La fenetre du rapport s'ouvre au premier plan |
| 10:30 | Elle se ferme seule si elle est encore ouverte |

Le compte a rebours est affiche en bas de la fenetre ; `Echap` ou **Fermer** ferme plus
tot, **Copier** met le markdown dans le presse-papiers.

```sh
cd tray && ./build.sh --install   # compile, installe dans %LOCALAPPDATA%\Programs\MyDaily, lance
cd tray && ./build.sh             # compile seulement, dans tray/dist/
```

Si la generation echoue (WSL pas encore demarre, reseau coupe), l'app retente toute
seule 5 minutes plus tard.

Le menu de l'icone : voir le rapport, regenerer, activer/couper la planification,
changer les horaires, demarrer avec Windows, ouvrir le journal, quitter.
Le journal (`%LOCALAPPDATA%\MyDaily\journal.log`) trace les demarrages et les
declenchements — c'est par la qu'on regarde quand un matin ne s'est pas passe comme
prevu. Les reglages vivent dans
`HKCU\Software\MyDaily`, le rapport du jour est mis en cache dans
`%LOCALAPPDATA%\MyDaily\AAAA-MM-JJ.md` — reouvrir la fenetre ne relance pas la collecte.

Si le PC dort a 9h30, rien n'est perdu : au reveil, l'app rattrape le cycle tant que
l'heure de fermeture n'est pas passee.

## Structure

```
src/                       CLI TypeScript
  domain/                  fenêtre temporelle, modèle d'activité, construction du brief
  application/             ports + use case generate-daily-brief
  infrastructure/          lecture des .jsonl, gh CLI, claude CLI, progression, config
tray/src/MyDailyTray/      app systray .NET 8 (WinForms)
  MyDailyApp.cs            icône, menu, planification 9h30/9h45/10h30
  RapportRunner.cs         appelle bin/my-daily via wsl.exe, met en cache
  FenetreRapport.cs        fenêtre + compte à rebours + auto-fermeture
  RenduMarkdown.cs         markdown → RichTextBox
  Journal.cs               trace des declenchements
```

L'app systray n'est qu'un adapter de plus : elle appelle `bin/my-daily` en ligne de
commande et ne connaît rien du domaine.

Le domaine ne connaît ni le système de fichiers, ni `gh`, ni `claude` : brancher une
autre source (Jira, Slack, GitLab) revient à écrire un adapter et à l'injecter dans
`createGenerateDailyBrief`.
