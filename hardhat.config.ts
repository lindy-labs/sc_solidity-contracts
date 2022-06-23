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

const devMnemonic =
  process.env.MNEMONIC ||
  'core tornado motion pigeon kiss dish differ asthma much ritual black foil';

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
        mnemonic: devMnemonic,
        accountsBalance: '100000000000000000000000000',
      },
      initialBaseFeePerGas: 0,
      chainId: 31337,
    },
    docker: {
      url: 'http://localhost:8545',
      accounts: {
        mnemonic: devMnemonic,
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
      url: `https://mainnet.infura.io/v3/${
        process.env.INFURA_KEY || 'missing-key'
      }`,
      chainId: 1,
      accounts: {
        mnemonic: process.env.MAINNET_MNEMONIC || 'TODO',
      },
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${
        process.env.INFURA_KEY || 'missing-key'
      }`,
      chainId: 3,
      accounts: {
        mnemonic: process.env.TESTNET_MNEMONIC || 'TODO',
      },
    },
    mumbai: {
      url: process.env.MUMBAI_RPC || 'missing-rpc-endpoint',
      chainId: 80001,
      accounts: {
        mnemonic: process.env.TESTNET_MNEMONIC || 'TODO',
      },
    },
    polygon: {
      url: process.env.POLYGON_RPC || 'missing-rpc-endpoint',
      chainId: 137,
      accounts: {
        mnemonic: process.env.TESTNET_MNEMONIC || 'TODO',
      },
    },
  },
  namedAccounts: {
    deployer: 0,
    alice: 1,
    bob: 2,
    carol: 3,
    ethAnchorOperator: 4,
    ethAnchorOperator1: 5,
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
      ropsten: process.env.ETHERSCAN_KEY || 'missing-key',
      polygonMumbai: process.env.POLYSCAN_KEY || 'missing-key',
    },
  },
};

export default config;
