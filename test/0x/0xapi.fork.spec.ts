import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { time } from '@openzeppelin/test-helpers';

import axios from 'axios';

import { SimpleTokenSwap, ERC20, ERC20__factory } from '../../typechain';

import {
  ForkHelpers,
  generateNewAddress,
  moveForwardTwoWeeks,
} from '../shared';

const { parseUnits } = ethers.utils;
const { MaxUint256 } = ethers.constants;

const FORK_BLOCK = 14988444;

const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const LQTY = '0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D';

describe('0xapi swap mainnet fork tests', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let simpleTokenSwap: SimpleTokenSwap;
  let lqty: ERC20;

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet(FORK_BLOCK);

    [owner, alice] = await ethers.getSigners();

    lqty = ERC20__factory.connect(LQTY, owner);

    const SimpleTokenSwapFactory = await ethers.getContractFactory(
      'SimpleTokenSwap',
    );

    simpleTokenSwap = await SimpleTokenSwapFactory.deploy(WETH);
  });

  it('swap tokens through 0x api', async () => {
    await ForkHelpers.mintToken(
      lqty,
      owner,
      parseUnits('1000', await lqty.decimals()),
    );

    const amount = parseUnits('1000', 18);
    let url = `https://api.0x.org/swap/v1/quote?buyToken=${USDC}&sellToken=${LQTY}&sellAmount=${amount}`;

    const { data, status } = await axios.get(url);

    console.log(data);

    await lqty.connect(owner).transfer(simpleTokenSwap.address, amount);

    await simpleTokenSwap
      .connect(owner)
      .fillQuote(LQTY, USDC, data.allowanceTarget, data.to, data.data);
  });
});
