// SPDX-License-Identifier: MIT
pragma solidity 0.8.4;

import { IERC20 }          from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 }       from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import { Reclaim }        from "@reclaimprotocol/verifier-solidity-sdk/contracts/Reclaim.sol";
import { Claims }        from "@reclaimprotocol/verifier-solidity-sdk/contracts/Claims.sol";

/**
 * Maker pastes:
 *   - HTTPS URL  (e.g. ESPN API for a specific competitor's win status)
 * The bet is implicitly that the competitor in the URL is the winner.
 */
contract BettingMarket is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ─── Immutable configuration ──────────────────────────────────────────
    IERC20  public immutable USDC;
    address public immutable reclaimAddress;

    // ─── Data model ───────────────────────────────────────────────────────
    enum State { Open, Filled, Settled, Cancelled }

    struct Bet {
        address maker;
        address taker;
        uint256 stake;           // Stake from maker, taker matches this (50/50 odds)
        bytes32 urlHash;         // keccak256(URL for the specific competitor's win status)
        uint64  expiryTs;        // unix ts when proof window closes
        bool    makerExpectsTrue; // New field: true if maker expects "theWinner":"true"
        State   state;
    }

    mapping(uint256 => Bet) public bets;

    // ─── Events ───────────────────────────────────────────────────────────
    event MarketCreated(
        uint256 indexed id,
        address indexed maker,
        uint256 stake,
        string  url,
        uint64  expiryTs,
        bool    makerExpectsTrue // New field
    );
    event MarketTaken(uint256 indexed id, address indexed taker, uint256 stake);
    event Settled(uint256 indexed id, address indexed winner);
    event Cancelled(uint256 indexed id);

    // ─── Helper: Unquote String ─────────────────────────────────────────── 
    /**
     * @dev Removes leading and trailing quotes from a string, if present.
     * e.g., ""value"" becomes "value".
     */
    function _unquote(string memory s) internal pure returns (string memory) {
        bytes memory b = bytes(s);
        if (b.length >= 2 && b[0] == '"' && b[b.length-1] == '"') {
            bytes memory new_b = new bytes(b.length - 2);
            for(uint i = 0; i < new_b.length; i++) {
                new_b[i] = b[i+1];
            }
            return string(new_b);
        }
        return s; // Return original if not quoted or too short
    }

    // ─── Constructor ──────────────────────────────────────────────────────
    constructor(address usdc, address _reclaimAddress) {
        USDC     = IERC20(usdc);
        reclaimAddress = _reclaimAddress;
    }

    // ─── Maker creates market ─────────────────────────────────────────────
    function createMarket(
        uint256 id,
        string  calldata url,
        uint256 stake,
        uint64  expiryTs,
        bool    makerExpectsTrue // New parameter
    ) external nonReentrant {
        require(bets[id].maker == address(0), "id taken");
        require(expiryTs > block.timestamp + 1 hours, "expiry soon");
        require(stake > 0, "stake zero");

        bytes32 calculatedUrlHash = keccak256(bytes(url));

        bets[id] = Bet({
            maker: msg.sender,
            taker: address(0),
            stake: stake,
            urlHash: calculatedUrlHash,
            expiryTs: expiryTs,
            makerExpectsTrue: makerExpectsTrue,
            state: State.Open
        });

        USDC.safeTransferFrom(msg.sender, address(this), stake);

        emit MarketCreated(
            id, msg.sender, stake,
            url,
            expiryTs,
            makerExpectsTrue
        );
    }

    // ─── Taker fills market ───────────────────────────────────────────────
    function takeMarket(uint256 id, uint256 takerStake) external nonReentrant {
        Bet storage b = bets[id];
        require(b.state == State.Open, "not open");

        require(takerStake == b.stake, "stake mismatch");

        b.taker = msg.sender;
        b.state = State.Filled;
        USDC.safeTransferFrom(msg.sender, address(this), takerStake);

        emit MarketTaken(id, msg.sender, takerStake);
    }

    // ─── Settle with Reclaim proof ─────────────────────────────────────────
    function settle(
        uint256 id,
        Reclaim.Proof memory proof
    ) external nonReentrant {
        Bet storage b = bets[id];
        require(b.state == State.Filled, "bad state");

        Reclaim(reclaimAddress).verifyProof(proof);

        // string memory contextJson = proof.claimInfo.context; // Old: URL was sought in context
        // console.log("settle: proof.claimInfo.context (raw)", contextJson);
        
        // New: URL is expected in proof.claimInfo.parameters
        string memory parametersJson = proof.claimInfo.parameters;
        string memory urlFromProof = Claims.extractFieldFromContext(parametersJson, '"url":"');
        require(keccak256(bytes(urlFromProof)) == b.urlHash, "Reclaim: URL mismatch");

        // Winner status is still expected from the context field
        string memory contextJson = proof.claimInfo.context;
        string memory winnerStatusStr = Claims.extractFieldFromContext(contextJson, '"theWinner":"');

        bytes32 hashTrue = keccak256(bytes("true"));
        bytes32 hashFalse = keccak256(bytes("false"));
        bytes32 hashWinnerStatus = keccak256(bytes(winnerStatusStr));

        address winner;
        bool outcomeIsTrue = (hashWinnerStatus == hashTrue);
        bool outcomeIsFalse = (hashWinnerStatus == hashFalse);

        // Ensure the extracted status is either "true" or "false"
        require(outcomeIsTrue || outcomeIsFalse, "Reclaim: unknown winner status string");

        if ((b.makerExpectsTrue && outcomeIsTrue) || (!b.makerExpectsTrue && outcomeIsFalse)) {
            winner = b.maker;
        } else {
            // This covers the cases where:
            // 1. Maker expects true, but outcome is false.
            // 2. Maker expects false, but outcome is true.
            winner = b.taker;
        }

        uint256 totalStake = b.stake * 2;

        b.state = State.Settled;
        USDC.safeTransfer(winner, totalStake);
        emit Settled(id, winner);
    }

    // ─── Cancel / refund ──────────────────────────────────────────────────
    function cancel(uint256 id) external nonReentrant {
        Bet storage b = bets[id];

        if (b.state == State.Open && msg.sender == b.maker) {
            b.state = State.Cancelled;
            USDC.safeTransfer(b.maker, b.stake);
            emit Cancelled(id);
            return;
        }

        require(b.state == State.Filled, "no refund unless filled or maker cancelling open bet");
        require(block.timestamp > b.expiryTs + 1 days, "wait for expiry period to pass");

        b.state = State.Cancelled;
        USDC.safeTransfer(b.maker, b.stake);
        USDC.safeTransfer(b.taker, b.stake);
        emit Cancelled(id);
    }
}
