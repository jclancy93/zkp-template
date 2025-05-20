import { useState, useEffect, useMemo } from 'react';
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useBalance, useReadContract } from 'wagmi';
import { parseUnits, formatUnits } from 'viem';
import { bettingMarketABI } from '../abi/BettingMarket';
import { erc20ABI } from '../abi/erc20';
import { useQuery } from '@tanstack/react-query';
import {
    ESPN_API_BASE_CORE,
    ESPN_API_BASE_SITE,
    fetchEspnData as fetchEspnDataService,
    type EspnResource,
    type AppEventFormat,
    type AppCompetitorFormat,
} from '../services/espn';
import { BETTING_MARKET_ADDRESS, USDC_ADDRESS, USDC_DECIMALS } from '../lib/constants';
const MAX_UINT256 = BigInt("0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff");
const HIGH_ENOUGH_ALLOWANCE = MAX_UINT256 / BigInt(2);

function CreateMarketPage() {
  const { address: userAddress, isConnected } = useAccount();
  const { writeContract: writeApprove, data: approveHash, isPending: isApproving, reset: resetApprove } = useWriteContract();
  const { writeContract: writeCreateMarket, data: createMarketHash, isPending: isCreatingMarket, reset: resetCreateMarket } = useWriteContract();

  const [competitors, setCompetitors] = useState<AppCompetitorFormat[]>([]);

  const [selectedSport, setSelectedSport] = useState<EspnResource | null>(null);
  const [selectedLeague, setSelectedLeague] = useState<EspnResource | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AppEventFormat | null>(null);
  const [selectedCompetitor, setSelectedCompetitor] = useState<AppCompetitorFormat | null>(null);

  const [url, setUrl] = useState<string>('');
  const [stake, setStake] = useState<string>('');
  const [makerExpectsTrue, setMakerExpectsTrue] = useState<boolean>(true);
  const [expiryDeltaHours, setExpiryDeltaHours] = useState<number>(12);
  const [status, setStatus] = useState<string>('');

  const { data: usdcBalance } = useBalance({ address: userAddress, token: USDC_ADDRESS });
  const { isLoading: isConfirmingApprovalTx, isSuccess: isApprovalTxConfirmed, error: approvalTxConfirmationError } = useWaitForTransactionReceipt({ hash: approveHash });
  const { isLoading: isConfirmingMarketCreation, isSuccess: isMarketCreated, error: marketCreationConfirmationError } = useWaitForTransactionReceipt({ hash: createMarketHash });
  const { data: currentAllowance, refetch: refetchAllowance, isLoading: isLoadingAllowance } = useReadContract({
    address: USDC_ADDRESS, abi: erc20ABI, functionName: 'allowance',
    args: userAddress ? [userAddress, BETTING_MARKET_ADDRESS] : undefined,
    query: { enabled: !!userAddress }
  });
  const hasSufficientAllowance = useMemo(() => {
    if (!currentAllowance || !stake) return false;
    try {
      const stakeAmountParsed = parseUnits(stake, USDC_DECIMALS);
      return currentAllowance >= stakeAmountParsed;
    } catch (e) { return false; }
  }, [currentAllowance, stake]);
  const isMaxAllowanceSet = useMemo(() => 
    Boolean(currentAllowance && currentAllowance >= HIGH_ENOUGH_ALLOWANCE)
  , [currentAllowance]);

  const handleSportChange = (sportRef: string | null) => {
    const sport = sports?.find(s => s.$ref === sportRef) || null;
    setSelectedSport(sport);
    setSelectedLeague(null); 
    setSelectedEvent(null); 
    setSelectedCompetitor(null); 
    setCompetitors([]);
    setUrl('');
  };

  const handleLeagueChange = (leagueRef: string | null) => {
    const league = leagues?.find(l => l.$ref === leagueRef) || null;
    setSelectedLeague(league);
    setSelectedEvent(null); 
    setSelectedCompetitor(null); 
    setCompetitors([]);
    setUrl('');
  };

  const handleEventChange = (eventId: string | null) => {
    const event = events?.find(ev => ev.id === eventId) || null;
    setSelectedEvent(event);
    setCompetitors(event?.competitors || []);
    setSelectedCompetitor(null);
    setUrl('');
  };

  const { data: sports, isLoading: loadingSports, error: sportsError } = useQuery<EspnResource[], Error>({
    queryKey: ['sports'],
    queryFn: () => fetchEspnDataService(`${ESPN_API_BASE_CORE}`),
    staleTime: Infinity,
  });

  const { data: leagues, isLoading: loadingLeagues, error: leaguesError } = useQuery<EspnResource[], Error>({
    queryKey: ['leagues', selectedSport?.slug],
    queryFn: () => fetchEspnDataService(`${ESPN_API_BASE_CORE}/${selectedSport!.slug}/leagues`),
    enabled: !!selectedSport?.slug,
    staleTime: 1000 * 60 * 5,
  });

  const { data: events, isLoading: loadingEvents, error: eventsError } = useQuery<AppEventFormat[], Error>({
    queryKey: ['events', selectedSport?.slug, selectedLeague?.slug],
    queryFn: () => {
        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 3);
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 7);
        const formatDate = (date: Date) => date.toISOString().slice(0,10).replace(/-/g,'');
        const dateRange = `${formatDate(startDate)}-${formatDate(endDate)}`;
        const scoreboardUrl = `${ESPN_API_BASE_SITE}/${selectedSport!.slug}/${selectedLeague!.slug}/scoreboard?dates=${dateRange}`;
        return fetchEspnDataService(scoreboardUrl, undefined, true).then(scoreboardEventsData => {
            const eventsArray = Array.isArray(scoreboardEventsData) ? scoreboardEventsData : [];
            return eventsArray.map((event: any) => ({
                id: event.id,
                name: event.name,
                date: event.date,
                competitionId: event.competitions[0]?.id, 
                competitors: event.competitions[0]?.competitors.map((comp:any) => ({
                    id: comp.team.id, 
                    displayName: comp.team.displayName || comp.team.name || comp.id,
                })) || []
            }));
        });
    },
    enabled: !!selectedSport?.slug && !!selectedLeague?.slug,
    staleTime: 1000 * 60 * 1,
  });

  useEffect(() => {
    if (selectedSport) {
        setSelectedLeague(null); 
        setSelectedEvent(null); 
        setSelectedCompetitor(null); 
        setUrl('');
    }
  }, [selectedSport]);

  useEffect(() => {
    if (selectedLeague) {
        setSelectedEvent(null); 
        setSelectedCompetitor(null); 
        setUrl('');
    }
  }, [selectedLeague]);

  useEffect(() => {
    if (selectedEvent) {
        setCompetitors(selectedEvent.competitors || []);
        setSelectedCompetitor(null);
        setUrl('');
    } else {
        setCompetitors([]);
    }
  }, [selectedEvent]);

  useEffect(() => {
    if (selectedSport?.slug && selectedLeague?.slug && selectedEvent?.id && selectedEvent?.competitionId && selectedCompetitor?.id) {
      const finalUrl = `${ESPN_API_BASE_CORE}/${selectedSport.slug}/leagues/${selectedLeague.slug}/events/${selectedEvent.id}/competitions/${selectedEvent.competitionId}/competitors/${selectedCompetitor.id}`;
      setUrl(finalUrl);
    } else {
        setUrl('');
    }
  }, [selectedSport, selectedLeague, selectedEvent, selectedCompetitor]);

  useEffect(() => {
    if (isApprovalTxConfirmed) {
      setStatus('Max USDC Approved successfully! You can now create markets.');
      refetchAllowance();
      resetApprove();
    } else if (approvalTxConfirmationError) {
      setStatus(`Error approving USDC: ${approvalTxConfirmationError.message}`);
      resetApprove();
    }

    if (isMarketCreated) {
      setStatus('Market created successfully!');
      setUrl(''); setStake('');
      setSelectedSport(null); setSelectedLeague(null); setSelectedEvent(null); setSelectedCompetitor(null);
      resetCreateMarket();
      refetchAllowance();
      setTimeout(() => setStatus(''), 5000);
    } else if (marketCreationConfirmationError) {
      setStatus(`Error creating market: ${marketCreationConfirmationError.message}`);
      resetCreateMarket();
    }
  }, [
    isApprovalTxConfirmed, approvalTxConfirmationError, resetApprove, refetchAllowance,
    isMarketCreated, marketCreationConfirmationError, resetCreateMarket
  ]);

  const handleApproveMax = async () => {
    if (!isConnected || !userAddress) { setStatus('Please connect wallet.'); return; }
    setStatus('Requesting MAX USDC approval...');
    try {
      writeApprove({ address: USDC_ADDRESS, abi: erc20ABI, functionName: 'approve', args: [BETTING_MARKET_ADDRESS, MAX_UINT256]},
        { onSuccess: (h: `0x${string}`) => setStatus(`Max approval sent (tx: ${h.substring(0,10)}...). Waiting for confirmation...`), onError: (e: Error) => setStatus(`Max approval error: ${e.message}`) });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setStatus(`Max approval error: ${errorMessage}`);
      console.error(e);
    }
  };

  const handleCreateMarket = async () => {
    if (!isConnected || !userAddress) { setStatus('Please connect wallet.'); return; }
    if (!url || !stake) { setStatus('Please select event data to populate URL and fill in Stake.'); return; }
    if (!hasSufficientAllowance) { setStatus('Insufficient USDC allowance. Please approve first.'); return; }
    try {
      const generatedMarketId = Date.now().toString();
      const stakeAmountParsed = parseUnits(stake, USDC_DECIMALS);
      const expiryTimestamp = BigInt(Math.floor(Date.now() / 1000) + expiryDeltaHours * 3600);
      setStatus('Creating market...');
      writeCreateMarket({ address: BETTING_MARKET_ADDRESS, abi: bettingMarketABI, functionName: 'createMarket', args: [BigInt(generatedMarketId), url, stakeAmountParsed, expiryTimestamp, makerExpectsTrue]},
        { onSuccess: (h: `0x${string}`) => setStatus(`Market creation sent (tx: ${h.substring(0,10)}...). Waiting...`), onError: (e: Error) => setStatus(`Creation error: ${e.message}`) });
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      setStatus(`Create market error: ${errorMessage}`);
      console.error(e);
    }
  };

  const commonInputStyle = "mt-1 block w-full px-3 py-2 bg-white border border-slate-300 rounded-md text-sm shadow-sm placeholder-slate-400 focus:outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500 disabled:bg-slate-100 disabled:text-slate-500 disabled:border-slate-200 disabled:shadow-none text-slate-900";
  const commonSelectStyle = commonInputStyle;
  const buttonStyle = "px-4 py-2 font-semibold text-sm bg-sky-500 text-white rounded-md shadow-sm hover:bg-sky-600 disabled:opacity-50 disabled:cursor-not-allowed";

  const apiError = sportsError || leaguesError || eventsError;

  return (
    <div className="max-w-2xl mx-auto p-4 space-y-6 bg-slate-800 text-slate-100 rounded-lg shadow-xl">
      <h2 className="text-2xl font-semibold text-center text-sky-400">Create New Market</h2>
      {usdcBalance && <p className="text-sm text-center text-slate-400">Your USDC Balance: {formatUnits(usdcBalance.value, USDC_DECIMALS)} {usdcBalance.symbol}</p>}
      {isLoadingAllowance && <p className="text-sm text-center text-slate-400">Loading allowance...</p>}
      {currentAllowance !== undefined && !isMaxAllowanceSet && stake && !hasSufficientAllowance && (
        <p className="text-sm text-center text-yellow-500 bg-yellow-900 p-2 rounded">
            Current allowance ({formatUnits(currentAllowance || BigInt(0), USDC_DECIMALS)} USDC) is less than stake ({stake} USDC). Please approve max spend.
        </p>
      )}
      {isMaxAllowanceSet && <p className="text-sm text-center text-green-500 bg-green-900 p-2 rounded">Max USDC spend approved for this contract.</p>}
      {apiError && <p className="text-center text-red-400 bg-red-900 p-2 rounded">API Error: {apiError.message}</p>}
      {!isConnected ? <p className="text-center text-yellow-400">Please connect wallet.</p> : (
        <form onSubmit={(e) => e.preventDefault()} className="space-y-4">
          <div>
            <label htmlFor="sport" className="block text-sm font-medium text-slate-300">1. Select Sport</label>
            <select id="sport" value={selectedSport?.$ref || ''} onChange={(e) => handleSportChange(e.target.value)} disabled={loadingSports} className={commonSelectStyle}>
              <option value="" disabled>{loadingSports ? 'Loading sports...' : (sportsError ? 'Error loading sports' : '-- Select Sport --')}</option>
              {sports?.map((sport) => <option key={sport.$ref} value={sport.$ref}>{sport.name || sport.slug || 'Unknown Sport'}</option>)}
            </select>
          </div>

          {selectedSport && (
            <div>
              <label htmlFor="league" className="block text-sm font-medium text-slate-300">2. Select League</label>
              <select id="league" value={selectedLeague?.$ref || ''} onChange={(e) => handleLeagueChange(e.target.value)} disabled={loadingLeagues || !selectedSport} className={commonSelectStyle}>
                <option value="" disabled>{loadingLeagues ? 'Loading leagues...' : (leaguesError ? 'Error loading leagues' : '-- Select League --')}</option>
                {leagues?.map((league) => <option key={league.$ref} value={league.$ref}>{league.name || league.slug || 'Unknown League'}</option>)}
              </select>
            </div>
          )}

          {selectedLeague && (
            <div>
              <label htmlFor="event" className="block text-sm font-medium text-slate-300">3. Select Event (Showing 3 days prior to 1 week ahead)</label>
              <select id="event" value={selectedEvent?.id || ''} onChange={(e) => handleEventChange(e.target.value)} disabled={loadingEvents || !selectedLeague} className={commonSelectStyle}>
                <option value="" disabled>{loadingEvents ? 'Loading events...' : (eventsError ? 'Error loading events' : '-- Select Event --')}</option>
                {events?.map((event) => <option key={event.id} value={event.id}>{event.name}{event.date ? ` (${new Date(event.date).toLocaleDateString()})` : ''}</option>)}
              </select>
            </div>
          )}

          {selectedEvent && (
            <div>
              <label htmlFor="competitor" className="block text-sm font-medium text-slate-300">4. Select Competitor to Bet On</label>
              <select id="competitor" value={selectedCompetitor?.id || ''} onChange={(e) => setSelectedCompetitor(competitors.find(c => c.id === e.target.value) || null)} disabled={!selectedEvent || competitors.length === 0} className={commonSelectStyle}>
                <option value="" disabled>{competitors.length === 0 ? 'No competitors found...' : '-- Select Competitor --'}</option>
                {competitors.map((comp) => <option key={comp.id} value={comp.id}>{comp.displayName}</option>)}
              </select>
            </div>
          )}
          
          <div>
            <label htmlFor="url" className="block text-sm font-medium text-slate-300">Data URL (auto-filled from selection)</label>
            <input type="text" id="url" value={url} readOnly className={`${commonInputStyle} bg-slate-200 text-slate-700`} placeholder="Select game data above to populate URL"/>
          </div>
          <div>
            <label htmlFor="stake" className="block text-sm font-medium text-slate-300">Stake Amount (USDC)</label>
            <input type="text" id="stake" value={stake} onChange={(e) => setStake(e.target.value)} required className={commonInputStyle} placeholder="10.0"/>
          </div>
          <div className="flex items-center">
            <input type="checkbox" id="makerExpectsTrue" checked={makerExpectsTrue} onChange={(e) => setMakerExpectsTrue(e.target.checked)} className="h-4 w-4 text-sky-600 border-slate-300 rounded focus:ring-sky-500" />
            <label htmlFor="makerExpectsTrue" className="ml-2 block text-sm text-slate-300">I expect the selected competitor to WIN (outcome is 'true')</label>
          </div>
          
          <div className="space-y-3 pt-2">
            <button 
              type="button" 
              onClick={handleApproveMax} 
              disabled={isApproving || isConfirmingApprovalTx || isMaxAllowanceSet || isCreatingMarket || isConfirmingMarketCreation}
              className={buttonStyle}
            >
              {isApproving ? 'Sending Max Approval...' : 
               (isConfirmingApprovalTx ? 'Confirming Max Approval...' : 
               (isMaxAllowanceSet ? 'Max USDC Approved' : '1. Approve Max USDC Spend'))}
            </button>
            <button 
              type="button" 
              onClick={handleCreateMarket} 
              disabled={!hasSufficientAllowance || isCreatingMarket || isConfirmingMarketCreation || isApproving || isConfirmingApprovalTx || !url || !stake}
              className={buttonStyle}
            >
              {isCreatingMarket ? 'Submitting Market...' : (isConfirmingMarketCreation ? 'Waiting for Confirmation...' : '2. Create Market')}
            </button>
          </div>
        </form>
      )}
      {status && <p className={`text-center p-2 mt-4 rounded-md ${marketCreationConfirmationError || approvalTxConfirmationError ? 'bg-red-700 text-red-100' : (isMarketCreated || isApprovalTxConfirmed ? 'bg-green-700 text-green-100' : 'bg-sky-700 text-sky-100')}`}>{status}</p>}
      {(approveHash && !isApprovalTxConfirmed) && <p className="text-xs text-center text-slate-400 mt-2">Approval Tx: {approveHash}</p>}
      {(createMarketHash && !isMarketCreated) && <p className="text-xs text-center text-slate-400 mt-2">Create Market Tx: {createMarketHash}</p>}
    </div>
  );
}

export default CreateMarketPage; 