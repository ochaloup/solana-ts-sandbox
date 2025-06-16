import { TEST_VALIDATOR } from './globalSetup';

export default async function globalTeardown(): Promise<void> {
  console.log('Stopping test validator PID', TEST_VALIDATOR?.process.pid);
  TEST_VALIDATOR?.kill();
  TEST_VALIDATOR?.join();
}