#!/usr/bin/env bash
set -euo pipefail

# dotnet.exe compile mal depuis un chemin UNC \\wsl.localhost : on passe par un
# dossier Windows natif, puis on rapatrie l'exe.
DOTNET='/mnt/c/Program Files/dotnet/dotnet.exe'
RACINE="$(cd "$(dirname "$0")" && pwd)"
UTILISATEUR="$(cmd.exe /c 'echo %USERNAME%' 2>/dev/null | tr -d '\r\n')"
ATELIER_WIN="C:\\Users\\${UTILISATEUR}\\AppData\\Local\\Temp\\mydaily-build"
ATELIER="/mnt/c/Users/${UTILISATEUR}/AppData/Local/Temp/mydaily-build"
INSTALLATION="/mnt/c/Users/${UTILISATEUR}/AppData/Local/Programs/MyDaily"

[ -x "$DOTNET" ] || { echo "dotnet.exe introuvable cote Windows." >&2; exit 1; }

# Une instance lancee depuis l'atelier verrouille l'exe et bloque le nettoyage.
if [ -f "$ATELIER/publish/MyDaily.exe" ]; then
  taskkill.exe /IM MyDaily.exe /F >/dev/null 2>&1 || true
  sleep 1
fi

rm -rf "$ATELIER"
mkdir -p "$ATELIER"
cp -r "$RACINE/src/MyDailyTray/." "$ATELIER/"

"$DOTNET" publish "${ATELIER_WIN}\\MyDailyTray.csproj" -c Release -o "${ATELIER_WIN}\\publish" | tail -3

mkdir -p "$RACINE/dist"
cp "$ATELIER/publish/MyDaily.exe" "$RACINE/dist/MyDaily.exe"
echo "→ $RACINE/dist/MyDaily.exe"

if [ "${1:-}" = "--install" ]; then
  taskkill.exe /IM MyDaily.exe /F >/dev/null 2>&1 || true
  sleep 1
  mkdir -p "$INSTALLATION"
  cp "$RACINE/dist/MyDaily.exe" "$INSTALLATION/MyDaily.exe"
  echo "→ installe dans $INSTALLATION"
  cmd.exe /c start "" "$(wslpath -w "$INSTALLATION/MyDaily.exe")" >/dev/null 2>&1
  echo "→ lance : icone visible dans la barre des taches"
fi
