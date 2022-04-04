// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "../Vault.sol";
import "../mock/MockERC20.sol";

contract Addresses {
    Vault vault = Vault(0xcFC18CEc799fBD1793B5C43E773C98D4d61Cc2dB);
    MockDAI underlying = MockDAI(0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48);
    address alice = 0x6Ecbe1DB9EF729CBe972C83Fb886247691Fb6beb;
    address bob   = 0xE36Ea790bc9d7AB70C55260C66D52b1eca985f84;
    address carol = 0xE834EC434DABA538cd1b9Fe1582052B880BD7e63;
}
