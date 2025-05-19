import hre from "hardhat";

async function main() {
  const usdcAddress = "0x036cbd53842c5426634e7929541ec2318f3dcf7e"; // Base Sepolia USDC
  const reclaimVerifierAddress = "0xF90085f5Fd1a3bEb8678623409b3811eCeC5f6A5"; // Base Sepolia Reclaim Verifier

  console.log("Deploying Claims library...");
  const claimsLib = await hre.viem.deployContract("Claims");
  console.log(`Claims library deployed to: ${claimsLib.address}`);

  console.log("Deploying BettingMarket contract...");
  const bettingMarket = await hre.viem.deployContract("BettingMarket", 
    [usdcAddress, reclaimVerifierAddress],
    {
      libraries: {
        "@reclaimprotocol/verifier-solidity-sdk/contracts/Claims.sol:Claims": claimsLib.address,
      }
    }
  );

  console.log(`BettingMarket contract deployed to: ${bettingMarket.address}`);
  console.log("Waiting for 5 confirmations before attempting verification...");

  // Get the deployment transaction details using getDeploymentTransaction()
  // const deploymentTransaction = await bettingMarket.();
  // if (!deploymentTransaction) {
  //   console.error("Could not get deployment transaction details using getDeploymentTransaction().");
  //   return;
  // }
  // const deployTxHash = deploymentTransaction.hash;

  // // Correct way to wait for confirmations using the transaction hash with Viem/Hardhat
  // const publicClient = await hre.viem.getPublicClient();
  // await publicClient.waitForTransactionReceipt({ hash: deployTxHash, confirmations: 5 });

  console.log("Confirmed! Attempting to verify contract on Basescan...");

  try {
    await hre.run("verify:verify", {
      address: bettingMarket.address,
      constructorArguments: [
        usdcAddress,
        reclaimVerifierAddress
      ],
      libraries: {
        "@reclaimprotocol/verifier-solidity-sdk/contracts/Claims.sol:Claims": claimsLib.address,
      },
    });
    console.log("BettingMarket contract verified successfully!");
  } catch (error) {
    console.error("Verification failed:", error);
    console.log("If verification failed, you can manually verify on Basescan using the contract address and ABI.");
    console.log(`Address: ${bettingMarket.address}`);
    console.log(`Constructor Arguments (USDC, ReclaimVerifier): ${usdcAddress}, ${reclaimVerifierAddress}`);
    console.log(`Claims Library Address: ${claimsLib.address}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}); 