import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';

const { parseUnits } = ethers.utils;

export default ({ underlying, vault }) => {
  async function addYieldToVault(amount: string) {
    await underlying.mint(vault.address, parseUnits(amount));
    return parseUnits(amount);
  }

  async function addUnderlyingBalance(
    account: SignerWithAddress,
    amount: string,
  ) {
    await underlying.mint(account.address, parseUnits(amount));
    return underlying
      .connect(account)
      .approve(vault.address, parseUnits(amount));
  }

  function removeUnderlyingFromVault(amount: string) {
    return underlying.burn(vault.address, parseUnits(amount));
  }

  return {
    addUnderlyingBalance,
    addYieldToVault,
    removeUnderlyingFromVault,
  };
};
