FROM node:16

RUN mkdir /app

WORKDIR /app

# RUN npm install --global ganache@beta
RUN npm install --save-dev hardhat \
  typescript \
  ts-node \
  dotenv \
  hardhat \
  @nomiclabs/hardhat-ethers \
  @nomiclabs/hardhat-waffle \
  @nomiclabs/hardhat-web3 \
  @primitivefi/hardhat-dodoc \
  @typechain/hardhat \
  hardhat-deploy \
  hardhat-gas-reporter \
  solidity-coverage \
  @openzeppelin/contracts \
  @chainlink/contracts

ADD docker/ganache.entrypoint.sh /app/entrypoint.sh
ADD hardhat.config.ts /app/hardhat.config.ts

RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
