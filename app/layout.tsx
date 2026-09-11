export const metadata = {
  title: "Buddy Scout",
  description:
    "Type a company. Get whether they're hiring, the right person to reach, and how to pitch Buddy.",
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
          background: "#faf9f7",
          color: "#17171a",
          fontFamily:
            'ui-sans-serif,"Helvetica Neue",Helvetica,Arial,sans-serif',
          fontSize: 15,
          lineHeight: 1.55,
          WebkitFontSmoothing: "antialiased",
        }}
      >
        {children}
      </body>
    </html>
  );
}
