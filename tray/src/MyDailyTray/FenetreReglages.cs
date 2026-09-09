using System.Drawing;
using System.Windows.Forms;

namespace MyDailyTray;

sealed class FenetreReglages : Form
{
    readonly Reglages _reglages;
    readonly TextBox _generation;
    readonly TextBox _affichage;
    readonly TextBox _fermeture;
    readonly TextBox _distribution;
    readonly TextBox _chemin;

    public FenetreReglages(Reglages reglages)
    {
        _reglages = reglages;

        Text = "MyDaily - horaires";
        FormBorderStyle = FormBorderStyle.FixedDialog;
        StartPosition = FormStartPosition.CenterScreen;
        MaximizeBox = false;
        MinimizeBox = false;
        ClientSize = new Size(420, 250);
        Font = new Font("Segoe UI", 9.5f);

        _generation = Champ("Generation", 20, reglages.HeureGeneration.ToString(@"hh\:mm"));
        _affichage = Champ("Affichage", 56, reglages.HeureAffichage.ToString(@"hh\:mm"));
        _fermeture = Champ("Fermeture auto", 92, reglages.HeureFermeture.ToString(@"hh\:mm"));
        _distribution = Champ("Distribution WSL", 128, reglages.Distribution, large: true);
        _chemin = Champ("Dossier du projet", 164, reglages.CheminProjet, large: true);

        var valider = new Button { Text = "Valider", Width = 92, Location = new Point(216, 206) };
        valider.Click += (_, _) => Valider();

        var annuler = new Button { Text = "Annuler", Width = 92, Location = new Point(316, 206), DialogResult = DialogResult.Cancel };

        Controls.Add(valider);
        Controls.Add(annuler);
        AcceptButton = valider;
        CancelButton = annuler;
    }

    TextBox Champ(string libelle, int hauteur, string valeur, bool large = false)
    {
        Controls.Add(new Label
        {
            Text = libelle,
            Location = new Point(20, hauteur + 4),
            Width = 130,
            TextAlign = ContentAlignment.MiddleLeft,
        });

        var champ = new TextBox
        {
            Text = valeur,
            Location = new Point(160, hauteur),
            Width = large ? 240 : 80,
        };
        Controls.Add(champ);
        return champ;
    }

    void Valider()
    {
        if (!TimeSpan.TryParse(_generation.Text, out var generation) ||
            !TimeSpan.TryParse(_affichage.Text, out var affichage) ||
            !TimeSpan.TryParse(_fermeture.Text, out var fermeture))
        {
            MessageBox.Show("Les horaires doivent etre au format HH:mm.", "MyDaily",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        if (generation > affichage || affichage >= fermeture)
        {
            MessageBox.Show("Il faut generation <= affichage < fermeture.", "MyDaily",
                MessageBoxButtons.OK, MessageBoxIcon.Warning);
            return;
        }

        _reglages.HeureGeneration = generation;
        _reglages.HeureAffichage = affichage;
        _reglages.HeureFermeture = fermeture;
        _reglages.Distribution = _distribution.Text.Trim();
        _reglages.CheminProjet = _chemin.Text.Trim();

        DialogResult = DialogResult.OK;
        Close();
    }
}
