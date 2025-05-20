import { http, createConfig } from 'wagmi';
import { baseSepolia } from 'wagmi/chains';
import { injected } from 'wagmi/connectors';

export const config = createConfig({
  chains: [baseSepolia],
  connectors: [
    injected(), // For MetaMask or other browser wallets
    // You can add more connectors here like WalletConnect, Coinbase Wallet, etc.
  ],
  transports: {
    [baseSepolia.id]: http("https://base-sepolia.g.alchemy.com/v2/BRqt9lf_o8pZWaOsP7zaN-z65WVe38Qh"),
  },
}); 