import React from 'react'
import ReactDOM from 'react-dom/client'
import './index.css'
import App from './App.tsx'

import { WagmiProvider, createConfig, http } from 'wagmi'
import { baseSepolia } from 'wagmi/chains'
import { injected } from 'wagmi/connectors'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()

const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected(), // For MetaMask and other browser extension wallets
  ],
  transports: {
    [baseSepolia.id]: http(import.meta.env.VITE_BASE_SEPOLIA_RPC_URL || undefined),
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </WagmiProvider>
  </React.StrictMode>,
)
