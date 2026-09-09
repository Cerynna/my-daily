using System.Windows.Forms;

namespace MyDailyTray;

static class Program
{
    [STAThread]
    static void Main()
    {
        using var mutex = new Mutex(true, "MyDaily_Tray_SingleInstance", out bool isNew);
        if (!isNew)
        {
            MessageBox.Show("MyDaily tourne deja (voir la barre des taches).",
                "MyDaily", MessageBoxButtons.OK, MessageBoxIcon.Information);
            return;
        }

        Application.EnableVisualStyles();
        Application.SetCompatibleTextRenderingDefault(false);
        Journal.Ecrire("--- demarrage ---");
        using var app = new MyDailyApp();
        Application.Run(app);
    }
}
