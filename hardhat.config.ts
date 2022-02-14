import type { HardhatUserConfig } from "hardhat/config";

import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-web3";
import "@primitivefi/hardhat-dodoc";
import "@typechain/hardhat";
import "solidity-coverage";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import "dotenv/config";

const devMnemonic =
  process.env.MNEMONIC ||
  "core tornado motion pigeon kiss dish differ asthma much ritual black foil";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.10",
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
        accountsBalance: "100000000000000000000000000",
      },
      initialBaseFeePerGas: 0,
    },
    docker: {
      url: "http://localhost:8545",
      accounts: {
        mnemonic: devMnemonic,
      },
      chainId: 1337,
      live: false,
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${
        process.env.INFURA_KEY || "missing-key"
      }`,
      chainId: 1,
      accounts: {
        mnemonic: process.env.MAINNET_MNEMONIC || "TODO",
      },
    },
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${
        process.env.INFURA_KEY || "missing-key"
      }`,
      chainId: 4,
      accounts: {
        mnemonic: process.env.TESTNET_MNEMONIC || "TODO",
      },
    },
    ropsten: {
      url: `https://ropsten.infura.io/v3/${
        process.env.INFURA_KEY || "missing-key"
      }`,
      chainId: 3,
      accounts: [process.env.TESTNET_PRIVATEKEY],
    },
  },
  namedAccounts: {
    deployer: 0,
    alice: 1,
    bob: 2,
    carol: 3,
    exchangeRateFeeder: {
      3: "0x79E0d9bD65196Ead00EE75aB78733B8489E8C1fA",
    },
    ethAnchorRouter: {
      1: "",
      3: "0x7537aC093cE1315BCE08bBF0bf6f9b86B7475008",
    },
    aUstToUstFeed: {
      1: "0x73bB8A4220E5C7Db3E73e4Fcb8d7DCf2efe04805",
      3: "0x74f9F75747550fbCa6510610450fe91B5Ed765fe", // Mock chainlink feed
    },
    treasury: {
      1: "",
      3: "0x5641D433c027f9B40a3664752375245b274d1D7d",
    },
    owner: {
      1: "",
      3: "0x5641D433c027f9B40a3664752375245b274d1D7d",
    },
    ustToken: {
      1: "",
      3: "0x6cA13a4ab78dd7D657226b155873A04DB929A3A4",
    },
    aUstToken: {
      1: "",
      3: "0x006479f75d6622ae6a21be17c7f555b94c672342",
    },
  },
  mocha: {
    timeout: 2000000,
  },
  typechain: {
    outDir: "typechain",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  dodoc: {
    runOnCompile: !!process.env.COMPILE_DOCS || false,
    include: [
      "Vault",
      "Claimers",
      "Depositors",
      "IVault",
      "IIntegration",
      "IDCA",
      "DCAQueue",
      "DCAScheduler",
      "DCAUniswapV3",
      "PercentMath",
    ],
  },
};

export default config;
