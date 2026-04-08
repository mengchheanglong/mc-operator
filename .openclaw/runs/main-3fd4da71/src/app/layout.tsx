import "./globals.css";
import "katex/dist/katex.min.css";

export const metadata = {
  title: "Mission Control",
  description: "Your IDE support and workspace context layer",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
