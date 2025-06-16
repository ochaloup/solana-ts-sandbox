#!/usr/bin/env bash

set -e

TEST_VALIDATOR_DIR=${TEST_VALIDATOR_DIR:-"/tmp/solana-test-validator"}

solana-test-validator --reset --quiet --slots-per-epoch 32 --ticks-per-slot 5 --ledger "$TEST_VALIDATOR_DIR" &

timeout 5 bash -c 'until nc -z localhost 8899; do sleep 1; done'

trap "pkill -f 'solana-test-validator'; rm -rf '$TEST_VALIDATOR_DIR'" EXIT

pnpm jest