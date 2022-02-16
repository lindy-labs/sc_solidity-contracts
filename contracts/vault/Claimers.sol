// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";

import {IClaimers} from "./IClaimers.sol";

contract Claimers is ERC721, IClaimers {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;
    address public vault = address(0);

    mapping(address => uint256) public addressToTokenID;

    modifier onlyVault() {
        require(msg.sender == vault, "Claimers: not authorized");
        _;
    }

    // TODO Make names dynamic
    constructor(address _vault) ERC721("Claimers", "SNDCLM") {
        vault = _vault;
    }

    function mint(address _to) external onlyVault returns (uint256) {
        uint256 localTokenId = addressToTokenID[_to];

        if (localTokenId == 0) {
            _tokenIds.increment();
            localTokenId = _tokenIds.current();

            _safeMint(_to, localTokenId);
        }

        return localTokenId;
    }

    function tokenOf(address _owner) external view returns (uint256) {
        return addressToTokenID[_owner];
    }

    /**
     * Ensures the addressToTokenID mapping is up to date.
     *
     * @notice This function prevents transfers to addresses that already own an NFT.
     *
     * @param _from origin address.
     * @param _to destination address.
     * @param _tokenId id of the token.
     */
    function _beforeTokenTransfer(
        address _from,
        address _to,
        uint256 _tokenId
    ) internal virtual override {
        require(_to != address(0), "Claimers: cannot burn this NFT");

        if (_from == address(0)) {
            // MINT
            addressToTokenID[_to] = _tokenId;
        } else {
            // TRANSFER
            require(
                addressToTokenID[_to] == 0,
                "Claimers: destination already has an NFT"
            );

            addressToTokenID[_from] = 0;
            addressToTokenID[_to] = _tokenId;
        }
    }
}
