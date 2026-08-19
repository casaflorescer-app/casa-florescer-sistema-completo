export const metadata = {
  title: "Florescer Clínica",
  description: "Agenda e recepção da Florescer Clínica",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0 }}>{children}</body>
    </html>
  );
}
