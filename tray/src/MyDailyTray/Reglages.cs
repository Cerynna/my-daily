using Microsoft.Win32;

namespace MyDailyTray;

sealed class Reglages
{
    const string CLE = @"Software\MyDaily";

    public TimeSpan HeureGeneration { get; set; } = new(9, 30, 0);
    public TimeSpan HeureAffichage { get; set; } = new(9, 45, 0);
    public TimeSpan HeureFermeture { get; set; } = new(10, 30, 0);
    public string Distribution { get; set; } = "Ubuntu";
    public string CheminProjet { get; set; } = "~/Labo/my-daily";
    public bool ActiverPlanification { get; set; } = true;

    public static Reglages Charger()
    {
        var reglages = new Reglages();
        try
        {
            using var cle = Registry.CurrentUser.OpenSubKey(CLE);
            if (cle is null) return reglages;

            reglages.HeureGeneration = LireHeure(cle, "HeureGeneration", reglages.HeureGeneration);
            reglages.HeureAffichage = LireHeure(cle, "HeureAffichage", reglages.HeureAffichage);
            reglages.HeureFermeture = LireHeure(cle, "HeureFermeture", reglages.HeureFermeture);
            reglages.Distribution = cle.GetValue("Distribution") as string ?? reglages.Distribution;
            reglages.CheminProjet = cle.GetValue("CheminProjet") as string ?? reglages.CheminProjet;
            reglages.ActiverPlanification = cle.GetValue("Planification") is not int actif || actif != 0;
        }
        catch { }
        return reglages;
    }

    public void Sauver()
    {
        try
        {
            using var cle = Registry.CurrentUser.CreateSubKey(CLE);
            cle.SetValue("HeureGeneration", HeureGeneration.ToString(@"hh\:mm"));
            cle.SetValue("HeureAffichage", HeureAffichage.ToString(@"hh\:mm"));
            cle.SetValue("HeureFermeture", HeureFermeture.ToString(@"hh\:mm"));
            cle.SetValue("Distribution", Distribution);
            cle.SetValue("CheminProjet", CheminProjet);
            cle.SetValue("Planification", ActiverPlanification ? 1 : 0);
        }
        catch { }
    }

    static TimeSpan LireHeure(RegistryKey cle, string nom, TimeSpan defaut)
        => cle.GetValue(nom) is string brut && TimeSpan.TryParse(brut, out var heure) ? heure : defaut;
}
