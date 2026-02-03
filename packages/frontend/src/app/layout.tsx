import type { Metadata } from 'next'
import './globals.css'
import { ClientLayout } from '@/components/client-layout'

export const metadata: Metadata = {
  title: 'Claude Docker Manager',
  description: 'Gerenciador de containers Docker com Claude Code e VS Code',
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
