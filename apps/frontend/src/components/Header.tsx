import { useAccount, useConnect, useDisconnect } from 'wagmi';
import { injected } from 'wagmi/connectors';

export function Header() {
  const { address, isConnected } = useAccount();
  const { connect } = useConnect();
  const { disconnect } = useDisconnect();

  const buttonStyle = "px-4 py-2 font-semibold text-sm bg-sky-500 text-white rounded-md shadow-sm hover:bg-sky-600";

  return (
    <header className="p-4 bg-slate-800 text-slate-100 border-b border-slate-700 flex justify-between items-center w-full">
      <div className="text-xl font-bold text-sky-400">P2P Bet</div>
      <div>
        {isConnected ? (
          <div className="flex items-center gap-4">
            <span className="text-sm">Connected: {`${address?.substring(0, 6)}...${address?.substring(address.length - 4)}`}</span>
            <button onClick={() => disconnect()} className={buttonStyle}>Disconnect</button>
          </div>
        ) : (
          <button onClick={() => connect({ connector: injected() })} className={buttonStyle}>Connect Wallet</button>
        )}
      </div>
    </header>
  );
} 