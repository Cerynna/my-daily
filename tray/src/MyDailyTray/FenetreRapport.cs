using System.Drawing;
using System.Windows.Forms;

namespace MyDailyTray;

sealed class FenetreRapport : Form
{
    static readonly Color Fond = Color.FromArgb(22, 24, 29);
    static readonly Color FondBarre = Color.FromArgb(30, 33, 40);
    static readonly Color TexteDiscret = Color.FromArgb(150, 156, 168);

    readonly RichTextBox _contenu;
    readonly Label _compteARebours;
    readonly System.Windows.Forms.Timer _horloge;
    readonly DateTime? _fermetureAutomatique;

    public FenetreRapport(Rapport rapport, DateTime? fermetureAutomatique)
    {
        _fermetureAutomatique = fermetureAutomatique;

        Text = $"Daily du {rapport.Jour:dddd d MMMM}";
        StartPosition = FormStartPosition.CenterScreen;
        Size = new Size(960, 720);
        MinimumSize = new Size(520, 360);
        BackColor = Fond;
        KeyPreview = true;

        _contenu = new RichTextBox
        {
            Dock = DockStyle.Fill,
            BorderStyle = BorderStyle.None,
            BackColor = Fond,
            ReadOnly = true,
            DetectUrls = true,
            ScrollBars = RichTextBoxScrollBars.Vertical,
            Margin = new Padding(0),
        };
        _contenu.LinkClicked += (_, evenement) => Ouvrir(evenement.LinkText);

        var marge = new Panel { Dock = DockStyle.Fill, Padding = new Padding(28, 20, 20, 12), BackColor = Fond };
        marge.Controls.Add(_contenu);

        _compteARebours = new Label
        {
            AutoSize = true,
            ForeColor = TexteDiscret,
            Font = new Font("Segoe UI", 9f),
            Location = new Point(16, 14),
        };

        var copier = BoutonPlat("Copier", 2);
        copier.Click += (_, _) => Copier(rapport.Markdown);

        var fermer = BoutonPlat("Fermer", 1);
        fermer.Click += (_, _) => Close();

        var barre = new Panel { Dock = DockStyle.Bottom, Height = 48, BackColor = FondBarre };
        barre.Controls.Add(_compteARebours);
        barre.Controls.Add(copier);
        barre.Controls.Add(fermer);
        barre.Resize += (_, _) => PositionnerBoutons(barre, copier, fermer);

        Controls.Add(marge);
        Controls.Add(barre);
        PositionnerBoutons(barre, copier, fermer);

        RenduMarkdown.Appliquer(_contenu, rapport.Markdown);

        _horloge = new System.Windows.Forms.Timer { Interval = 1000 };
        _horloge.Tick += (_, _) => RafraichirCompteARebours();
        if (_fermetureAutomatique is not null) _horloge.Start();
        RafraichirCompteARebours();

        KeyDown += (_, evenement) =>
        {
            if (evenement.KeyCode == Keys.Escape) Close();
        };
    }

    public void MettreAuPremierPlan()
    {
        Show();
        WindowState = FormWindowState.Normal;
        TopMost = true;
        Activate();
        TopMost = false;
    }

    static Button BoutonPlat(string libelle, int rang) => new()
    {
        Text = libelle,
        Width = 96,
        Height = 30,
        FlatStyle = FlatStyle.Flat,
        BackColor = Color.FromArgb(46, 51, 62),
        ForeColor = Color.FromArgb(228, 230, 235),
        Font = new Font("Segoe UI", 9f),
        Tag = rang,
        TabStop = false,
    };

    static void PositionnerBoutons(Panel barre, params Button[] boutons)
    {
        foreach (var bouton in boutons)
        {
            var rang = (int)(bouton.Tag ?? 1);
            bouton.Location = new Point(barre.Width - rang * (bouton.Width + 12), 9);
        }
    }

    void RafraichirCompteARebours()
    {
        if (_fermetureAutomatique is null)
        {
            _compteARebours.Text = "Echap ou Fermer pour quitter";
            return;
        }

        var restant = _fermetureAutomatique.Value - DateTime.Now;
        if (restant <= TimeSpan.Zero)
        {
            _horloge.Stop();
            Close();
            return;
        }

        _compteARebours.Text = $"Se ferme dans {restant:hh\\:mm\\:ss}";
    }

    void Copier(string markdown)
    {
        try
        {
            Clipboard.SetText(markdown);
            _compteARebours.Text = "Rapport copie dans le presse-papiers";
        }
        catch { }
    }

    static void Ouvrir(string? lien)
    {
        if (string.IsNullOrWhiteSpace(lien)) return;
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(lien) { UseShellExecute = true });
        }
        catch { }
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) _horloge.Dispose();
        base.Dispose(disposing);
    }
}
