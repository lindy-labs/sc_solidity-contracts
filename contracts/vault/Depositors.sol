// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {Counters} from "@openzeppelin/contracts/utils/Counters.sol";

import {IVault} from "../vault/IVault.sol";

contract Depositors is ERC721 {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIds;
    IVault public vault;

    modifier onlyVault() {
        require(msg.sender == address(vault), "Depositors: not authorized");
        _;
    }

    constructor(IVault _vault) ERC721("", "") {
        vault = _vault;
    }

    function name() public view override(ERC721) returns (string memory) {
        return
            string(
                abi.encodePacked(
                    "Sandclock",
                    IERC20Metadata(address(vault.underlying())).name(),
                    " - Depositors"
                )
            );
    }

    function symbol() public view override(ERC721) returns (string memory) {
        return
            string(
                abi.encodePacked(
                    "QUARTZ-",
                    IERC20Metadata(address(vault.underlying())).symbol(),
                    "-DEP"
                )
            );
    }

    // should only be callable by the vault
    function mint(address _owner) external onlyVault returns (uint256) {
        _tokenIds.increment();
        uint256 localTokenId = _tokenIds.current();

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
