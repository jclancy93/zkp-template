import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox-viem";
import "hardhat-chai-matchers-viem";

import dotenv from 'dotenv'; 
dotenv.config({ path: '../../.env' });

import fs from 'fs';
import path from 'path';

import { task } from "hardhat/config";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const BASE_SEPOLIA_RECLAIM_CONTRACT_ADDRESS = "0xF90085f5Fd1a3bEb8678623409b3811eCeC5f6A5";

task("deploy-verify-base-sepolia", "Deploys the Verify contract to the Base Sepolia network")
  .setAction(async (taskArgs: any, hre: HardhatRuntimeEnvironment) => {
    console.log("Deploying Claims library to Base Sepolia network...");
    // Deploy the Claims library first
    // The name used here should be the fully qualified name if it's from an external package
    const claimsLibrary = await hre.viem.deployContract("@reclaimprotocol/verifier-solidity-sdk/contracts/Claims.sol:Claims");
    console.log(`Claims library deployed to: ${claimsLibrary.address}`);

    console.log("Deploying Verify contract to Base Sepolia network...");
    // Deploy the Verify contract and link the Claims library
    const verifyContract = await hre.viem.deployContract("Verify", [BASE_SEPOLIA_RECLAIM_CONTRACT_ADDRESS], {
      libraries: {
        // The key here must match the fully qualified name of the library as expected by Hardhat
        "@reclaimprotocol/verifier-solidity-sdk/contracts/Claims.sol:Claims": claimsLibrary.address
      }
    });

    console.log(`Verify contract deployed to: ${verifyContract.address}`);

    // Wait for a few seconds before attempting verification to allow Etherscan to index the contract
    console.log("Waiting for 30 seconds before attempting Etherscan verification...");
    await new Promise(resolve => setTimeout(resolve, 30000)); // 30 seconds delay

    try {
      console.log("Attempting Etherscan (Basescan) verification...");
      await hre.run("verify:verify", {
        address: verifyContract.address,
        constructorArguments: [BASE_SEPOLIA_RECLAIM_CONTRACT_ADDRESS],
        libraries: {
          // The library name here should match how it's linked in the Verify contract.
          // Assuming it is just 'Claims' based on common usage with external libraries.
          // If Verify.sol imports it as, for example, `import {Claims as ClaimsLib} ...`, 
          // then this key should be 'ClaimsLib'.
          "Claims": claimsLibrary.address 
        },
        contract: "src/Verify.sol:Verify" // Adjusted fully qualified name
      });
      console.log("Etherscan verification successful.");
    } catch (error) {
      console.error("Etherscan verification failed:", error);
    }

    // Update .env file with the new contract address
    const envFilePath = path.resolve(__dirname, '../../.env');
    const envVarNameBase = "BASE_SEPOLIA_VERIFY_CONTRACT_ADDRESS";
    const envVarNameVite = "VITE_BASE_SEPOLIA_VERIFY_CONTRACT_ADDRESS";
    const newEnvEntryBase = `${envVarNameBase}=${verifyContract.address}`;
    const newEnvEntryVite = `${envVarNameVite}=${verifyContract.address}`;
    
    console.log(`Attempting to update .env file at: ${envFilePath} with ${newEnvEntryBase} and ${newEnvEntryVite}`);

    try {
      let existingContent = "";
      if (fs.existsSync(envFilePath)) {
        existingContent = fs.readFileSync(envFilePath, 'utf8');
      }
      // Split by regex to handle both \n and \r\n, preserving empty strings from multiple newlines
      const originalLines = existingContent.split(/\r?\n/);

      const newFileLines: string[] = [];
      let baseVarWritten = false;
      let viteVarWritten = false;

      for (const line of originalLines) {
        // Trim the line only for the purpose of checking the prefix
        const trimmedLineForCheck = line.trim(); 
        
        if (trimmedLineForCheck.startsWith(`${envVarNameBase}=`)) {
          if (!baseVarWritten) { // Write the new base var only once
            newFileLines.push(newEnvEntryBase);
            baseVarWritten = true;
          }
          // Old base var line is skipped (not added to newFileLines)
        } else if (trimmedLineForCheck.startsWith(`${envVarNameVite}=`)) {
          if (!viteVarWritten) { // Write the new vite var only once
            newFileLines.push(newEnvEntryVite);
            viteVarWritten = true;
          }
          // Old vite var line is skipped
        } else {
          newFileLines.push(line); // Preserve other lines (including comments, empty lines exactly as they were)
        }
      }

      // If the target variables were not found in the existing lines (e.g., .env was empty or didn't contain them), 
      // add them to the end of the new content.
      if (!baseVarWritten) {
        newFileLines.push(newEnvEntryBase);
      }
      if (!viteVarWritten) {
        newFileLines.push(newEnvEntryVite);
      }
      
      // Join the lines and add a final newline if there's content (mimicking original good behavior)
      const outputContent = newFileLines.join('\n') + (newFileLines.length > 0 ? '\n' : '');
      fs.writeFileSync(envFilePath, outputContent, 'utf8');

      console.log(`.env file updated successfully: ${newEnvEntryBase} and ${newEnvEntryVite} written to ${envFilePath}`);

    } catch (error) {
      console.error(`Failed to update .env file:`, error);
    }

    return verifyContract.address;
  });

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      },
      viaIR: false
    }
  },
  paths: {
    sources: "./src",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  networks: {
    baseSepolia: {
      url: process.env.BASE_SEPOLIA_RPC_URL,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY || ''],
    },
  },
  etherscan: {
    // To verify contracts on Basescan (Base Sepolia Explorer)
    // You need to obtain an API key from https://basescan.org/
    apiKey: {
        baseSepolia: process.env.ETHERSCAN_API_KEY || ''
    },
    customChains: [
      {
        network: "baseSepolia",
        chainId: 84532,
        urls: {
          apiURL: "https://api-sepolia.basescan.org/api",
          browserURL: "https://sepolia.basescan.org"
        }
      }
    ]
  },
};

export default config;
