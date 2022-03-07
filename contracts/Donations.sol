// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "hardhat/console.sol";

contract Donations is ERC721("Sandclock Donation", "Donations") {
    using SafeERC20 for IERC20;

    struct DonationParams {
        uint256 destinationId;
        address owner;
        IERC20 token;
        uint256 amount;
    }

    struct Metadata {
        uint256 destinationId;
        IERC20 token;
        uint256 amount;
        uint64 expiry;
    }

    uint256 public metadataId;

    uint64 public constant TTL = 180 days;

    mapping(uint256 => Metadata) public metadata;

    mapping(bytes32 => bool) public processedTx;

    mapping(IERC20 => mapping(uint256 => uint256)) public transferableAmounts;

    function donate(
        uint256 _destinationId,
        IERC20 _token,
        address _to
    ) external {
        uint256 amount = transferableAmounts[_token][_destinationId];
        transferableAmounts[_token][_destinationId] = 0;

        _token.safeTransfer(_to, amount);
    }

    function mint(bytes32 _txHash, DonationParams[] calldata _params) external {
        require(processedTx[_txHash] == false, "Donations: already processed");

        uint64 expiry = _getBlockTimestamp() + TTL;
        uint256 length = _params.length;

        for (uint256 i = 0; i < length; i++) {
            uint256 _metadataId = ++metadataId;

            metadata[_metadataId] = Metadata({
                destinationId: _params[i].destinationId,
                token: _params[i].token,
                expiry: expiry,
                amount: _params[i].amount
            });

            _mint(_params[i].owner, _metadataId);
        }

        processedTx[_txHash] = true;
    }

    function burn(uint256 _id) external {
        require(ownerOf(_id) == _msgSender());

        uint256 destinationId = metadata[_id].destinationId;
        IERC20 token = metadata[_id].token;
        uint256 amount = metadata[_id].amount;

        transferableAmounts[token][destinationId] += amount;

        _burn(_id);
    }

    function _getBlockTimestamp() private view returns (uint64) {
        return uint64(block.timestamp);
    }
}
