// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

// Import the Reclaim contract to access the Reclaim.Proof struct definition
import { Reclaim } from "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";

contract MockZkTLS {
    // This function stubs the real Reclaim.verifyProof.
    // It now takes the correct Reclaim.Proof struct as an argument.
    // It should not revert, to simulate a successful verification.
    function verifyProof(Reclaim.Proof memory proof) external view { // 'view' is appropriate as it doesn't change state
        // No revert() here. An empty body (or just event emission)
        // means the proof is considered "verified" for the purpose of this mock.
    }
}
