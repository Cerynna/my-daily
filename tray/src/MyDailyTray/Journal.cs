using System.Text;

namespace MyDailyTray;

static class Journal
{
    static readonly string Fichier = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "MyDaily", "journal.log");

    static readonly object Verrou = new();

    public static string Chemin => Fichier;

    public static void Ecrire(string message)
    {
        try
        {
            lock (Verrou)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(Fichier)!);
                File.AppendAllText(Fichier, $"{DateTime.Now:yyyy-MM-dd HH:mm:ss}  {message}{Environment.NewLine}",
                    new UTF8Encoding(false));
            }
        }
        catch { }
    }
}
