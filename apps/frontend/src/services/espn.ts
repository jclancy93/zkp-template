import type { MarketDetails as FullMarketDetails } from '../pages/OpenMarketsPage'; // Import the full type

export const ESPN_API_BASE_CORE = 'https://sports.core.api.espn.com/v2/sports';
export const ESPN_API_BASE_SITE = 'https://site.api.espn.com/apis/site/v2/sports';

// Interfaces from OpenMarketsPage.tsx
export interface EspnTeamDetails { displayName: string; name: string; shortDisplayName: string; }
export interface EspnCompetitorEntry { id: string; team?: { $ref: string }; }
export interface EspnCompetitionDetails { competitors: EspnCompetitorEntry[]; event?: { $ref: string}; name?: string; shortName?: string; }
export interface EspnEventDetails { name: string; shortName: string; date: string; }

// Interfaces from CreateMarketPage.tsx
export interface EspnRef { $ref: string; }
export interface EspnResource { id: string; name?: string; slug?: string; $ref: string; shortName?: string; date?: string; }

export interface EspnScoreboardTeam {
    id: string;
    uid: string;
    location?: string;
    name?: string;
    abbreviation?: string;
    displayName?: string;
    shortDisplayName?: string;
    logo?: string;
}
export interface EspnScoreboardCompetitor {
    id: string;
    uid: string;
    type: string;
    order: number;
    homeAway: string;
    winner?: boolean;
    team: EspnScoreboardTeam;
    score?: string;
}
export interface EspnScoreboardCompetition {
    id: string;
    date: string;
    competitors: EspnScoreboardCompetitor[];
}
export interface EspnScoreboardEvent {
    id: string;
    date: string;
    name: string;
    shortName: string;
    competitions: EspnScoreboardCompetition[];
}

export interface AppEventFormat {
    id: string;
    name: string;
    date: string;
    competitionId: string;
    competitors: AppCompetitorFormat[];
}

export interface AppCompetitorFormat {
    id: string;
    displayName: string;
}


// Helper from OpenMarketsPage.tsx and CreateMarketPage.tsx (fetchJson is a more generic version)
export const fetchJson = async (url: string) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`API error ${response.status} for ${url}`);
    return response.json();
};

// Regex from OpenMarketsPage.tsx
export const espnUrlRegex = /\/sports\/([^\/]+)\/leagues\/([^\/]+)\/events\/([^\/]+)\/competitions\/([^\/]+)\/competitors\/([^\/]+)/;

// Use Omit on the imported FullMarketDetails type
export async function enrichMarketDetails(market: Omit<FullMarketDetails, 'eventName' | 'eventDate' | 'betOnCompetitorName' | 'opponentName' | 'winnerAddress' | 'betOnCompetitorId'>): Promise<FullMarketDetails> {
    const enrichedMarket = { ...market } as FullMarketDetails; // Cast to FullMarketDetails
    try {
        const match = market.url.match(espnUrlRegex);
        if (!match) return enrichedMarket; 

        const [, sportSlug, leagueSlug, eventId, competitionId, betOnCompetitorIdFromUrl] = match;
        // Initialize potentially undefined fields from FullMarketDetails
        enrichedMarket.betOnCompetitorId = betOnCompetitorIdFromUrl;
        enrichedMarket.eventName = undefined;
        enrichedMarket.eventDate = undefined;
        enrichedMarket.betOnCompetitorName = undefined;
        enrichedMarket.opponentName = undefined;

        try {
            const eventDetailsUrl = `${ESPN_API_BASE_CORE}/${sportSlug}/leagues/${leagueSlug}/events/${eventId}`;
            const eventData: EspnEventDetails = await fetchJson(eventDetailsUrl);
            enrichedMarket.eventName = eventData.name || eventData.shortName;
            enrichedMarket.eventDate = eventData.date;
        } catch (e) { console.warn(`Failed to fetch event details for ${market.url}`, e); }

        try {
            const competitionDetailsUrl = `${ESPN_API_BASE_CORE}/${sportSlug}/leagues/${leagueSlug}/events/${eventId}/competitions/${competitionId}`;
            const competitionData: EspnCompetitionDetails = await fetchJson(competitionDetailsUrl);

            if (competitionData.competitors && competitionData.competitors.length > 0) {
                for (const competitor of competitionData.competitors) {
                    if (competitor.team && competitor.team.$ref) {
                        try {
                            const teamData: EspnTeamDetails = await fetchJson(competitor.team.$ref);
                            const competitorName = teamData.displayName || teamData.shortDisplayName || teamData.name;
                            if (competitor.id === betOnCompetitorIdFromUrl) {
                                enrichedMarket.betOnCompetitorName = competitorName;
                            } else {
                                if (!enrichedMarket.opponentName) enrichedMarket.opponentName = competitorName;
                            }
                        } catch (e) { console.warn(`Failed to fetch team details for ${competitor.team.$ref}`, e); }
                    }
                }
            }
            if(!enrichedMarket.eventName && (competitionData.name || competitionData.shortName)) {
                enrichedMarket.eventName = competitionData.name || competitionData.shortName;
            }
        } catch (e) { console.warn(`Failed to fetch competition details for ${market.url}`, e); }

    } catch (e) {
        console.error(`Error enriching market ${market.id} from URL ${market.url}:`, e);
    }
    return enrichedMarket;
}


// fetchEspnData from CreateMarketPage.tsx
export const fetchEspnData = async (fetchUrl: string, loader?: (loading: boolean) => void, isScoreboardEvents: boolean = false,  setApiError?: (error: string | null) => void) => {
    if(loader) loader(true);
    if(setApiError) setApiError(null);
    try {
      const response = await fetch(fetchUrl);
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ESPN API error: ${response.status} ${errorText}`);
      }
      const data = await response.json();
      if(loader) loader(false);
      
      if (isScoreboardEvents) {
        return data.events || []; 
      }
      
      if (data.items && Array.isArray(data.items) && data.items.every((item: any) => item.$ref)) {
        const detailedItemsPromises = data.items.map(async (itemRef: EspnRef) => {
          const detailResponse = await fetch(itemRef.$ref);
          if (!detailResponse.ok) {
            const errorTextDetail = await detailResponse.text();
            throw new Error(`ESPN API detail error: ${detailResponse.status} for ${itemRef.$ref}. Details: ${errorTextDetail}`);
          }
          return await detailResponse.json();
        });
        return await Promise.all(detailedItemsPromises);
      } else {
        return data; 
      }
    } catch (e: any) {
      console.error(`Failed to fetch ${fetchUrl}:`, e);
      if(setApiError) setApiError(e.message);
      if(loader) loader(false);
      // When using React Query, it's better to let the error propagate
      // so useQuery can catch it and set its error state.
      throw e; // Re-throw the error
    }
  };
