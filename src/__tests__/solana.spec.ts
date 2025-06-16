import {
  AccountState,
  createInitializeDefaultAccountStateInstruction,
  createInitializeMint2Instruction,
  createInitializeMintCloseAuthorityInstruction,
  ExtensionType,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
  createInitializePermanentDelegateInstruction,
} from '@solana/spl-token'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import { spawnTestValidator, waitForLocalRpcConnection } from './setup/solana-validator'
import { WrappedProcess } from '@marinade.finance/ts-common/dist/src/process'

describe('Solana', () => {
  let connection: Connection
  let testValidator: WrappedProcess | undefined = undefined
  beforeAll(async () => {
      testValidator = spawnTestValidator();
        const waitTimeS = 7;
        console.log(`Waiting for ${waitTimeS} seconds for local test validator, PID: ${testValidator.process.pid}`);
        connection = await waitForLocalRpcConnection(waitTimeS);
  })

  describe('test token 2022', () => {
    it('mint token 2022', async () => {
      const mintKeypair = Keypair.generate()
      const mint = mintKeypair.publicKey

      const adminKeypair = Keypair.generate()
      const admin = adminKeypair.publicKey
      await connection.requestAirdrop(admin, 111 * LAMPORTS_PER_SOL)

      const extensions = [
        ExtensionType.MintCloseAuthority,
        ExtensionType.PermanentDelegate,
        ExtensionType.DefaultAccountState,
      ]
      const mintLen = getMintLen(extensions)
      const lamports =
        await connection.getMinimumBalanceForRentExemption(mintLen)

      const defaultState = AccountState.Frozen

      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: admin,
          newAccountPubkey: mint,
          space: mintLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializePermanentDelegateInstruction(
          mint,
          admin,
          TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMintCloseAuthorityInstruction(
          mint,
          admin,
          TOKEN_2022_PROGRAM_ID
        ),
        createInitializeDefaultAccountStateInstruction(
          mint,
          defaultState,
          TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMint2Instruction(
          // createInitializeMintInstruction(
          mint,
          0,
          admin,
          admin,
          TOKEN_2022_PROGRAM_ID
        )
      )

      try {
          await sendAndConfirmTransaction(connection, transaction, [adminKeypair, mintKeypair], undefined);
      } catch (e) {
          console.error('Error creating mint:', e);
          console.error('Error creating mint:', JSON.stringify(e));
          throw e;
      }
      console.log('Mint created successfully:', transaction)

      expect(1 + 1).toBe(2)
    })
  })
})
