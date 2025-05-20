import { useEffect, useState, useCallback, useMemo } from 'react';
import { usePublicClient, useAccount, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import { bettingMarketABI } from '../abi/BettingMarket';
import { erc20ABI } from '../abi/erc20';
import { formatUnits, decodeEventLog, type Address, type PublicClient } from 'viem';
import { useQuery } from '@tanstack/react-query';
import {
    enrichMarketDetails as enrichMarketDetailsService,
} from '../services/espn';
import { getGameDisplayString, getWinnerDisplay } from '../lib/utils';
import { API_BASE_URL, BETTING_MARKET_ADDRESS, USDC_ADDRESS, USDC_DECIMALS } from '../lib/constants';

const MarketState = ['Open', 'Filled', 'Settled', 'Cancelled'];
type MarketFilterType = 'open_filled' | 'settled' | 'cancelled';

export interface MarketDetails {
  id: bigint;
  maker: Address;
  taker: Address;
  stake: bigint;
  url: string;
  urlHash: `0x${string}`;
  expiryTs: bigint;
  makerExpectsTrue: boolean;
  state: number;
  eventName?: string;
  eventDate?: string;
  betOnCompetitorName?: string;
  opponentName?: string;
  betOnCompetitorId?: string;
  winnerAddress?: Address;
}

type BetStructOutput = readonly [Address, Address, bigint, `0x${string}`, bigint, boolean, number];

const fetchAndProcessMarkets = async (
    publicClient: PublicClient,
): Promise<MarketDetails[]> => {
    const marketCreatedEventAbi = bettingMarketABI.find((item: any) => item.name === 'MarketCreated' && item.type === 'event');
    if (!marketCreatedEventAbi) throw new Error("MarketCreated event ABI not found");

    const latestBlock = await publicClient.getBlockNumber();
    const fromBlock = latestBlock > 499n ? latestBlock - 499n : 0n;

    const createdLogs = await publicClient.getLogs({
        address: BETTING_MARKET_ADDRESS, event: marketCreatedEventAbi as any,
        fromBlock: fromBlock, toBlock: latestBlock
    });

    const settledEventAbi = bettingMarketABI.find((item: any) => item.name === 'Settled' && item.type === 'event');
    const settledLogMap = new Map<string, Address>();
    if (settledEventAbi) {
        const settledLogs = await publicClient.getLogs({
            address: BETTING_MARKET_ADDRESS, event: settledEventAbi as any,
            fromBlock: fromBlock, toBlock: latestBlock
        });
        settledLogs.forEach(log => {
            const decodedLog = decodeEventLog({ abi: bettingMarketABI, data: log.data, topics: log.topics });
            const args = decodedLog.args as { id: bigint, winner: Address };
            settledLogMap.set(args.id.toString(), args.winner);
        });
    }

    const initialMarketsPromises = createdLogs.map(async (log) => {
        const decodedCreatedLog = decodeEventLog({ abi: bettingMarketABI, data: log.data, topics: log.topics });
        const eventArgs = decodedCreatedLog.args as { id: bigint, url: string };

        const betDataArray = await publicClient.readContract({
            address: BETTING_MARKET_ADDRESS, abi: bettingMarketABI, functionName: 'bets', args: [eventArgs.id]
        }) as BetStructOutput;

        const basicMarket: Omit<MarketDetails, 'eventName' | 'eventDate' | 'betOnCompetitorName' | 'opponentName' | 'winnerAddress' | 'betOnCompetitorId'> = {
            id: eventArgs.id, maker: betDataArray[0], taker: betDataArray[1], stake: betDataArray[2],
            url: eventArgs.url, urlHash: betDataArray[3], expiryTs: betDataArray[4],
            makerExpectsTrue: betDataArray[5], state: Number(betDataArray[6])
        };

        let enrichedMarket = await enrichMarketDetailsService(basicMarket) as MarketDetails;

        if (enrichedMarket.state === 2) {
            enrichedMarket.winnerAddress = settledLogMap.get(enrichedMarket.id.toString());
        }
        return enrichedMarket;
    });

    const resolvedEnrichedMarkets = await Promise.all(initialMarketsPromises);
    return resolvedEnrichedMarkets.sort((a, b) => Number(b.id - a.id));
};

function OpenMarketsPage() {
  const publicClient = usePublicClient();
  const { address: userAddress, isConnected } = useAccount();
  const { data: takeMarketTxHash, writeContract: writeTakeMarket, isPending: isTakingMarket, reset: resetTakeMarket } = useWriteContract();
  const { data: approveTakeTxHash, writeContract: writeApproveForTake, isPending: isApprovingForTake, reset: resetApproveForTake } = useWriteContract();
  const { data: settleMarketTxHash, writeContract: writeSettleMarket, isPending: isSettlingOnChain, reset: resetSettleMarket } = useWriteContract();
  
  const { isLoading: isConfirmingApprovalForTake, isSuccess: isApprovalForTakeConfirmed, error: approvalForTakeConfirmationError } = 
    useWaitForTransactionReceipt({ hash: approveTakeTxHash });
  const { isLoading: isConfirmingTakeMarket, isSuccess: isMarketTaken, error: takeMarketConfirmationError } = 
    useWaitForTransactionReceipt({ hash: takeMarketTxHash });
  const { isLoading: isConfirmingSettlement, isSuccess: isMarketSettled, error: settlementConfirmationError } = 
    useWaitForTransactionReceipt({ hash: settleMarketTxHash });

  const [marketFilter, setMarketFilter] = useState<MarketFilterType>('open_filled');
  const [status, setStatus] = useState<string>('');
  const [currentApprovalMarketId, setCurrentApprovalMarketId] = useState<bigint | null>(null);
  const [currentSettlementMarketId, setCurrentSettlementMarketId] = useState<bigint | null>(null);
  const [isCallingApiForProof, setIsCallingApiForProof] = useState<boolean>(false);

  const { 
    data: allFetchedMarkets, 
    isLoading: loadingMarkets, 
    error: fetchMarketsError, 
    refetch: refetchMarkets
  } = useQuery<MarketDetails[], Error>({
    queryKey: ['openMarkets', publicClient?.chain?.id],
    queryFn: () => {
        if (!publicClient) throw new Error('Public client not available');
        return fetchAndProcessMarkets(publicClient as PublicClient);
    },
    enabled: !!publicClient,
  });

  const displayedMarkets = useMemo(() => {
    let filtered: MarketDetails[] = [];
    const marketsToFilter = allFetchedMarkets || [];
    if (marketFilter === 'open_filled') {
      filtered = marketsToFilter.filter(m => m.state === 0 || m.state === 1);
    } else if (marketFilter === 'settled') {
      filtered = marketsToFilter.filter(m => m.state === 2);
    } else if (marketFilter === 'cancelled') {
      filtered = marketsToFilter.filter(m => m.state === 3);
    }
    return filtered;
  }, [allFetchedMarkets, marketFilter]);

  const handleTakeMarket = useCallback((marketId: bigint, stakeAmount: bigint) => {
    if (!isConnected || !userAddress || !publicClient) { setStatus('Connect wallet/network issue.'); return; } 
    setStatus(`Submitting transaction to take market ${marketId}...`);
    writeTakeMarket({ address: BETTING_MARKET_ADDRESS, abi: bettingMarketABI, functionName: 'takeMarket', args: [marketId, stakeAmount]},
      { 
        onSuccess: (hash: `0x${string}`) => setStatus(`Take market tx sent (${hash.substring(0,10)}...). Waiting...`),
        onError: (err: Error) => { setStatus(`Take market failed: ${err.message}`); setCurrentApprovalMarketId(null); resetTakeMarket(); }
      });
  }, [isConnected, userAddress, publicClient, writeTakeMarket, resetTakeMarket]);

  useEffect(() => {
    if (isApprovalForTakeConfirmed && currentApprovalMarketId !== null) {
      setStatus(`USDC Approved for market ${currentApprovalMarketId}! Taking market...`);
      const marketToTake = allFetchedMarkets?.find(m => m.id === currentApprovalMarketId);
      if (marketToTake) handleTakeMarket(marketToTake.id, marketToTake.stake);
      resetApproveForTake();
    } else if (approvalForTakeConfirmationError) {
      setStatus(`Error approving USDC: ${approvalForTakeConfirmationError.message}`);
      setCurrentApprovalMarketId(null);
      resetApproveForTake();
    }

    if (isMarketTaken) {
      setStatus('Market taken successfully! Refreshing markets list...');
      refetchMarkets();
      setCurrentApprovalMarketId(null); 
      resetTakeMarket();
      setTimeout(() => setStatus(''), 5000);
    } else if (takeMarketConfirmationError) {
      setStatus(`Error taking market: ${takeMarketConfirmationError.message}`);
      setCurrentApprovalMarketId(null); 
      resetTakeMarket();
    }

    if (isMarketSettled) {
      setStatus('Market settled successfully! Refreshing markets list...');
      refetchMarkets();
      setCurrentSettlementMarketId(null);
      resetSettleMarket();
      setTimeout(() => setStatus(''), 5000);
    } else if (settlementConfirmationError) {
      setStatus(`Error settling market: ${settlementConfirmationError.message}`);
      setCurrentSettlementMarketId(null);
      resetSettleMarket();
    }
  }, [
    isApprovalForTakeConfirmed, approvalForTakeConfirmationError, currentApprovalMarketId, allFetchedMarkets, resetApproveForTake, handleTakeMarket,
    isMarketTaken, takeMarketConfirmationError, refetchMarkets, resetTakeMarket,
    isMarketSettled, settlementConfirmationError, resetSettleMarket
  ]);

  const handleApproveAndTakeMarket = (marketId: bigint, stakeAmount: bigint) => {
    if (!isConnected || !userAddress) { setStatus('Please connect wallet.'); return; }
    setCurrentApprovalMarketId(marketId);
    setStatus('Requesting USDC approval to take market...');
    writeApproveForTake({
      address: USDC_ADDRESS,
      abi: erc20ABI,
      functionName: 'approve',
      args: [BETTING_MARKET_ADDRESS, stakeAmount],
    }, {
      onSuccess: (hash: `0x${string}`) => setStatus(`Approval sent (tx: ${hash.substring(0,10)}...). Waiting...`),      
      onError: (err: Error) => { setStatus(`Approval failed: ${err.message}`); setCurrentApprovalMarketId(null); resetApproveForTake(); }
    });
  };

  const handleSettle = async (market: MarketDetails) => {
    if (!isConnected) { setStatus('Please connect wallet to settle.'); return; }
    setCurrentSettlementMarketId(market.id);
    setIsCallingApiForProof(true);
    setStatus(`Fetching proof for market ${market.id} (URL: ${market.url.substring(0,30)}...)`);
    try {
      const response = await fetch(`${API_BASE_URL}/generateProof?url=${encodeURIComponent(market.url)}`);
      if (!response.ok) throw new Error(`API error: ${response.status} ${response.statusText}`);
      const proofData = await response.json();
      
      if (!proofData.transformedProof) throw new Error('Transformed proof not found in API response.');

      setStatus(`Proof received for market ${market.id}. Submitting settlement to contract...`);
      setIsCallingApiForProof(false);
      writeSettleMarket({ 
          address: BETTING_MARKET_ADDRESS, 
          abi: bettingMarketABI, 
          functionName: 'settle', 
          args: [market.id, proofData?.transformedProof]
        },
        { onSuccess: (hash: `0x${string}`) => setStatus(`Settlement tx sent (${hash.substring(0,10)}...). Waiting...`), 
          onError: (err: Error) => { setStatus(`Settlement failed: ${err.message}`); setCurrentSettlementMarketId(null); resetSettleMarket(); }
        });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      console.error("Settlement process error:", e);
      setStatus(`Settlement error: ${errorMessage}`);
      setIsCallingApiForProof(false);
      setCurrentSettlementMarketId(null);
    }
  };

  if (loadingMarkets && !allFetchedMarkets) return <p className="text-center text-sky-400">Loading markets...</p>;
  if (fetchMarketsError) return <p className="text-center text-red-500">Error: {fetchMarketsError.message}</p>;

  const commonCardStyle = "bg-slate-800 p-4 rounded-lg shadow-lg border border-slate-700 flex flex-col justify-between";
  const buttonStyle = "mt-auto px-4 py-2 text-sm font-semibold text-white rounded-md hover:bg-sky-700 disabled:opacity-50 disabled:cursor-not-allowed";
  const primaryButtonStyle = `${buttonStyle} bg-sky-600`;
  const secondaryButtonStyle = `${buttonStyle} bg-teal-600`;
  const filterSelectStyle = "mb-4 p-2 rounded-md bg-slate-700 text-slate-100 border border-slate-600 focus:ring-sky-500 focus:border-sky-500";

  return (
    <div className="max-w-5xl mx-auto p-4">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-semibold text-sky-400">Markets</h2>
        <div>
          <label htmlFor="marketFilter" className="text-sm text-slate-400 mr-2">Filter:</label>
          <select id="marketFilter" value={marketFilter} onChange={(e) => setMarketFilter(e.target.value as MarketFilterType)} className={filterSelectStyle}>
            <option value="open_filled">Open & Filled</option>
            <option value="settled">Settled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>
      {status && <p className={`text-center p-2 my-2 rounded-md text-sm ${takeMarketConfirmationError || approvalForTakeConfirmationError || settlementConfirmationError || fetchMarketsError ? 'bg-red-700 text-red-100' : (isMarketTaken || isApprovalForTakeConfirmed || isMarketSettled ? 'bg-green-700 text-green-100' : 'bg-sky-700 text-sky-100')}`}>{status}</p>}
      {loadingMarkets && displayedMarkets.length === 0 && <p className="text-center text-sky-400 text-sm">Refreshing markets...</p>} 
      {displayedMarkets.length === 0 && !loadingMarkets && (
        <p className="text-center text-slate-400">No markets found for the selected filter.</p>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {displayedMarkets.map((market) => {
          const isMaker = isConnected && market.maker.toLowerCase() === userAddress?.toLowerCase();
          const isProcessingTake = (isApprovingForTake || isConfirmingApprovalForTake || isTakingMarket || isConfirmingTakeMarket) && currentApprovalMarketId === market.id;
          const isProcessingSettle = (isCallingApiForProof || isSettlingOnChain || isConfirmingSettlement) && currentSettlementMarketId === market.id;
          
          const gameDisplay = getGameDisplayString(market);
          const winnerDisplay = getWinnerDisplay(market);

          return (
          <div key={market.id.toString()} className={commonCardStyle}>
            <div className="space-y-1">
              <h3 className="text-lg font-semibold text-sky-500">Market ID: {market.id.toString()}</h3>
              <p className="text-sm text-slate-300 font-semibold">Game: <span className="font-normal">{gameDisplay}</span></p>
              {market.betOnCompetitorName && 
                <p className="text-sm text-slate-300">Betting on: <span className="font-semibold">{market.betOnCompetitorName}</span> to {market.makerExpectsTrue ? 'WIN' : 'NOT WIN (lose/draw)'}</p>
              }
              <p className="text-xs text-slate-400 break-all" title={market.url}>URL: {market.url.substring(0, 70)}...</p>
              <p className="text-sm text-slate-300">Maker: <span className="font-mono text-xs break-all">{market.maker}</span></p>
              {market.state === 1 && market.taker !== '0x0000000000000000000000000000000000000000' && (
                 <p className="text-sm text-slate-300">Taker: <span className="font-mono text-xs break-all">{market.taker}</span></p>
              )}
              <p className="text-sm text-slate-300">Stake: <span className="font-semibold">{formatUnits(market.stake, USDC_DECIMALS)} USDC</span></p>
              <p className="text-sm text-slate-300">Expires (Proof Window): <span className="font-semibold">{new Date(Number(market.expiryTs) * 1000).toLocaleString()}</span></p>
              <p className="text-sm text-slate-300">Status: 
                <span className={`font-semibold 
                  ${market.state === 0 ? 'text-yellow-400' : market.state === 1 ? 'text-orange-400' : market.state === 2 ? 'text-green-400' : 'text-red-400'}`}>
                  {MarketState[market.state]}
                </span>
              </p>
              {winnerDisplay}
            </div>
            {market.state === 0 && isConnected && !isMaker && (
              <button onClick={() => handleApproveAndTakeMarket(market.id, market.stake)} disabled={isProcessingTake} className={primaryButtonStyle}>
                {isProcessingTake ? 'Processing Take...' : 'Approve & Take Market'}
              </button>
            )}
            {market.state === 0 && isConnected && isMaker && (<p className="text-xs text-slate-500 mt-auto">(Your market, awaiting taker)</p>)}
            
            {market.state === 1 && isConnected && (
              <button onClick={() => handleSettle(market)} disabled={isProcessingSettle} className={secondaryButtonStyle}>
                {isProcessingSettle ? 'Processing Settlement...' : 'Settle Market'}
              </button>
            )}
            
            {!isConnected && (market.state === 0 || market.state === 1) && (<p className="text-xs text-slate-500 mt-auto">(Connect wallet for actions)</p>)}
            {market.state === 2 && (<p className="text-sm text-green-500 mt-auto font-semibold">Market Settled</p>)}
          </div>
        );})}
      </div>
    </div>
  );
}

export default OpenMarketsPage; 