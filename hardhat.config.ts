import type { HardhatUserConfig } from 'hardhat/config';

import '@nomiclabs/hardhat-ethers';
import '@nomiclabs/hardhat-waffle';
import '@nomiclabs/hardhat-web3';
import '@nomiclabs/hardhat-etherscan';
import '@primitivefi/hardhat-dodoc';
import '@typechain/hardhat';
import 'hardhat-deploy';
import 'hardhat-gas-reporter';
import 'solidity-coverage';
import '@tenderly/hardhat-tenderly';
import '@openzeppelin/hardhat-upgrades';

const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.10',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  networks: {
    hardhat: {
      accounts: {
        mnemonic: process.env.TESTNET_MNEMONIC || 'TODO',
        accountsBalance: '100000000000000000000000000',
      },
      initialBaseFeePerGas: 0,
      chainId: 31337,
    },
    docker: {
      url: 'http://localhost:8545',
      accounts: {
        mnemonic: process.env.TESTNET_MNEMONIC || 'TODO',
      },
      initialBaseFeePerGas: 0,
      chainId: 31337,
      live: false,
    },
    etheno: {
      url: 'http://localhost:8545',
      chainId: 1337,
      live: false,
    },
    mainnet: {
      url: process.env.ALCHEMY_MAINNET_RPC || 'missing-rpc-endpoint',
      chainId: 1,
      accounts: {
        mnemonic: process.env.MAINNET_MNEMONIC || 'TODO',
      },
    },
    goerli: {
      url: process.env.ALCHEMY_GOERLI_RPC || 'missing-rpc-endpoint',
      chainId: 5,
      accounts: {
        mnemonic: process.env.TESTNET_MNEMONIC || 'TODO',
      },
      blockGasLimit: 30000000,
      gasPrice: 8000000000, // 8 gwei
      gas: 2100000,
    },
    mumbai: {
      url: process.env.ALCHEMY_MUMBAI_RPC || 'missing-rpc-endpoint',
      chainId: 80001,
      accounts: {
        mnemonic: process.env.TESTNET_MNEMONIC || 'TODO',
      },
    },
    polygon: {
      url: process.env.ALCHEMY_POLYGON_RPC || 'missing-rpc-endpoint',
      chainId: 137,
      accounts: {
        mnemonic: process.env.MAINNET_MNEMONIC || 'TODO',
      },
    },
  },
  namedAccounts: {
    deployer: 0,
    alice: 1,
    bob: 2,
    carol: 3,
  },
  mocha: {
    timeout: 2000000,
  },
  typechain: {
    outDir: 'typechain',
  },
  dodoc: {
    runOnCompile: !!process.env.COMPILE_DOCS || false,
    include: [
      'Vault',
      'Claimers',
      'Depositors',
      'IVault',
      'IIntegration',
      'PercentMath',
    ],
  },
  etherscan: {
    apiKey: {
      goerli: process.env.ETHERSCAN_KEY || 'missing-key',
      mainnet: process.env.ETHERSCAN_KEY || 'missing-key',
      polygon: process.env.POLYSCAN_KEY || 'missing-key',
      polygonMumbai: process.env.POLYSCAN_KEY || 'missing-key',
    },
    customChains: [],
  },
};

export default config;
