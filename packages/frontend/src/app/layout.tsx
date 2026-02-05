import type { Metadata } from 'next'
import './globals.css'
import { ClientLayout } from '@/components/client-layout'

export const metadata: Metadata = {
  title: 'DevForge',
  description: 'Orquestração de containers para desenvolvimento com IA',
  icons: {
    icon: '/favicon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased min-h-screen bg-terminal-bg">
        <ClientLayout>{children}</ClientLayout>
      </body>
    </html>
  )
}
