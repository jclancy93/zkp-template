import express, { Request, Response } from 'express';
import cors from 'cors';
import { ReclaimClient } from '@reclaimprotocol/zk-fetch';
import { transformForOnchain, verifyProof } from '@reclaimprotocol/js-sdk';
import dotenv from 'dotenv';
dotenv.config({ path: '../../.env' });

// Initialize the ReclaimClient with the app id and app secret (you can get these from the Reclaim dashboard - https://dev.reclaimprotocol.org/)
const APP_ID = process.env.RECLAIM_APP_ID;
const APP_SECRET = process.env.RECLAIM_API_SECRET;
const reclaimClient = new ReclaimClient(APP_ID!, APP_SECRET!);

// Set API port and initialize express app
const PORT = process.env.PORT || 8080;
const app = express();

// CORS configuration
const corsOptions = {
  origin: '*',
  optionsSuccessStatus: 200 // For legacy browser support
};

// Start server
app.listen(PORT, () => {
  console.log(`App is listening on port ${PORT}`);
});

app.use(cors(corsOptions)); // Enable CORS with specific options

app.get('/', (_: Request, res: Response) => {
    res.send('gm gm! api is running');
});

app.get('/generateProof', async (_: Request, res: Response) => {
    try{
        // URL to fetch the data from - in this case, the price of Ethereum in USD from the CoinGecko API
        const url = 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd';

        /*    
        * Fetch the data from the API and generate a proof for the response. 
        * The proof will contain the USD price of Ethereum. 
        */ 
        const proof = await reclaimClient.zkFetch(url, {
          // public options for the fetch request 
          method: 'GET',
        }, {
          // options for the proof generation
          responseMatches: [
            {
                "type": "regex",
                "value": "\\{\"ethereum\":\\{\"usd\":(?<price>[\\d\\.]+)\\}\\}"
            }
          ],
        });
      
        if(!proof) {
          res.status(400).send('Failed to generate proof');
          return;
        }
        // Verify the proof
        const isValid = await verifyProof(proof);
        if(!isValid) {
          res.status(400).send('Proof is invalid');
          return;
        }
        // Transform the proof data to be used on-chain (for the contract)
        let proofData = await transformForOnchain(proof);
        res.status(200).json({ transformedProof: proofData, proof });
    }
    catch(e){
        console.log(e);
        res.status(500).send(e);
        return;
    }
})