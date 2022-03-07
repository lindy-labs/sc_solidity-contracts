// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import {Context} from "@openzeppelin/contracts/utils/Context.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";

import "hardhat/console.sol";

contract Donations is ERC721, AccessControl {
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

    mapping(bytes32 => bool) public processedDonationsGroups;

    mapping(IERC20 => mapping(uint256 => uint256)) public transferableAmounts;

    constructor(address _owner) ERC721("Sandclock Donation", "Donations") {
        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
    }

    /**
     * Transfers the donated funds in the currency @param _token to the charity with the id @param _destinationId.
     *
     * @param _destinationId ID of the charity.
     * @param _token Currency to transfer the funds from.
     * @param _to Address of the charity.
     */
    function donate(
        uint256 _destinationId,
        IERC20 _token,
        address _to
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(
            transferableAmounts[_token][_destinationId] != 0,
            "Donations: nothing to donate"
        );

        uint256 amount = transferableAmounts[_token][_destinationId];
        transferableAmounts[_token][_destinationId] = 0;

        _token.safeTransfer(_to, amount);
    }

    /**
     * This function mints an NFT for every donation in @param _params.
     * The @param _donationsId is used to uniquely identify this collection of donations.
     * Ideally, @param _donationsId is the hash of the transaction where the yield for the donations was claimed to by the treasury.
     *
     * @param _donationsId Unique identifier for the group of donations in @param _params.
     * @param _params Donation params.
     */
    function mint(bytes32 _donationsId, DonationParams[] calldata _params)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        require(
            processedDonationsGroups[_donationsId] == false,
            "Donations: already processed"
        );

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

        processedDonationsGroups[_donationsId] = true;
    }

    /**
     * Burns the NFT and sets the amount donated to be transferred to the charity.
     *
     * @param _id ID of the NFT.
     */
    function burn(uint256 _id) external {
        require(
            ownerOf(_id) == _msgSender() ||
                hasRole(DEFAULT_ADMIN_ROLE, _msgSender()),
            "Donations: not allowed"
        );

        uint256 destinationId = metadata[_id].destinationId;
        IERC20 token = metadata[_id].token;
        uint256 amount = metadata[_id].amount;

        transferableAmounts[token][destinationId] += amount;

        _burn(_id);
    }

    function _getBlockTimestamp() private view returns (uint64) {
        return uint64(block.timestamp);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        virtual
        override(AccessControl, ERC721)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
