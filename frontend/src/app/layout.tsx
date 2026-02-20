import './globals.css';

export const metadata = {
  title: 'Loku Caters | Authentic Lamprais',
  description: 'Pre-order your authentic Sri Lankan Lamprais. Hand-cooked and wrapped in a beautiful banana leaf.',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
