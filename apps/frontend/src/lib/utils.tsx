import type { JSX } from "react";
import type { MarketDetails } from "../pages/OpenMarketsPage";

export const getGameDisplayString = (market: MarketDetails): string => {
  let gameDisplay = market.eventName || 'Event details unavailable';
  let gameDateStr = '';
  if (market.eventDate) {
    try {
      gameDateStr = ` (${new Date(market.eventDate).toLocaleDateString()})`;
    } catch (e) { /* ignore date parsing error */ }
  }

  if (market.betOnCompetitorName && market.opponentName && market.eventName && !market.eventName.includes(market.betOnCompetitorName) && !market.eventName.includes(market.opponentName)) {
    gameDisplay = `${market.betOnCompetitorName} vs ${market.opponentName}${gameDateStr}`;
  } else if (market.eventName) {
    gameDisplay = `${market.eventName}${gameDateStr}`;
  } else if (market.betOnCompetitorName && market.opponentName) {
    gameDisplay = `${market.betOnCompetitorName} vs ${market.opponentName}${gameDateStr}`;
  } else if (market.betOnCompetitorName) {
    gameDisplay = `Event involving ${market.betOnCompetitorName}${gameDateStr}`;
  } else {
    gameDisplay += gameDateStr;
  }
  return gameDisplay;
};

export const getWinnerDisplay = (market: MarketDetails): JSX.Element | null => {
  if (market.state === 2) {
    if (market.winnerAddress) {
      if (market.winnerAddress.toLowerCase() === market.maker.toLowerCase()) {
        return <p className="text-sm text-green-400 font-semibold">Outcome: Maker Won!</p>;
      } else if (market.taker !== '0x0000000000000000000000000000000000000000' && market.winnerAddress.toLowerCase() === market.taker.toLowerCase()) {
        return <p className="text-sm text-green-400 font-semibold">Outcome: Taker Won!</p>;
      } else {
        return <p className="text-sm text-green-400">Winner: {market.winnerAddress.substring(0,6)}...{market.winnerAddress.substring(market.winnerAddress.length - 4)}</p>;
      }
    } else {
      return <p className="text-sm text-green-400">Market Settled (Winner data pending)</p>;
    }
  }
  return null;
};
