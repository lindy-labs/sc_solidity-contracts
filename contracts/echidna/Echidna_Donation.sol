// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;
import "./Helper.sol";
import {Donations} from "../Donations.sol";
import {ERC721Holder} from "@openzeppelin/contracts/token/ERC721/utils/ERC721Holder.sol";

contract Echidna_Donation is Helper, ERC721Holder {

    Donations donations;
    MockDAI dai;

    bytes32 TX = 0x5bdfd14fcc917abc2f02a30721d152a6f147f09e8cbaad4e0d5405d646c5c3e1;
    uint256 ID = 1;

    address[] owners = [carol, alice, bob, address(this)];

    constructor () {
        donations = new Donations(address(this));
        dai = new MockDAI(0);
    }

    // mint with valid params should never revert
    function mint_should_succeed(Donations.DonationParams[] memory _params) public {

        uint16 length = uint16(_params.length);
        require(length > 0);
        uint256 total = 0;
        for (uint16 i = 0; i < length; i++) {
            _params[i].destinationId = 1;
            _params[i].amount = Helper.one_to_max_uint64(_params[i].amount);
            total += _params[i].amount;
            _params[i].owner = owners[i % 4];
            _params[i].token = dai;
        }
        
        dai.mint(address(donations), total);
        emit Log("total", total);

        uint256 balance_donations_before = dai.balanceOf(address(donations));
        emit Log("balance of donations before", balance_donations_before);

        try donations.mint(TX, ID, _params) {
            assert(true);
        } catch {
            assert(false);
        }

        ID += 1;
    }
}
