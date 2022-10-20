import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';
import { MockERC20, Vault } from '../../typechain';

const { parseUnits } = ethers.utils;

export default ({
  underlying,
  vault,
}: {
  underlying: MockERC20;
  vault: Vault;
}) => {
  async function addYieldToVault(amount: string) {
    await underlying.mint(vault.address, parseUnits(amount));
    return parseUnits(amount);
  }

  async function addUnderlyingBalance(
    account: SignerWithAddress,
    amount: string,
  ) {
    await underlying.mint(account.address, parseUnits(amount));
    await underlying
      .connect(account)
      .approve(vault.address, parseUnits(amount));
  }

  async function removeUnderlyingFromVault(amount: string) {
    await underlying.burn(vault.address, parseUnits(amount));
  }

  async function underlyingBalanceOf(account: SignerWithAddress | Vault) {
    return underlying.balanceOf(account.address);
  }

  return {
    addUnderlyingBalance,
    addYieldToVault,
    removeUnderlyingFromVault,
    underlyingBalanceOf,
  };
};
