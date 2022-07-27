import type { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { ethers } from 'hardhat';

import axios from 'axios';

import { SimpleTokenSwap, ERC20, ERC20__factory } from '../../typechain';

import { ForkHelpers } from '../shared';
import { assert } from 'console';

const { parseUnits } = ethers.utils;

const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
const USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const LQTY = '0x6DEA81C8171D0bA574754EF6F8b412F2Ed88c54D';

describe('0xapi swap mainnet fork tests', () => {
  let owner: SignerWithAddress;
  let alice: SignerWithAddress;
  let simpleTokenSwap: SimpleTokenSwap;
  let lqty: ERC20;
  let weth: ERC20;
  let usdc: ERC20;

  beforeEach(async () => {
    await ForkHelpers.forkToMainnet();

    [owner, alice] = await ethers.getSigners();

    lqty = ERC20__factory.connect(LQTY, owner);
    weth = ERC20__factory.connect(WETH, owner);
    usdc = ERC20__factory.connect(USDC, owner);

    const SimpleTokenSwapFactory = await ethers.getContractFactory(
      'SimpleTokenSwap',
    );

    simpleTokenSwap = await SimpleTokenSwapFactory.deploy(WETH);
  });

  it('swap tokens through 0x api', async () => {
    let sellToken = lqty;

    const amount = parseUnits('1', await sellToken.decimals());

    await ForkHelpers.mintToken(sellToken, simpleTokenSwap.address, amount);

    let url = `https://api.0x.org/swap/v1/quote?buyToken=${USDC}&sellToken=${sellToken.address}&sellAmount=${amount}`;

    const { data, status } = await axios.get(url);

    console.log(data);

    assert((await usdc.balanceOf(simpleTokenSwap.address)).toNumber() == 0);

    await simpleTokenSwap
      .connect(owner)
      .fillQuote(data.sellTokenAddress, data.to, data.data);

    assert((await usdc.balanceOf(simpleTokenSwap.address)).toNumber() > 0);
  });
});
