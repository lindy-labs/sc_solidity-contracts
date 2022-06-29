FROM node:16

RUN mkdir /app

WORKDIR /app

ADD docker/hardhat.entrypoint.sh /app/entrypoint.sh
ADD docker/hardhat.config.js /app/hardhat.config.js

RUN npm init -y && npm install hardhat@2.9.2 @nomiclabs/hardhat-waffle @tenderly/hardhat-tenderly@1.0.13

RUN chmod +x /app/entrypoint.sh

ENTRYPOINT ["/app/entrypoint.sh"]
