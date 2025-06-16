import { spawnTestValidator, waitForLocalRpcConnection } from './solana-validator';
import { WrappedProcess } from '@marinade.finance/ts-common';

const BQ_PORT = '9050';
export const BQ_LOCALHOST_URL = 'http://0.0.0.0:' + BQ_PORT;

export let TEST_VALIDATOR: WrappedProcess | undefined = undefined;

export default async function globalSetup(): Promise<void> {
  TEST_VALIDATOR = spawnTestValidator();
  try {
    const waitTimeS = 7;
    console.log(`Waiting for ${waitTimeS} seconds for local test validator, PID: ${TEST_VALIDATOR.process.pid}`);
    await waitForLocalRpcConnection(waitTimeS);
  } catch (e) {
    TEST_VALIDATOR.kill();
    TEST_VALIDATOR.join();
    throw e;
  }
}