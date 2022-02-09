#!/bin/sh

ganache-cli \
  --host 0.0.0.0 \
  --wallet.mnemonic "$MNEMONIC"
