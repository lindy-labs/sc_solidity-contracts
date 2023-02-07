import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';
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
  async function addYieldToVault(amount: string | BigNumber) {
    if (!(amount instanceof BigNumber)) amount = parseUnits(amount);
    await underlying.mint(vault.address, amount);
    return amount;
  }

  async function addUnderlyingBalance(
    account: SignerWithAddress,
    amount: string | BigNumber,
  ) {
    if (!(amount instanceof BigNumber)) amount = parseUnits(amount);

    await underlying.mint(account.address, amount);
    await underlying.connect(account).approve(vault.address, amount);
  }

  async function removeUnderlyingFromVault(amount: string | BigNumber) {
    if (!(amount instanceof BigNumber)) amount = parseUnits(amount);
    await underlying.burn(vault.address, amount);
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
