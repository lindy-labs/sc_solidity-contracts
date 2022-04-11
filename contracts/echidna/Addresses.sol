// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "../Vault.sol";
import "../mock/MockERC20.sol";
import "../mock/MockStrategy.sol";

contract Addresses {
    Vault vault = Vault(0xE86bB98fcF9BFf3512C74589B78Fb168200CC546);
    MockStrategy strategy = MockStrategy(0xb7C9b454221E26880Eb9C3101B3295cA7D8279EF);
    MockUST underlying = MockUST(0x48BaCB9266a570d521063EF5dD96e61686DbE788);
    address alice = 0x6Ecbe1DB9EF729CBe972C83Fb886247691Fb6beb;
    address bob   = 0xE36Ea790bc9d7AB70C55260C66D52b1eca985f84;
    address carol = 0xE834EC434DABA538cd1b9Fe1582052B880BD7e63;
}
