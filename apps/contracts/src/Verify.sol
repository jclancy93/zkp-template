// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.4;
import { Reclaim }        from "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";
import { Claims }        from "@reclaimprotocol/verifier-solidity-sdk/contracts/Claims.sol";

contract Verify {
    address public immutable reclaimAddress;

    event PriceVerified(string price);

    constructor(address _reclaimAddress) {
        require(
            _reclaimAddress != address(0),
            "Reclaim address should not be 0"
        );

        reclaimAddress = _reclaimAddress;
    }

    function verify(Reclaim.Proof memory proof) public {
        Reclaim(reclaimAddress).verifyProof(proof);
        string memory parametersJson = proof.claimInfo.context;
        string memory price = Claims.extractFieldFromContext(parametersJson, '"price":"');
        emit PriceVerified(price);
    }
}
