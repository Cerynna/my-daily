using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Windows.Forms;
using Microsoft.Win32;

namespace MyDailyTray;

enum Etat { Repos, Generation, Pret, Erreur }

sealed class MyDailyApp : ApplicationContext
{
    const string CLE_DEMARRAGE = @"Software\Microsoft\Windows\CurrentVersion\Run";
    const string NOM_DEMARRAGE = "MyDaily";

    readonly NotifyIcon _tray;
    readonly System.Windows.Forms.Timer _planificateur;
    readonly ToolStripMenuItem _itemVoir;
    readonly ToolStripMenuItem _itemPlanification;
    readonly ToolStripMenuItem _itemDemarrage;
    readonly Reglages _reglages = Reglages.Charger();
    readonly RapportRunner _runner;

    Etat _etat = Etat.Repos;
    bool _tracer = true;
    Rapport? _rapport;
    DateOnly? _jourGenere;
    DateOnly? _jourAffiche;
    DateTime? _prochainEssai;
    FenetreRapport? _fenetre;

    public MyDailyApp()
    {
        _runner = new RapportRunner(_reglages);

        _itemVoir = new ToolStripMenuItem("Voir le rapport", null, (_, _) => VoirRapport())
        {
            Font = new Font(SystemFonts.MenuFont!, FontStyle.Bold),
        };
        _itemPlanification = new ToolStripMenuItem("Planification active", null, (_, _) => BasculerPlanification())
        {
            Checked = _reglages.ActiverPlanification,
        };
        _itemDemarrage = new ToolStripMenuItem("Demarrer avec Windows", null, (_, _) => BasculerDemarrage())
        {
            Checked = DemarrageActif(),
        };

        var menu = new ContextMenuStrip();
        menu.Items.Add(_itemVoir);
        menu.Items.Add(new ToolStripMenuItem("Regenerer maintenant", null, (_, _) => Regenerer()));
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(_itemPlanification);
        menu.Items.Add(new ToolStripMenuItem("Horaires...", null, (_, _) => ModifierHoraires()));
        menu.Items.Add(_itemDemarrage);
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add(new ToolStripMenuItem("Ouvrir le journal", null, (_, _) => OuvrirJournal()));
        menu.Items.Add(new ToolStripMenuItem("Quitter", null, (_, _) => Quitter()));

        _tray = new NotifyIcon
        {
            Icon = CreerIcone(_etat),
            ContextMenuStrip = menu,
            Visible = true,
        };
        _tray.DoubleClick += (_, _) => VoirRapport();
        _tray.BalloonTipClicked += (_, _) => VoirRapport();

        _planificateur = new System.Windows.Forms.Timer { Interval = 5_000 };
        _planificateur.Tick += (_, _) => VerifierPlanification();
        _planificateur.Start();

        ChargerCache();
        MettreAJourAffichage();
    }

    void ChargerCache()
    {
        var jour = DateOnly.FromDateTime(DateTime.Now);
        var cache = _runner.LireCache(jour);
        if (cache is null)
        {
            Journal.Ecrire($"cache absent pour {jour:yyyy-MM-dd}");
            return;
        }

        _rapport = cache;
        _jourGenere = jour;
        _etat = Etat.Pret;
        Journal.Ecrire($"cache charge pour {jour:yyyy-MM-dd} ({cache.Markdown.Length} caracteres)");
    }

    void VerifierPlanification()
    {
        if (!_reglages.ActiverPlanification || _etat == Etat.Generation) return;

        var maintenant = DateTime.Now;
        var jour = DateOnly.FromDateTime(maintenant);
        var heure = maintenant.TimeOfDay;

        if (_tracer)
        {
            _tracer = false;
            Journal.Ecrire($"premier tick : heure={heure:hh\\:mm\\:ss} generation={_reglages.HeureGeneration:hh\\:mm} " +
                           $"affichage={_reglages.HeureAffichage:hh\\:mm} fermeture={_reglages.HeureFermeture:hh\\:mm} " +
                           $"rapport={(_rapport is null ? "absent" : _rapport.Jour.ToString("yyyy-MM-dd"))} " +
                           $"jourAffiche={(_jourAffiche is null ? "aucun" : _jourAffiche.ToString())}");
        }

        if (heure < _reglages.HeureGeneration || heure >= _reglages.HeureFermeture) return;

        if (_rapport?.Jour != jour && _jourGenere != jour)
        {
            if (_prochainEssai is not null && maintenant < _prochainEssai) return;
            _ = GenererAsync(jour, afficherEnsuite: heure >= _reglages.HeureAffichage);
            return;
        }

        if (heure >= _reglages.HeureAffichage && _jourAffiche != jour && _rapport?.Jour == jour)
        {
            Journal.Ecrire("declenchement de l'affichage planifie");
            Afficher(_rapport);
        }
    }

    async Task GenererAsync(DateOnly jour, bool afficherEnsuite)
    {
        _etat = Etat.Generation;
        MettreAJourAffichage();

        try
        {
            _rapport = await _runner.GenererAsync(jour, CancellationToken.None);
            _etat = Etat.Pret;
            _jourGenere = jour;
            _prochainEssai = null;

            if (afficherEnsuite) Afficher(_rapport);
            else Notifier("Rapport du jour pret", "Clique pour l'ouvrir maintenant.");
        }
        catch (Exception exception)
        {
            _etat = Etat.Erreur;
            _prochainEssai = DateTime.Now.AddMinutes(5);
            Notifier("Generation impossible", $"Nouvel essai dans 5 minutes. {exception.Message}");
        }
        finally
        {
            MettreAJourAffichage();
        }
    }

    void Afficher(Rapport rapport)
    {
        _jourAffiche = rapport.Jour;
        Journal.Ecrire("ouverture de la fenetre");

        if (_fenetre is { IsDisposed: false })
        {
            _fenetre.MettreAuPremierPlan();
            return;
        }

        var fermeture = DateTime.Today.Add(_reglages.HeureFermeture);
        _fenetre = new FenetreRapport(rapport, fermeture > DateTime.Now ? fermeture : null);
        _fenetre.FormClosed += (_, _) => _fenetre = null;
        _fenetre.MettreAuPremierPlan();
    }

    void VoirRapport()
    {
        if (_etat == Etat.Generation) return;

        var jour = DateOnly.FromDateTime(DateTime.Now);
        if (_rapport is null || _rapport.Jour != jour)
        {
            _ = GenererAsync(jour, afficherEnsuite: true);
            return;
        }

        Afficher(_rapport);
    }

    void Regenerer()
    {
        if (_etat == Etat.Generation) return;
        _ = GenererAsync(DateOnly.FromDateTime(DateTime.Now), afficherEnsuite: true);
    }

    void BasculerPlanification()
    {
        _reglages.ActiverPlanification = !_reglages.ActiverPlanification;
        _reglages.Sauver();
        MettreAJourAffichage();
    }

    void ModifierHoraires()
    {
        using var fenetre = new FenetreReglages(_reglages);
        if (fenetre.ShowDialog() != DialogResult.OK) return;

        _reglages.Sauver();
        _prochainEssai = null;
        if (_reglages.HeureAffichage > DateTime.Now.TimeOfDay) _jourAffiche = null;
        MettreAJourAffichage();
    }

    static bool DemarrageActif()
    {
        try
        {
            using var cle = Registry.CurrentUser.OpenSubKey(CLE_DEMARRAGE);
            return cle?.GetValue(NOM_DEMARRAGE) is not null;
        }
        catch { return false; }
    }

    void BasculerDemarrage()
    {
        try
        {
            using var cle = Registry.CurrentUser.OpenSubKey(CLE_DEMARRAGE, writable: true)
                            ?? Registry.CurrentUser.CreateSubKey(CLE_DEMARRAGE);

            if (DemarrageActif()) cle.DeleteValue(NOM_DEMARRAGE, throwOnMissingValue: false);
            else cle.SetValue(NOM_DEMARRAGE, $"\"{Environment.ProcessPath}\"");
        }
        catch { }

        _itemDemarrage.Checked = DemarrageActif();
    }

    static void OuvrirJournal()
    {
        try
        {
            Process.Start(new ProcessStartInfo(Journal.Chemin) { UseShellExecute = true });
        }
        catch { }
    }

    void Notifier(string titre, string message)
    {
        _tray.BalloonTipTitle = titre;
        _tray.BalloonTipText = message.Length > 200 ? message[..200] : message;
        _tray.ShowBalloonTip(4000);
    }

    void MettreAJourAffichage()
    {
        _itemPlanification.Checked = _reglages.ActiverPlanification;
        _itemVoir.Text = _etat == Etat.Generation ? "Generation en cours..." : "Voir le rapport";
        _itemVoir.Enabled = _etat != Etat.Generation;

        _tray.Text = _etat switch
        {
            Etat.Generation => "MyDaily - generation en cours",
            Etat.Pret => $"MyDaily - rapport pret ({_reglages.HeureAffichage:hh\\:mm})",
            Etat.Erreur => $"MyDaily - echec, nouvel essai a {_prochainEssai:HH\\:mm}",
            _ => $"MyDaily - prochain rapport a {_reglages.HeureGeneration:hh\\:mm}",
        };
        if (_tray.Text.Length > 63) _tray.Text = _tray.Text[..63];

        var ancienne = _tray.Icon;
        _tray.Icon = CreerIcone(_etat);
        ancienne?.Dispose();
    }

    static Icon CreerIcone(Etat etat)
    {
        const int S = 32;
        using var bmp = new Bitmap(S, S);
        using (var g = Graphics.FromImage(bmp))
        {
            g.SmoothingMode = SmoothingMode.AntiAlias;
            g.Clear(Color.Transparent);

            float marge = 2f, rayon = (S - 2 * marge) * 0.30f;
            var tuile = new RectangleF(marge, marge, S - 2 * marge, S - 2 * marge);
            using (var chemin = TuileArrondie(tuile, rayon))
            using (var fond = new SolidBrush(Color.FromArgb(38, 62, 112)))
                g.FillPath(fond, chemin);

            using (var trait = new Pen(Color.White, 2.4f) { StartCap = LineCap.Round, EndCap = LineCap.Round })
            {
                g.DrawLine(trait, 9f, 11f, 23f, 11f);
                g.DrawLine(trait, 9f, 16f, 23f, 16f);
                g.DrawLine(trait, 9f, 21f, 17f, 21f);
            }

            var pastille = etat switch
            {
                Etat.Generation => Color.FromArgb(232, 160, 48),
                Etat.Pret => Color.FromArgb(46, 180, 92),
                Etat.Erreur => Color.FromArgb(214, 68, 68),
                _ => Color.FromArgb(130, 138, 152),
            };
            using var brosse = new SolidBrush(pastille);
            using var bordure = new Pen(Color.FromArgb(22, 24, 29), 2f);
            g.FillEllipse(brosse, S - 13f, S - 13f, 10f, 10f);
            g.DrawEllipse(bordure, S - 13f, S - 13f, 10f, 10f);
        }
        return Icon.FromHandle(bmp.GetHicon());
    }

    static GraphicsPath TuileArrondie(RectangleF rectangle, float rayon)
    {
        float diametre = rayon * 2f;
        var chemin = new GraphicsPath();
        chemin.AddArc(rectangle.Left, rectangle.Top, diametre, diametre, 180, 90);
        chemin.AddArc(rectangle.Right - diametre, rectangle.Top, diametre, diametre, 270, 90);
        chemin.AddArc(rectangle.Right - diametre, rectangle.Bottom - diametre, diametre, diametre, 0, 90);
        chemin.AddArc(rectangle.Left, rectangle.Bottom - diametre, diametre, diametre, 90, 90);
        chemin.CloseFigure();
        return chemin;
    }

    void Quitter()
    {
        _planificateur.Stop();
        _fenetre?.Close();
        _tray.Visible = false;
        Application.Exit();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            _planificateur.Dispose();
            _tray.Icon?.Dispose();
            _tray.Dispose();
        }
        base.Dispose(disposing);
    }
}
