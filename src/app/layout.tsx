import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { ConfirmacionProvider } from "@/context/Confirmacion";
import { AvisosProvider } from "@/context/Avisos";
import Navbar from "@/components/layout/Navbar";
import Script from "next/script";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Paté · Salud Familiar",
  description: "Organiza y gestiona la salud de tu núcleo familiar, expedientes médicos, controles de crecimiento, vacunas, citas y documentos clínicos en un solo lugar con respaldo en Google Drive.",
  manifest: "/manifest.json",
  icons: {
    apple: "/apple-touch-icon.png"
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Paté Salud"
  },
  other: {
    "mobile-web-app-capable": "yes",
    "apple-mobile-web-app-capable": "yes"
  }
};

export const viewport: Viewport = {
  themeColor: "#0d9488", // teal-600
  width: "device-width",
  initialScale: 1,
  // C1.5 · Bloquear el zoom (maximumScale: 1, userScalable: false) deja fuera
  // a quien necesita ampliar para leer, que en una aplicación de salud
  // familiar es exactamente parte del público. WCAG 1.4.4 lo prohíbe.
  maximumScale: 5,
  userScalable: true
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 select-none">
        <AvisosProvider>
          <ConfirmacionProvider>
            <AppProvider>
              <Navbar>
                {children}
              </Navbar>
            </AppProvider>
          </ConfirmacionProvider>
        </AvisosProvider>
        <Script 
          src="https://accounts.google.com/gsi/client" 
          strategy="afterInteractive" 
        />
      </body>
    </html>
  );
}
