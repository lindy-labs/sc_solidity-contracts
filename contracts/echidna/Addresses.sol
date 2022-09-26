// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "../Vault.sol";
import "../mock/anchor/MockAnchorStrategy.sol";
import "../mock/MockERC20.sol";

import "../strategy/liquity/LiquityStrategy.sol";

contract Addresses {
    // Vault vault = Vault(0xE86bB98fcF9BFf3512C74589B78Fb168200CC546);
    // MockAnchorStrategy strategy =
    //     MockAnchorStrategy(0xDc688D29394a3f1E6f1E5100862776691afAf3d2);
    // MockUST underlying = MockUST(0x48BaCB9266a570d521063EF5dD96e61686DbE788);

    LiquityStrategy strategy =
        LiquityStrategy(payable(0x34D402F14D58E001D8EfBe6585051BF9706AA064));
    MockERC20 underlying =
        MockERC20(0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48);
    Vault vault = Vault(0x0B1ba0af832d7C05fD64161E0Db78E85978E8082);

    address alice = 0x6Ecbe1DB9EF729CBe972C83Fb886247691Fb6beb;
    address bob = 0xE36Ea790bc9d7AB70C55260C66D52b1eca985f84;
    address carol = 0xE834EC434DABA538cd1b9Fe1582052B880BD7e63;
}
