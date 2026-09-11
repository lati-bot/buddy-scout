export const metadata = {
  title: "Buddy Scout",
  description: "Find the right person to reach, their verified email, and how to pitch.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          background: "#faf8f3",
          color: "#1a1a1a",
          fontFamily:
            '"Iowan Old Style", Georgia, "Times New Roman", serif',
        }}
      >
        {children}
      </body>
    </html>
  );
}
