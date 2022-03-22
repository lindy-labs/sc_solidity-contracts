#!/bin/sh

ganache-cli \
  --fork $ALCHEMY_API_ENDPOINT \
  --host 0.0.0.0 \
  --wallet.mnemonic "$MNEMONIC"
