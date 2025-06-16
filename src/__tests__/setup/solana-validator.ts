import { WrappedProcess, sleep } from '@marinade.finance/ts-common';
import { tmpdir } from 'os';
import { join } from 'path';
import { Connection } from '@solana/web3.js';

const port = 8899;
export const LOCAL_VALIDATOR_URL = 'http://localhost:' + port;
export const LOCAL_VALIDATOR_WS_URL = 'ws://0.0.0.0:' + (port + 1);

export function spawnTestValidator(...additionalArgs: string[]): WrappedProcess {
  const tmpLedgerPath = join(tmpdir(), 'tmp-ledger');
  return WrappedProcess.spawn('solana-test-validator', [
    '--ledger',
    tmpLedgerPath,
    '--rpc-port',
    port.toString(),
    '--reset',
    // '--quiet',
    '--slots-per-epoch',
    '32',
    '--ticks-per-slot',
    '2',
    ...additionalArgs,
  ]);
}

export async function waitForRpc(connection: Connection, timeoutSeconds = 10): Promise<void> {
  for (let attempt = 1; attempt <= timeoutSeconds; attempt++) {
    try {
      await sleep(1e3);
      const version = await connection.getVersion();
      console.log(`RPC is ready`, JSON.stringify(version));
      return;
    } catch {
      // console.log(`Attempt ${attempt}: RPC is not ready yet`, e);
    }
  }
  throw new Error(`RPC is not ready after ${timeoutSeconds} seconds!`);
}

export async function waitForLocalRpcConnection(timeoutSeconds = 10): Promise<void> {
  const rpc = getLocalRpc();
  await waitForRpc(rpc, timeoutSeconds);
}

export function getLocalRpc(): Connection {
  return new Connection(LOCAL_VALIDATOR_URL, 'confirmed');
}