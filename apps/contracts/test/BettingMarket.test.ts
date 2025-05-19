import { expect } from "chai";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";
import { getAddress, parseUnits, keccak256, toHex } from "viem";
import { time } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";

// Define the type for the Bet struct returned by the contract (aligned with BettingMarket.sol)
type Bet = {
  maker: `0x${string}`;
  taker: `0x${string}`;
  stake: bigint;
  urlHash: `0x${string}`;
  expiryTs: bigint;
  makerExpectsTrue: boolean;
  state: bigint;
};

// Define the type for Reclaim.Proof (mirroring Solidity struct for tests)
type ReclaimProof = {
  claimInfo: {
    provider: string;
    parameters: string;
    context: string;
  };
  signedClaim: {
    claim: {
      identifier: `0x${string}`;
      owner: `0x${string}`;
      timestampS: number;
      epoch: number;
    };
    signatures: readonly `0x${string}`[];
  };
};

// Helper function to correctly cast the result from contract.read.bets
// Assuming data is [maker, taker, stake, urlHash, expiryTs, makerExpectsTrue, state (as number from read)]
function castToBet(data: readonly [`0x${string}`, `0x${string}`, bigint, `0x${string}`, bigint, boolean, number]): Bet {
  return {
    maker: data[0],
    taker: data[1],
    stake: data[2],
    urlHash: data[3],
    expiryTs: data[4],
    makerExpectsTrue: data[5],
    state: BigInt(data[6])
  };
}

describe("BettingMarket", function () {
  // We define a fixture to reuse the same setup in every test
  async function deployBettingMarketFixture() {
    // Get signers
    const [owner, maker, taker, other] = await hre.viem.getWalletClients();

    // Deploy mock USDC token
    const MockERC20 = await hre.viem.deployContract("MockERC20", ["USDC Test", "USDC", 6]);

    // Deploy mock ZkTLS verifier (which acts as Reclaim verifier in tests)
    const MockZkTLS = await hre.viem.deployContract("MockProof", []);

    // Deploy Claims library
    const ClaimsLib = await hre.viem.deployContract("Claims");

    // Deploy BettingMarket contract
    const BettingMarket = await hre.viem.deployContract("BettingMarket", 
      [MockERC20.address, MockZkTLS.address],
      {
        libraries: {
          "@reclaimprotocol/verifier-solidity-sdk/contracts/Claims.sol:Claims": ClaimsLib.address,
        }
      }
    );

    // Mint some USDC to maker and taker
    const mintAmount = parseUnits("10000", 6); // 10,000 USDC
    await MockERC20.write.mint([maker.account.address, mintAmount]);
    await MockERC20.write.mint([taker.account.address, mintAmount]);

    // Approve BettingMarket to spend USDC
    await MockERC20.write.approve([BettingMarket.address, mintAmount], { account: maker.account });
    await MockERC20.write.approve([BettingMarket.address, mintAmount], { account: taker.account });

    return { BettingMarket, MockERC20, MockZkTLS, owner, maker, taker, other };
  }

  // Helper function to create a market with proper expiry
  async function getExpiryTimestamp() {
    const currentTimestamp = BigInt(await time.latest());
    return currentTimestamp + 3600n + 60n; // Current time + 1 hour + 1 minute (to be safe)
  }

  // Test market creation
  describe("Market Creation", function () {
    it("Should allow a maker to create a market", async function () {
      const { BettingMarket, MockERC20, maker } = await loadFixture(deployBettingMarketFixture);
      
      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      const makerStake = parseUnits("100", 6); // 100 USDC
      const expiryTs = await getExpiryTimestamp();
      const expectedUrlHash = keccak256(toHex(url));

      // Create market
      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Check market was created correctly
      const rawBetData = await BettingMarket.read.bets([marketId]);
      const bet = castToBet(rawBetData);
      expect(bet.maker).to.equal(getAddress(maker.account.address));
      expect(bet.stake).to.equal(makerStake);
      expect(bet.urlHash).to.equal(expectedUrlHash);
      expect(bet.makerExpectsTrue).to.equal(true);
      expect(bet.state).to.equal(0n); // State.Open

      // Check USDC was transferred
      const contractBalance = await MockERC20.read.balanceOf([BettingMarket.address]);
      expect(contractBalance).to.equal(makerStake);
    });

    it("Should not allow creating a market with an existing ID", async function () {
      const { BettingMarket, maker } = await loadFixture(deployBettingMarketFixture);
      
      const marketId = 2n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      const makerStake = parseUnits("100", 6); // 100 USDC
      const expiryTs = await getExpiryTimestamp();

      // Create first market
      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Try to create another market with same ID
      await expect(
        BettingMarket.write.createMarket(
          [marketId, url, makerStake, expiryTs, true],
          { account: maker.account }
        )
      ).to.be.rejectedWith("id taken");
    });

    it("Should not allow invalid parameters when creating a market", async function () {
      const { BettingMarket, maker } = await loadFixture(deployBettingMarketFixture);
      
      const marketId = 3n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      const makerStake = parseUnits("100", 6); // 100 USDC
      const expiryTs = await getExpiryTimestamp();

      // Test zero stake
      await expect(
        BettingMarket.write.createMarket(
          [marketId, url, 0n, expiryTs, true], // Zero stake
          { account: maker.account }
        )
      ).to.be.rejectedWith("stake zero");
      
      // Invalid expiry (too soon)
      const currentTimestamp = BigInt(await time.latest());
      const tooSoonExpiryTs = currentTimestamp + 600n; // Just 10 minutes in the future
      // Need a unique marketId for this test case if previous one could have been created
      const marketIdForExpiryTest = 4n; 
      await expect(
        BettingMarket.write.createMarket(
          [marketIdForExpiryTest, url, makerStake, tooSoonExpiryTs, true],
          { account: maker.account }
        )
      ).to.be.rejectedWith("expiry soon");
    });
  });

  // Test market taking
  describe("Market Taking", function () {
    it("Should allow a taker to take a market", async function () {
      const { BettingMarket, MockERC20, maker, taker } = await loadFixture(deployBettingMarketFixture);
      
      // Create market
      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      const makerStake = parseUnits("100", 6); // 100 USDC
      const expiryTs = await getExpiryTimestamp();

      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Calculate taker stake: must match maker's stake as per BettingMarket.sol
      const takerStake = makerStake;

      // Take market
      await BettingMarket.write.takeMarket([marketId, takerStake], { account: taker.account });

      // Check market was taken correctly
      const rawBetData = await BettingMarket.read.bets([marketId]);
      const bet = castToBet(rawBetData);
      expect(bet.taker).to.equal(getAddress(taker.account.address));
      expect(bet.state).to.equal(1n); // State.Filled

      // Check USDC was transferred
      const contractBalance = await MockERC20.read.balanceOf([BettingMarket.address]);
      expect(contractBalance).to.equal(makerStake + takerStake);
    });

    it("Should not allow taking a market with incorrect stake", async function () {
      const { BettingMarket, maker, taker } = await loadFixture(deployBettingMarketFixture);
      
      // Create market
      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      const makerStake = parseUnits("100", 6); // 100 USDC
      const expiryTs = await getExpiryTimestamp();

      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Incorrect taker stake
      const incorrectTakerStake = parseUnits("50", 6); // Should be 100 USDC

      // Try to take market with incorrect stake
      await expect(
        BettingMarket.write.takeMarket([marketId, incorrectTakerStake], { account: taker.account })
      ).to.be.rejectedWith("stake mismatch"); // Error message from BettingMarket.sol
    });

    it("Should not allow taking a market that is not open", async function () {
      const { BettingMarket, maker, taker } = await loadFixture(deployBettingMarketFixture);
      
      // Create market
      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      const makerStake = parseUnits("100", 6); // 100 USDC
      const expiryTs = await getExpiryTimestamp();

      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Calculate taker stake
      const takerStake = makerStake;

      // Take market
      await BettingMarket.write.takeMarket([marketId, takerStake], { account: taker.account });

      // Try to take market again
      await expect(
        BettingMarket.write.takeMarket([marketId, takerStake], { account: taker.account })
      ).to.be.rejectedWith("not open");
    });
  });

  // Test market settlement
  describe("Market Settlement", function () {
    // Helper function to create a mock proof
    function createMockProof(url: string, makerAddress: `0x${string}`, winnerStatus: boolean): ReclaimProof {
      // SIMPLIFIED CONTEXT STRING for debugging
      const theWinnerStr = winnerStatus ? "true" : "false";
      const contextString = `{"url":"${url}","theWinner":"${theWinnerStr}"}`; // No more nested JSON

      return {
        claimInfo: {
          provider: "https", 
          parameters: `{"url":"${url}"}`,
          context: contextString,
        },
        signedClaim: {
          claim: {
            identifier: keccak256(toHex(`mock-template-id-${url}-${Date.now()}`)), 
            owner: makerAddress, 
            timestampS: Math.floor(Date.now() / 1000),
            epoch: 0,
          },
          signatures: [toHex("mockSignature")], 
        },
      };
    }
    
    it("Should allow settling a filled market with maker winning", async function () {
      const { BettingMarket, MockERC20, maker, taker } = await loadFixture(deployBettingMarketFixture);
      
      // Create market
      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02"; // Maker implicitly bets on this URL outcome
      const makerStake = parseUnits("100", 6); 
      const expiryTs = await getExpiryTimestamp();

      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Calculate taker stake
      const takerStake = makerStake;

      // Take market
      await BettingMarket.write.takeMarket([marketId, takerStake], { account: taker.account });

      // Settle market: maker wins (the outcome in URL is "true")
      const proofForMakerWin = createMockProof(url, maker.account.address, true);
      
      const makerInitialBalance = await MockERC20.read.balanceOf([maker.account.address]);
      
      await BettingMarket.write.settle([marketId, proofForMakerWin], {
        account: maker.account // Anyone can call settle if proof is valid
      });

      // Check market was settled correctly
      const rawBetData = await BettingMarket.read.bets([marketId]);
      const bet = castToBet(rawBetData);
      expect(bet.state).to.equal(2n); // State.Settled

      // Check winner received the pool
      const makerFinalBalance = await MockERC20.read.balanceOf([maker.account.address]);
      const pool = makerStake + takerStake;
      expect(makerFinalBalance - makerInitialBalance).to.equal(pool);
    });

    it("Should pay the taker when they win", async function () {
      const { BettingMarket, MockERC20, maker, taker } = await loadFixture(deployBettingMarketFixture);
      
      // Create market
      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02"; // Maker implicitly bets on this URL outcome
      const makerStake = parseUnits("100", 6);
      const expiryTs = await getExpiryTimestamp();

      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Calculate taker stake
      const takerStake = makerStake;

      // Take market
      await BettingMarket.write.takeMarket([marketId, takerStake], { account: taker.account });

      // Settle market: taker wins (the outcome in URL is "false")
      const proofForTakerWin = createMockProof(url, maker.account.address, false); // maker address still owner of claim, but outcome is false

      const takerInitialBalance = await MockERC20.read.balanceOf([taker.account.address]);
      
      await BettingMarket.write.settle([marketId, proofForTakerWin], {
        account: taker.account // Anyone can call settle
      });

      // Check market was settled correctly
      const rawBetData = await BettingMarket.read.bets([marketId]);
      const bet = castToBet(rawBetData);
      expect(bet.state).to.equal(2n); // State.Settled

      // Check winner received the pool
      const takerFinalBalance = await MockERC20.read.balanceOf([taker.account.address]);
      const pool = makerStake + takerStake;
      expect(takerFinalBalance - takerInitialBalance).to.equal(pool);
    });

    it("Should allow settling when maker expects false and outcome is false (maker wins)", async function () {
      const { BettingMarket, MockERC20, maker, taker } = await loadFixture(deployBettingMarketFixture);
      
      const marketId = 2n; // Use a different marketId
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-03"; // Different URL for clarity
      const makerStake = parseUnits("50", 6); 
      const expiryTs = await getExpiryTimestamp();

      // Create market with maker expecting the outcome to be false
      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, false], // makerExpectsTrue = false
        { account: maker.account }
      );

      const takerStake = makerStake;
      await BettingMarket.write.takeMarket([marketId, takerStake], { account: taker.account });

      // Settle market: outcome in URL is "false", maker expected "false"
      const proofForMakerWinExpectingFalse = createMockProof(url, maker.account.address, false);
      
      const makerInitialBalance = await MockERC20.read.balanceOf([maker.account.address]);
      
      await BettingMarket.write.settle([marketId, proofForMakerWinExpectingFalse], {
        account: maker.account 
      });

      const rawBetData = await BettingMarket.read.bets([marketId]);
      const bet = castToBet(rawBetData as any); // Cast to any to bypass potential stale type errors
      expect(bet.state).to.equal(2n); // State.Settled
      expect(bet.makerExpectsTrue).to.equal(false);

      const makerFinalBalance = await MockERC20.read.balanceOf([maker.account.address]);
      const pool = makerStake + takerStake;
      expect(makerFinalBalance - makerInitialBalance).to.equal(pool);
    });

    it("Should pay taker when maker expects false and outcome is true (taker wins)", async function () {
      const { BettingMarket, MockERC20, maker, taker } = await loadFixture(deployBettingMarketFixture);
      
      const marketId = 3n; // Use a different marketId
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-04"; // Different URL
      const makerStake = parseUnits("75", 6);
      const expiryTs = await getExpiryTimestamp();

      // Create market with maker expecting the outcome to be false
      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, false], // makerExpectsTrue = false
        { account: maker.account }
      );

      const takerStake = makerStake;
      await BettingMarket.write.takeMarket([marketId, takerStake], { account: taker.account });

      // Settle market: outcome in URL is "true", maker expected "false"
      const proofForTakerWinWhenMakerExpectsFalse = createMockProof(url, maker.account.address, true);

      const takerInitialBalance = await MockERC20.read.balanceOf([taker.account.address]);
      
      await BettingMarket.write.settle([marketId, proofForTakerWinWhenMakerExpectsFalse], {
        account: taker.account 
      });

      const rawBetData = await BettingMarket.read.bets([marketId]);
      const bet = castToBet(rawBetData as any); // Cast to any to bypass potential stale type errors
      expect(bet.state).to.equal(2n); // State.Settled
      expect(bet.makerExpectsTrue).to.equal(false);

      const takerFinalBalance = await MockERC20.read.balanceOf([taker.account.address]);
      const pool = makerStake + takerStake;
      expect(takerFinalBalance - takerInitialBalance).to.equal(pool);
    });

    it("Should not allow settling a market that is not filled", async function () {
      const { BettingMarket, maker } = await loadFixture(deployBettingMarketFixture);
      
      // Create market
      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      const makerStake = parseUnits("100", 6);
      const expiryTs = await getExpiryTimestamp();

      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Try to settle market that hasn't been taken
      const proofForSettlement = createMockProof(url, maker.account.address, true);

      await expect(
        BettingMarket.write.settle([marketId, proofForSettlement], {
          account: maker.account
        })
      ).to.be.rejectedWith("bad state");
    });

    it("Should not settle a market if url does not match", async function () {
      const { BettingMarket, maker, taker } = await loadFixture(deployBettingMarketFixture);

      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      const makerStake = parseUnits("100", 6);
      const expiryTs = await getExpiryTimestamp();

      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      const takerStake = makerStake;
      await BettingMarket.write.takeMarket([marketId, takerStake], { account: taker.account });

      const proofForSettlement = createMockProof('https://google.com', maker.account.address, true);

      await expect(
        BettingMarket.write.settle([marketId, proofForSettlement], {
          account: maker.account
        })
      ).to.be.rejectedWith("Reclaim: URL mismatch");
    });
  });

  // Test market cancellation
  describe("Market Cancellation", function () {
    it("Should allow a maker to cancel their own open market", async function () {
      const { BettingMarket, MockERC20, maker } = await loadFixture(deployBettingMarketFixture);
      
      // Create market
      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      const makerStake = parseUnits("100", 6);
      const expiryTs = await getExpiryTimestamp();

      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Maker cancels market
      const makerInitialBalance = await MockERC20.read.balanceOf([maker.account.address]);
      
      await BettingMarket.write.cancel([marketId], { account: maker.account });

      // Check market was cancelled
      const rawBetData = await BettingMarket.read.bets([marketId]);
      const bet = castToBet(rawBetData);
      expect(bet.state).to.equal(3n); // State.Cancelled

      // Check maker received their stake back
      const makerFinalBalance = await MockERC20.read.balanceOf([maker.account.address]);
      expect(makerFinalBalance - makerInitialBalance).to.equal(makerStake);
    });

    it("Should not allow non-maker to cancel an open market", async function () {
      const { BettingMarket, maker, taker } = await loadFixture(deployBettingMarketFixture);
      
      // Create market
      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      const makerStake = parseUnits("100", 6);
      const expiryTs = await getExpiryTimestamp();

      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Taker tries to cancel market
      await expect(
        BettingMarket.write.cancel([marketId], { account: taker.account })
      ).to.be.rejectedWith("no refund"); // Error from contract logic
    });

    it("Should allow refunds after expiry + 1 day for filled markets", async function () {
      const { BettingMarket, MockERC20, maker, taker } = await loadFixture(deployBettingMarketFixture);
      
      // Create market
      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      const makerStake = parseUnits("100", 6);
      const expiryTs = await getExpiryTimestamp();

      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Calculate taker stake
      const takerStake = makerStake;

      // Take market
      await BettingMarket.write.takeMarket([marketId, takerStake], { account: taker.account });

      // Record initial balances
      const makerInitialBalance = await MockERC20.read.balanceOf([maker.account.address]);
      const takerInitialBalance = await MockERC20.read.balanceOf([taker.account.address]);

      // Advance time to expiry + 1 day
      await time.increaseTo(expiryTs + 24n * 3600n + 1n);

      // Cancel market for refund (maker or taker can initiate this if conditions met)
      await BettingMarket.write.cancel([marketId], { account: maker.account });

      // Check market was cancelled
      const rawBetData = await BettingMarket.read.bets([marketId]);
      const bet = castToBet(rawBetData);
      expect(bet.state).to.equal(3n); // State.Cancelled

      // Check maker and taker received their stakes back
      const makerFinalBalance = await MockERC20.read.balanceOf([maker.account.address]);
      const takerFinalBalance = await MockERC20.read.balanceOf([taker.account.address]);
      
      expect(makerFinalBalance - makerInitialBalance).to.equal(makerStake);
      expect(takerFinalBalance - takerInitialBalance).to.equal(takerStake);
    });

    it("Should not allow refunds before expiry + 1 day for filled markets", async function () {
      const { BettingMarket, maker, taker } = await loadFixture(deployBettingMarketFixture);
      
      // Create market
      const marketId = 1n;
      const url = "https://site.api.espn.com/apis/v2/sports/nba/scoreboard?dates=2025-05-02";
      // makerPick, oddsNum, oddsDen removed
      const makerStake = parseUnits("100", 6); // 100 USDC
      const expiryTs = await getExpiryTimestamp();

      await BettingMarket.write.createMarket(
        [marketId, url, makerStake, expiryTs, true],
        { account: maker.account }
      );

      // Calculate taker stake
      const takerStake = makerStake;

      // Take market
      await BettingMarket.write.takeMarket([marketId, takerStake], { account: taker.account });

      // Advance time to expiry but not + 1 day
      await time.increaseTo(expiryTs + 3600n); // just past expiry

      // Try to cancel market for refund
      await expect(
        BettingMarket.write.cancel([marketId], { account: maker.account })
      ).to.be.rejectedWith("wait"); // "wait for expiry period to pass"
    });
  });
}); 