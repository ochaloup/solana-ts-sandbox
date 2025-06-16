import {
  AccountState,
  createInitializeDefaultAccountStateInstruction,
  createInitializeMint2Instruction,
  createInitializeMintCloseAuthorityInstruction,
  ExtensionType,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
  createInitializePermanentDelegateInstruction,
  getAccountLen,
  createInitializeImmutableOwnerInstruction,
  createInitializeAccount3Instruction,
} from '@solana/spl-token'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import {
  spawnTestValidator,
  waitForLocalRpcConnection,
} from './setup/solana-validator'
import { WrappedProcess } from '@marinade.finance/ts-common/dist/src/process'

describe('Solana', () => {
  let connection: Connection
  let testValidator: WrappedProcess | undefined = undefined
  beforeAll(async () => {
    testValidator = spawnTestValidator()
    const waitTimeS = 7
    console.log(
      `Waiting for ${waitTimeS} seconds for local test validator, PID: ${testValidator.process.pid}`
    )
    connection = await waitForLocalRpcConnection(waitTimeS)
  })

  describe('test token 2022', () => {
    it('mint token 2022', async () => {
      const mintKeypair = Keypair.generate()
      const mint = mintKeypair.publicKey

      const userKeypair = Keypair.generate()
      const user = userKeypair.publicKey
      await connection.requestAirdrop(user, 11 * LAMPORTS_PER_SOL)

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
          mint,
          0,
          admin,
          admin,
          TOKEN_2022_PROGRAM_ID
        )
      )

      await sendAndConfirmTransaction(
        connection,
        transaction,
        [adminKeypair, mintKeypair],
        undefined
      )
      console.log(`Mint ${mint.toBase58()} created successfully`)

      const accountLen = getAccountLen([ExtensionType.ImmutableOwner])
      const lamportsToken =
        await connection.getMinimumBalanceForRentExemption(accountLen)
      const tokenKeypair = Keypair.generate()
      const token = tokenKeypair.publicKey
      const transactionToken = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: admin,
          newAccountPubkey: token,
          space: accountLen,
          lamports: lamportsToken,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeImmutableOwnerInstruction(token, TOKEN_2022_PROGRAM_ID),
        createInitializeAccount3Instruction(
          token,
          mint,
          user,
          TOKEN_2022_PROGRAM_ID
        )
      )
      await sendAndConfirmTransaction(
        connection,
        transactionToken,
        [userKeypair, tokenKeypair],
        undefined
      )
      console.log(`Token account ${token.toBase58()} created successfully`)

      expect(1 + 1).toBe(2)
    })
  })
})
