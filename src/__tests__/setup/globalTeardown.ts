import { sleep } from '@marinade.finance/ts-common';
import { TEST_VALIDATOR } from './globalSetup';

export default async function globalTeardown(): Promise<void> {
  console.log('Stopping test validator PID', TEST_VALIDATOR?.process.pid);
  TEST_VALIDATOR?.process.kill('SIGTERM');
  await sleep(2000);
  TEST_VALIDATOR?.kill();
  await TEST_VALIDATOR?.join();
}