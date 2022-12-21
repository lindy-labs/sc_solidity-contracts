// SPDX-License-Identifier: UNLICENSED
pragma solidity =0.8.10;

import "../Vault.sol";
import "../mock/MockERC20.sol";
import "../mock/liquity/MockStabilityPool.sol";
import "../strategy/liquity/LiquityStrategy.sol";

contract Addresses {
    Vault vault = Vault(0x0B1ba0af832d7C05fD64161E0Db78E85978E8082);
    LiquityStrategy strategy =
        LiquityStrategy(payable(0x34D402F14D58E001D8EfBe6585051BF9706AA064));
    MockLUSD underlying = MockLUSD(0x1dC4c1cEFEF38a777b15aA20260a54E584b16C48);
    MockStabilityPool stabilityPool = MockStabilityPool(payable(0x871DD7C2B4b25E1Aa18728e9D5f2Af4C4e431f5c));
    address alice = 0x6Ecbe1DB9EF729CBe972C83Fb886247691Fb6beb;
    address bob = 0xE36Ea790bc9d7AB70C55260C66D52b1eca985f84;
    address carol = 0xE834EC434DABA538cd1b9Fe1582052B880BD7e63;
}
