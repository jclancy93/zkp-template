import { useState } from 'react'
import { decodeEventLog } from 'viem'
import type { Hex } from 'viem'
import { useAccount, useConnect, useDisconnect, useWalletClient, usePublicClient } from 'wagmi'


// Simplified ABI for the Verify contract's verify function and event
// We will pass the full proof object as received from the backend to the 'proof' parameter
const verifyContractABI = [
  {
    "type": "function",
    "name": "verify",
    "inputs": [
      {
        "name": "proof",
        "type": "tuple",
        "components": [
          { "name": "claimInfo", "type": "tuple", "components": [
            { "name": "provider", "type": "string" },
            { "name": "parameters", "type": "string" },
            { "name": "context", "type": "string" }
          ]},
          { "name": "signedClaim", "type": "tuple", "components": [
            { "name": "claim", "type": "tuple", "components": [
              { "name": "identifier", "type": "bytes32" },
              { "name": "owner", "type": "address" },
              { "name": "timestampS", "type": "uint32" },
              { "name": "epoch", "type": "uint32" }
            ]},
            { "name": "signatures", "type": "bytes[]" }
          ]}
        ]
      }
    ],
    "outputs": [],
    "stateMutability": "public" // Assuming it's not payable and doesn't return a value directly relevant to this interaction
  },
  {
    "type": "event",
    "name": "PriceVerified",
    "inputs": [
        { "name": "price", "type": "string", "indexed": false }
    ],
    "anonymous": false
  }
];

const contractAddress = import.meta.env.VITE_BASE_SEPOLIA_VERIFY_CONTRACT_ADDRESS as Hex;
const apiUrl = import.meta.env.VITE_API_URL;

function App() {
  const { address, isConnected, isConnecting, status: accountStatus } = useAccount();
  const { connect, connectors, error: connectError, isPending: isConnectingViaConnectHook } = useConnect();
  const { disconnect } = useDisconnect();
  const { data: walletClient } = useWalletClient();
  const wagmiPublicClient = usePublicClient(); // Get public client from Wagmi context

  const [proofDataResponse, setProofDataResponse] = useState<any>(null);
  const [transactionHash, setTransactionHash] = useState<string | null>(null);
  const [verifiedPrice, setVerifiedPrice] = useState<string | null>(null);
  const [isLoadingProofAndSubmit, setIsLoadingProofAndSubmit] = useState<boolean>(false);
  const [operationError, setOperationError] = useState<string | null>(null);

  const publicClient = wagmiPublicClient; // Use the client from Wagmi context

  const handleConnect = () => {
    // For simplicity, connecting with the first available injected connector (e.g., MetaMask)
    const injectedConnector = connectors.find(c => c.id === 'injected');
    if (injectedConnector) {
      connect({ connector: injectedConnector });
    } else {
      setOperationError("No injected wallet connector found (e.g., MetaMask).");
    }
  };

  const handleRequestAndSubmitProof = async () => {
    if (!address || !walletClient) {
      setOperationError('Please connect your wallet first.');
      return;
    }
    if (!publicClient) {
      setOperationError('Public client not initialized. Check RPC URL configuration.');
      return;
    }
    setIsLoadingProofAndSubmit(true);
    setOperationError(null);
    setTransactionHash(null);
    setProofDataResponse(null);
    setVerifiedPrice(null);

    try {
      console.log(`Requesting proof from: ${apiUrl}/generateProof`);
      const response = await fetch(`${apiUrl}/generateProof`);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to fetch proof: ${response.status} ${errorText}`);
      }
      const apiResponse = await response.json();
      setProofDataResponse(apiResponse);
      
      if (!apiResponse.transformedProof) throw new Error('Transformed proof not found in API response.');
      const transformedProofData = apiResponse.transformedProof;

      console.log("Submitting proof to contract:", contractAddress);

      const { request } = await publicClient.simulateContract({
        account: address, 
        address: contractAddress,
        abi: verifyContractABI,
        functionName: 'verify',
        args: [transformedProofData],
      });

      const hash = await walletClient.writeContract(request);
      setTransactionHash(hash);
      console.log("Transaction sent, hash:", hash);

      console.log("Waiting for transaction receipt...");
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status === 'success') {
        console.log("Transaction successful. Decoding events...");
        let priceFromEvent: string | null = null;

        for (const log of receipt.logs) {
            try {
                const decodedEvent = decodeEventLog({
                    abi: verifyContractABI,
                    data: log.data,
                    topics: log.topics,
                });

                if (decodedEvent.eventName === 'PriceVerified') {
                    const directPriceString = (decodedEvent.args as any)?.price;

                    if (directPriceString && typeof directPriceString === 'string') {
                        priceFromEvent = directPriceString;
                        setVerifiedPrice(priceFromEvent);
                        console.log("PriceVerified event found. Price (direct string from logs):", priceFromEvent);
                        break; 
                    } else {
                        console.warn("PriceVerified event decoded, but 'price' argument is missing or not a string.", decodedEvent.args);
                        if (decodedEvent.args) {
                            console.log("Full decodedEvent.args for PriceVerified (on warning):", decodedEvent.args);
                        }
                    }
                }
            } catch(e) {
                console.warn("Could not decode a specific event log (may not be PriceVerified event):", e);
            }
        }

        if (priceFromEvent) {
          console.log("Successfully extracted price from event logs on this attempt:", priceFromEvent);
        } else {
          console.log("PriceVerified event not found in transaction logs, or price could not be extracted.");
        }
      } else {
        setOperationError("Transaction failed. Check console for receipt.");
        console.error("Transaction receipt indicates failure:", receipt);
      }
    } catch (err: any) {
      setOperationError(`Operation failed: ${err.message || 'Unknown error'}`);
      console.error("Operation error:", err);
    } finally {
      setIsLoadingProofAndSubmit(false);
    }
  };

  // Removed useEffect for window.ethereum listeners as Wagmi handles this

  return (
    <>
      <h1>Reclaim Protocol On-chain Verification with Wagmi</h1>
      
      {isConnected ? (
        <div>
          <p>Connected Account: {address}</p>
          <p>Status: {accountStatus}</p>
          <button onClick={() => disconnect()}>Disconnect Wallet</button>
          <hr />
          <button 
            onClick={handleRequestAndSubmitProof} 
            disabled={isLoadingProofAndSubmit || !contractAddress || !apiUrl || !publicClient || !walletClient}
          >
            {isLoadingProofAndSubmit ? 'Processing...' : 'Request Proof & Submit On-chain'}
          </button>
        </div>
      ) : (
        <button onClick={handleConnect} disabled={isConnectingViaConnectHook || isConnecting}>
          {isConnectingViaConnectHook || isConnecting ? 'Connecting...' : 'Connect Wallet'}
        </button>
      )}

      {(isConnectingViaConnectHook || isConnecting) && <p>Attempting to connect...</p>}
      {connectError && <p style={{ color: 'red' }}>Connection Error: {connectError.message}</p>}
      {isLoadingProofAndSubmit && <p>Loading...</p>}
      {operationError && <p style={{ color: 'red' }}>Error: {operationError}</p>}
      
      {proofDataResponse && (
        <div>
          <h3>Proof API Response:</h3>
          <textarea 
            readOnly 
            value={JSON.stringify(proofDataResponse, null, 2)} 
            rows={10} 
            style={{ width: '100%', boxSizing: 'border-box', fontFamily: 'monospace', fontSize: '0.8em' }} 
          />
        </div>
      )}
      {transactionHash && <p>Transaction Hash: <a href={`https://sepolia.basescan.org/tx/${transactionHash}`} target="_blank" rel="noopener noreferrer">{transactionHash}</a></p>}
      {verifiedPrice && <p style={{color: 'green'}}>Verified Price from Event: {verifiedPrice}</p>}
      
      {!publicClient && <p style={{color: 'orange'}}>Public client not available. Check RPC URL (VITE_BASE_SEPOLIA_RPC_URL).</p>}
      {isConnected && !contractAddress && publicClient && <p style={{color: 'orange'}}>Verify Contract Address (VITE_BASE_SEPOLIA_VERIFY_CONTRACT_ADDRESS) not found in .env. Please deploy contracts.</p>}
      {isConnected && !apiUrl && publicClient && <p style={{color: 'orange'}}>API URL (VITE_API_URL) not found in .env.</p>}
    </>
  );
}

export default App

