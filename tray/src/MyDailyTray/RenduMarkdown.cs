using System.Drawing;
using System.Windows.Forms;

namespace MyDailyTray;

static class RenduMarkdown
{
    static readonly Color Texte = Color.FromArgb(228, 230, 235);
    static readonly Color Titre = Color.FromArgb(255, 255, 255);
    static readonly Color Accent = Color.FromArgb(126, 178, 255);
    static readonly Color Code = Color.FromArgb(255, 196, 128);
    static readonly Color Puce = Color.FromArgb(126, 178, 255);

    static readonly Font Normal = new("Segoe UI", 10.5f);
    static readonly Font Gras = new("Segoe UI", 10.5f, FontStyle.Bold);
    static readonly Font Titre1 = new("Segoe UI Semibold", 16f, FontStyle.Bold);
    static readonly Font Titre2 = new("Segoe UI Semibold", 13f, FontStyle.Bold);
    static readonly Font Titre3 = new("Segoe UI Semibold", 11f, FontStyle.Bold);
    static readonly Font Mono = new("Cascadia Mono", 9.5f);

    public static void Appliquer(RichTextBox zone, string markdown)
    {
        zone.Clear();

        foreach (var ligne in markdown.Replace("\r\n", "\n").Split('\n'))
        {
            if (ligne.Trim().Length == 0)
            {
                Ecrire(zone, "\n", Normal, Texte);
                continue;
            }

            if (ligne.StartsWith("### "))
            {
                Ecrire(zone, ligne[4..] + "\n", Titre3, Titre);
            }
            else if (ligne.StartsWith("## "))
            {
                Ecrire(zone, "\n" + ligne[3..] + "\n", Titre2, Accent);
            }
            else if (ligne.StartsWith("# "))
            {
                Ecrire(zone, ligne[2..] + "\n", Titre1, Titre);
            }
            else if (ligne.StartsWith("- ") || ligne.StartsWith("* "))
            {
                Ecrire(zone, "  •  ", Gras, Puce);
                EcrireInline(zone, ligne[2..] + "\n", Normal, Gras, Mono);
            }
            else
            {
                EcrireInline(zone, ligne + "\n", Normal, Gras, Mono);
            }
        }

        zone.SelectionStart = 0;
        zone.ScrollToCaret();
    }

    static void EcrireInline(RichTextBox zone, string ligne, Font normal, Font gras, Font mono)
    {
        var position = 0;

        while (position < ligne.Length)
        {
            var debutGras = ligne.IndexOf("**", position, StringComparison.Ordinal);
            var debutCode = ligne.IndexOf('`', position);

            var prochain = Plus(debutGras, debutCode);
            if (prochain < 0)
            {
                Ecrire(zone, ligne[position..], Normal, Texte);
                return;
            }

            if (prochain > position) Ecrire(zone, ligne[position..prochain], Normal, Texte);

            if (prochain == debutGras)
            {
                var fin = ligne.IndexOf("**", prochain + 2, StringComparison.Ordinal);
                if (fin < 0)
                {
                    Ecrire(zone, ligne[prochain..], Normal, Texte);
                    return;
                }
                Ecrire(zone, ligne[(prochain + 2)..fin], Gras, Titre);
                position = fin + 2;
            }
            else
            {
                var fin = ligne.IndexOf('`', prochain + 1);
                if (fin < 0)
                {
                    Ecrire(zone, ligne[prochain..], Normal, Texte);
                    return;
                }
                Ecrire(zone, ligne[(prochain + 1)..fin], Mono, Code);
                position = fin + 1;
            }
        }
    }

    static int Plus(int gauche, int droite) =>
        gauche < 0 ? droite : droite < 0 ? gauche : Math.Min(gauche, droite);

    static void Ecrire(RichTextBox zone, string texte, Font police, Color couleur)
    {
        zone.SelectionStart = zone.TextLength;
        zone.SelectionLength = 0;
        zone.SelectionFont = police;
        zone.SelectionColor = couleur;
        zone.AppendText(texte);
    }
}
