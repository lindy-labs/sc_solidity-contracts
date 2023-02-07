import { Pool, nearestUsableTick } from '@uniswap/v3-sdk';
import { ethers, network } from 'hardhat';
import { BigNumber, Contract, ContractFactory, Signer } from 'ethers';
import { Percent, Token, CurrencyAmount } from '@uniswap/sdk-core';
import { abi as IUniswapV3PoolABI } from '@uniswap/v3-core/artifacts/contracts/interfaces/IUniswapV3Pool.sol/IUniswapV3Pool.json';

import { ERC20 } from '../../typechain';

interface Immutables {
  factory: string;
  token0: string;
  token1: string;
  fee: number;
  tickSpacing: number;
  maxLiquidityPerTick: BigNumber;
}

interface State {
  liquidity: BigNumber;
  sqrtPriceX96: BigNumber;
  tick: number;
  observationIndex: number;
  observationCardinality: number;
  observationCardinalityNext: number;
  feeProtocol: number;
  unlocked: boolean;
}

export async function getUniswapV3Pool(
  poolAddress: string,
  token0Contract: ERC20,
  token1Contract: ERC20,
) {
  const poolContract = new ethers.Contract(
    poolAddress,
    IUniswapV3PoolABI,
    ethers.provider,
  );
  const immutables = await getPoolImmutables(poolContract);
  const state = await getPoolState(poolContract);
  const token0 = new Token(
    1,
    token0Contract.address,
    await token0Contract.decimals(),
    await token0Contract.symbol(),
    await token0Contract.name(),
  );
  const token1 = new Token(
    1,
    token1Contract.address,
    await token1Contract.decimals(),
    await token1Contract.symbol(),
    await token1Contract.name(),
  );

  return new Pool(
    token0,
    token1,
    immutables.fee,
    state.sqrtPriceX96.toString(),
    state.liquidity.toString(),
    state.tick,
  );
}

async function getPoolImmutables(poolContract: Contract) {
  const immutables: Immutables = {
    factory: await poolContract.factory(),
    token0: await poolContract.token0(),
    token1: await poolContract.token1(),
    fee: await poolContract.fee(),
    tickSpacing: await poolContract.tickSpacing(),
    maxLiquidityPerTick: await poolContract.maxLiquidityPerTick(),
  };
  return immutables;
}

async function getPoolState(poolContract: Contract) {
  const slot = await poolContract.slot0();
  const PoolState: State = {
    liquidity: await poolContract.liquidity(),
    sqrtPriceX96: slot[0],
    tick: slot[1],
    observationIndex: slot[2],
    observationCardinality: slot[3],
    observationCardinalityNext: slot[4],
    feeProtocol: slot[5],
    unlocked: slot[6],
  };
  return PoolState;
}
