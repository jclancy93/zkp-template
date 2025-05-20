export const bettingMarketABI = [
    {
      "inputs": [
        {
          "internalType": "address",
          "name": "usdc",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "_reclaimAddress",
          "type": "address"
        }
      ],
      "stateMutability": "nonpayable",
      "type": "constructor"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "Cancelled",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "maker",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "stake",
          "type": "uint256"
        },
        {
          "indexed": false,
          "internalType": "string",
          "name": "url",
          "type": "string"
        },
        {
          "indexed": false,
          "internalType": "uint64",
          "name": "expiryTs",
          "type": "uint64"
        },
        {
          "indexed": false,
          "internalType": "bool",
          "name": "makerExpectsTrue",
          "type": "bool"
        }
      ],
      "name": "MarketCreated",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "taker",
          "type": "address"
        },
        {
          "indexed": false,
          "internalType": "uint256",
          "name": "stake",
          "type": "uint256"
        }
      ],
      "name": "MarketTaken",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        {
          "indexed": true,
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "indexed": true,
          "internalType": "address",
          "name": "winner",
          "type": "address"
        }
      ],
      "name": "Settled",
      "type": "event"
    },
    {
      "inputs": [],
      "name": "USDC",
      "outputs": [
        {
          "internalType": "contract IERC20",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "",
          "type": "uint256"
        }
      ],
      "name": "bets",
      "outputs": [
        {
          "internalType": "address",
          "name": "maker",
          "type": "address"
        },
        {
          "internalType": "address",
          "name": "taker",
          "type": "address"
        },
        {
          "internalType": "uint256",
          "name": "stake",
          "type": "uint256"
        },
        {
          "internalType": "bytes32",
          "name": "urlHash",
          "type": "bytes32"
        },
        {
          "internalType": "uint64",
          "name": "expiryTs",
          "type": "uint64"
        },
        {
          "internalType": "bool",
          "name": "makerExpectsTrue",
          "type": "bool"
        },
        {
          "internalType": "enum BettingMarket.State",
          "name": "state",
          "type": "uint8"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        }
      ],
      "name": "cancel",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "string",
          "name": "url",
          "type": "string"
        },
        {
          "internalType": "uint256",
          "name": "stake",
          "type": "uint256"
        },
        {
          "internalType": "uint64",
          "name": "expiryTs",
          "type": "uint64"
        },
        {
          "internalType": "bool",
          "name": "makerExpectsTrue",
          "type": "bool"
        }
      ],
      "name": "createMarket",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "reclaimAddress",
      "outputs": [
        {
          "internalType": "address",
          "name": "",
          "type": "address"
        }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "components": [
            {
              "components": [
                {
                  "internalType": "string",
                  "name": "provider",
                  "type": "string"
                },
                {
                  "internalType": "string",
                  "name": "parameters",
                  "type": "string"
                },
                {
                  "internalType": "string",
                  "name": "context",
                  "type": "string"
                }
              ],
              "internalType": "struct Reclaim.ClaimInfo",
              "name": "claimInfo",
              "type": "tuple"
            },
            {
              "components": [
                {
                  "components": [
                    {
                      "internalType": "bytes32",
                      "name": "identifier",
                      "type": "bytes32"
                    },
                    {
                      "internalType": "address",
                      "name": "owner",
                      "type": "address"
                    },
                    {
                      "internalType": "uint32",
                      "name": "timestampS",
                      "type": "uint32"
                    },
                    {
                      "internalType": "uint32",
                      "name": "epoch",
                      "type": "uint32"
                    }
                  ],
                  "internalType": "struct Reclaim.Claim",
                  "name": "claim",
                  "type": "tuple"
                },
                {
                  "internalType": "bytes[]",
                  "name": "signatures",
                  "type": "bytes[]"
                }
              ],
              "internalType": "struct Reclaim.SignedClaim",
              "name": "signedClaim",
              "type": "tuple"
            }
          ],
          "internalType": "struct Reclaim.Proof",
          "name": "proof",
          "type": "tuple"
        }
      ],
      "name": "settle",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        {
          "internalType": "uint256",
          "name": "id",
          "type": "uint256"
        },
        {
          "internalType": "uint256",
          "name": "takerStake",
          "type": "uint256"
        }
      ],
      "name": "takeMarket",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    }
  ] as const; 