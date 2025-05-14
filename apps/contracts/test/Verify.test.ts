import { expect } from "chai";
import { keccak256, toHex, Hex } from "viem";
import hre from "hardhat";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox-viem/network-helpers";


// Define the ReclaimProof interface based on the user's function and common structure
interface ReclaimProofClaim {
  identifier: Hex; // bytes32
  owner: Hex; // address
  timestampS: number; // Corresponds to uint64
  epoch: number; // Corresponds to uint32
}

interface ReclaimProofSignedClaim {
  claim: ReclaimProofClaim;
  signatures: Hex[]; // bytes[]
}

interface ReclaimProofClaimInfo {
  provider: string;
  parameters: string; // JSON string
  context: string; // JSON string
}

interface ReclaimProof {
  claimInfo: ReclaimProofClaimInfo;
  signedClaim: ReclaimProofSignedClaim;
}

function createMockProof(price: string): ReclaimProof {

  return {
      "claimInfo": {
        "context": `{\"extractedParameters\":{\"price\":\"${price}\"},\"providerHash\":\"0x5dbe58ad866070178af5c86d8caac49014934f9499a5ebd9599961325bfc347d\"}`,
        "parameters": "{\"body\":\"\",\"method\":\"GET\",\"responseMatches\":[{\"type\":\"regex\",\"value\":\"\\\\{\\\"ethereum\\\":\\\\{\\\"usd\\\":(?<price>[\\\\d\\\\.]+)\\\\}\\\\}\"}],\"responseRedactions\":[],\"url\":\"https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd\"}",
        "provider": "http"
      },
      "signedClaim": {
        "claim": {
          "epoch": 1,
          "identifier": "0x9258a9acaf4f0e52fefd0c2c57841d7f2e4c0e608a2b5ddc470780ee83f5bce7",
          "owner": "0xf4cff9ef6cfb9bb664238b636573f9f6c1206c40",
          "timestampS": 1747227711
        },
        "signatures": [
          "0x90f53215a4491ec437c05ff928eb2987b57105693acd1b223e7e30426813b2ea3a3b28f4aeeafc0ba4dabfdfee02304c92716c9764c71c18b5f88a37596a587c1c"
        ]
      }
  };
}

async function deployBettingMarketFixture() {
  // Get signers
  const [owner] = await hre.viem.getWalletClients();

  // Deploy mock ZkTLS verifier (which acts as Reclaim verifier in tests)
  const MockZkTLS = await hre.viem.deployContract("MockZkTLS", []);

  // Deploy Claims library
  const ClaimsLib = await hre.viem.deployContract("Claims");

  // Deploy BettingMarket contract
  const Verify = await hre.viem.deployContract("Verify", 
    [ MockZkTLS.address],
    {
      libraries: {
        "@reclaimprotocol/verifier-solidity-sdk/contracts/Claims.sol:Claims": ClaimsLib.address,
      }
    }
  );

  return { Verify, MockZkTLS, ClaimsLib, owner };
}

describe("Verify Contract", function () {
  describe("verify", function () {
    it("should emit PriceVerified event on successful verification", async function () {
      const { Verify } = await loadFixture(deployBettingMarketFixture);
      const testPriceString = "2615.58"; // The string value that Verify.sol will extract
      const mockProof = createMockProof(testPriceString);
      
      await expect(Verify.write.verify([mockProof]))
        .to.emit(Verify, "PriceVerified")
        .withArgs(testPriceString); 
    });
  });
});
