using System.Diagnostics;
using System.Text;

namespace MyDailyTray;

sealed record Rapport(DateOnly Jour, string Markdown);

sealed class RapportRunner
{
    static readonly string DossierCache = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "MyDaily");

    readonly Reglages _reglages;

    public RapportRunner(Reglages reglages) => _reglages = reglages;

    public Rapport? LireCache(DateOnly jour)
    {
        var chemin = CheminCache(jour);
        return File.Exists(chemin) ? new Rapport(jour, File.ReadAllText(chemin, Encoding.UTF8)) : null;
    }

    public async Task<Rapport> GenererAsync(DateOnly jour, CancellationToken token)
    {
        var commande = $"cd {_reglages.CheminProjet} && ./bin/my-daily --quiet";

        var demarrage = new ProcessStartInfo("wsl.exe")
        {
            ArgumentList = { "-d", _reglages.Distribution, "--", "bash", "-lc", commande },
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            UseShellExecute = false,
            CreateNoWindow = true,
        };

        using var processus = Process.Start(demarrage)
            ?? throw new InvalidOperationException("Impossible de lancer wsl.exe.");

        var sortie = processus.StandardOutput.ReadToEndAsync(token);
        var erreurs = processus.StandardError.ReadToEndAsync(token);
        await processus.WaitForExitAsync(token);

        var markdown = (await sortie).Trim();

        if (processus.ExitCode != 0 || markdown.Length == 0)
        {
            var detail = (await erreurs).Trim();
            throw new InvalidOperationException(
                detail.Length == 0 ? $"my-daily s'est arrete avec le code {processus.ExitCode}." : detail);
        }

        EcrireCache(jour, markdown);
        return new Rapport(jour, markdown);
    }

    static string CheminCache(DateOnly jour) =>
        Path.Combine(DossierCache, $"{jour:yyyy-MM-dd}.md");

    static void EcrireCache(DateOnly jour, string markdown)
    {
        try
        {
            Directory.CreateDirectory(DossierCache);
            File.WriteAllText(CheminCache(jour), markdown, new UTF8Encoding(false));
        }
        catch { }
    }
}
