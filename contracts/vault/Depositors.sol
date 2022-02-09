// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";

import "hardhat/console.sol";

contract Depositors is ERC721 {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;
    address public vault;

    modifier onlyVault() {
        require(msg.sender == vault, "Depositors: not authorized");
        _;
    }

    constructor(
        address _vault,
        string memory _name,
        string memory _symbol
    ) ERC721(_name, _symbol) {
        vault = _vault;
    }

    // should only be callable by the vault
    function mint(address _owner) external onlyVault returns (uint256) {
        uint256 localTokenId = _tokenIds.current();
        _tokenIds.increment();

        _safeMint(_owner, localTokenId);

        return localTokenId;
    }

    // called when a deposit's principal is withdrawn
    function burn(uint256 _id) external onlyVault {
        _burn(_id);
    }

    function exists(uint256 _tokenId) external view returns (bool) {
        return _exists(_tokenId);
    }
}
