using System;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Security;
using System.Security.Cryptography.X509Certificates;
using System.Windows.Forms;

namespace Motors2L
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            try
            {
                ServicePointManager.ServerCertificateValidationCallback = 
                    (sender, cert, chain, sslPolicyErrors) => true;

                string targetUrl = "https://192.168.1.51:3443";
                
                if (args != null && args.Length > 0 && !string.IsNullOrWhiteSpace(args[0]))
                {
                    targetUrl = args[0].Trim();
                }

                EnsureServerRunning();

                string edge = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Microsoft\Edge\Application\msedge.exe");
                if (!File.Exists(edge))
                {
                    edge = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Microsoft\Edge\Application\msedge.exe");
                }

                string chrome = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Google\Chrome\Application\chrome.exe");
                if (!File.Exists(chrome))
                {
                    chrome = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86), @"Google\Chrome\Application\chrome.exe");
                }

                string browserPath = File.Exists(edge) ? edge : (File.Exists(chrome) ? chrome : null);

                if (browserPath != null)
                {
                    ProcessStartInfo psi = new ProcessStartInfo
                    {
                        FileName = browserPath,
                        Arguments = "--app=\"" + targetUrl + "\" --ignore-certificate-errors",
                        UseShellExecute = true
                    };
                    Process.Start(psi);
                }
                else
                {
                    Process.Start(targetUrl);
                }
            }
            catch (Exception ex)
            {
                MessageBox.Show("Erreur de lancement de MOTORS 2L : " + ex.Message, "MOTORS 2L", MessageBoxButtons.OK, MessageBoxIcon.Error);
            }
        }

        static void EnsureServerRunning()
        {
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://localhost:3000/index.html");
                req.Timeout = 1200;
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    if (resp.StatusCode == HttpStatusCode.OK) return;
                }
            }
            catch
            {
                try
                {
                    string baseDir = AppDomain.CurrentDomain.BaseDirectory;
                    string serverJs = Path.Combine(baseDir, "..", "server.js");
                    if (!File.Exists(serverJs)) serverJs = Path.Combine(baseDir, "server.js");

                    if (File.Exists(serverJs))
                    {
                        ProcessStartInfo nodePsi = new ProcessStartInfo
                        {
                            FileName = "node.exe",
                            Arguments = "\"" + serverJs + "\"",
                            WorkingDirectory = Path.GetDirectoryName(serverJs),
                            CreateNoWindow = true,
                            WindowStyle = ProcessWindowStyle.Hidden,
                            UseShellExecute = false
                        };
                        Process.Start(nodePsi);
                        System.Threading.Thread.Sleep(1500);
                    }
                }
                catch {}
            }
        }
    }
}
