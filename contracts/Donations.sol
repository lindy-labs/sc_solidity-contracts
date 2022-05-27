// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import { AccessControl } from "@openzeppelin/contracts/access/AccessControl.sol";
import { Context } from "@openzeppelin/contracts/utils/Context.sol";
import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * A contract to store donations before they are transferred to the charities.
 */
contract Donations is ERC721, AccessControl {
    using SafeERC20 for IERC20;

    bytes32 public constant WORKER_ROLE = keccak256("WORKER_ROLE");

    struct DonationParams {
        uint128 destinationId;
        address owner;
        IERC20 token;
        uint256 amount;
        string donationId;
    }

    struct Metadata {
        uint128 destinationId;
        uint64 expiry;
        IERC20 token;
        uint256 amount;
    }

    event DonationMinted(
        uint256 indexed id,
        uint128 indexed destinationId,
        bytes32 indexed groupId,
        IERC20 token,
        uint256 expiry,
        uint256 amount,
        address owner,
        string donationId
    );

    event DonationBurned(uint256 indexed id, string donationId);

    event DonationsSent(
        uint128 indexed destinationId,
        IERC20 indexed token,
        address indexed to,
        uint256 amount
    );

    event TTLUpdated(uint64 ttl);

    uint256 private metadataId;
    mapping(uint256 => Metadata) public metadata;

    /// Duration of the expiration date for new donations.
    uint64 public ttl = 180 days;

    /// Used to indicate whether a group of donations identified by the key has been processed or not.
    mapping(bytes32 => bool) public processedDonationsGroups;

    /// Stores how much should be transferred to each charity in each coin.
    mapping(IERC20 => mapping(uint128 => uint256)) public transferableAmounts;

    /**
     * @param _owner Account that will receive the admin role.
     */
    constructor(address _owner) ERC721("Sandclock Donation", "Donations") {
        require(_owner != address(0x0), "Vault: owner cannot be 0x0");

        _setupRole(DEFAULT_ADMIN_ROLE, _owner);
        _setupRole(WORKER_ROLE, _owner);
    }

    /**
     * Changes the TTL for new donations.
     *
     * @param _ttl the new TTL.
     */
    function setTTL(uint64 _ttl) external onlyRole(DEFAULT_ADMIN_ROLE) {
        ttl = _ttl;

        emit TTLUpdated(_ttl);
    }

    /**
     * Transfers the donated funds in the currency @param _token to the charity with the id @param _destinationId.
     *
     * @param _destinationId ID of the charity.
     * @param _token Currency to transfer the funds from.
     * @param _to Address of the charity.
     */
    function donate(
        uint128 _destinationId,
        IERC20 _token,
        address _to
    ) external onlyRole(WORKER_ROLE) {
        uint256 amount = transferableAmounts[_token][_destinationId];
        require(amount != 0, "Donations: nothing to donate");

        transferableAmounts[_token][_destinationId] = 0;

        emit DonationsSent(_destinationId, _token, _to, amount);

        _token.safeTransfer(_to, amount);
    }

    /**
     * Mints an NFT for every donation in @param _params.
     * The @param _txHash and @param _batchNr uniquely identify a group of donations.
     *
     * @param _txHash The hash of the transaction where the yield for these donations was claimed.
     * @param _batchNr When there are too many donations in a claim, we break them into batches to not reach the gas limit.
     * @param _params Donation params.
     */
    function mint(
        bytes32 _txHash,
        uint256 _batchNr,
        DonationParams[] calldata _params
    ) external onlyRole(WORKER_ROLE) {
        bytes32 groupId = keccak256(abi.encodePacked(_txHash, _batchNr));

        require(
            !processedDonationsGroups[groupId],
            "Donations: already processed"
        );

        uint64 expiry = _getBlockTimestamp() + ttl;
        uint256 length = _params.length;
        uint256 _metadataId = metadataId;

        for (uint256 i = 0; i < length; ++i) {
            metadata[_metadataId] = Metadata({
                destinationId: _params[i].destinationId,
                token: _params[i].token,
                expiry: expiry,
                amount: _params[i].amount
            });

            _mint(_params[i].owner, _metadataId);

            emit DonationMinted(
                _metadataId,
                _params[i].destinationId,
                groupId,
                _params[i].token,
                expiry,
                _params[i].amount,
                _params[i].owner,
                _params[i].donationId
            );

            ++_metadataId;
        }

        metadataId = _metadataId;

        processedDonationsGroups[groupId] = true;
    }

    /**
     * Burns the NFT and sets the amount donated to be transferred to the charity.
     *
     * @param _id ID of the NFT.
     */
    function burn(uint256 _id, string calldata donationId) external {
        bool isOwner = ownerOf(_id) == _msgSender();

        Metadata storage data = metadata[_id];

        bool expired = data.expiry < _getBlockTimestamp();

        require(isOwner || expired, "Donations: not allowed");

        transferableAmounts[data.token][data.destinationId] += data.amount;

        _burn(_id);

        emit DonationBurned(_id, donationId);
    }

    /**
     * Basically similar to the above burn() method but is called on an array of _ids
     * Expected to be called by the backend to burn a bunch of NFTs when they expire
     *
     * @param _ids IDs of the NFTs.
     */
    function burnBatch(uint256[] calldata _ids, string[] calldata donationIds) external {
        uint256 _id;
        Metadata storage data;
        bool expired;

        uint256 timestamp = _getBlockTimestamp();

        uint256 idsLen = _ids.length;
        for (uint256 i = 0; i < idsLen; ++i) {
            _id = _ids[i];
            data = metadata[_id];

            expired = data.expiry < timestamp;

            // used an if statement instead of require so that the method will keep on running for the other ids and not stop execution
            if (expired) {
                transferableAmounts[data.token][data.destinationId] += data
                    .amount;

                _burn(_id);

                emit DonationBurned(_id, donationIds[i]);
            }
        }
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
