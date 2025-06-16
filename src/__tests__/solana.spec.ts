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
  getMint,
  createInitializeNonTransferableMintInstruction,
  createAccount,
  ImmutableOwnerLayout,
  createInitializeAccountInstruction,
} from '@solana/spl-token'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js'
import {
  spawnTestValidator,
  waitForLocalRpcConnection,
} from './setup/solana-validator'
import { WrappedProcess } from '@marinade.finance/ts-common/dist/src/process'
import { Decimal } from 'decimal.js'
import { Key } from 'readline'

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
      await airdrop(connection, user, 3 * LAMPORTS_PER_SOL)
      const user2Keypair = Keypair.generate()
      const user2 = user2Keypair.publicKey
      await airdrop(connection, user2, 3 * LAMPORTS_PER_SOL)

      const adminKeypair = Keypair.generate()
      const admin = adminKeypair.publicKey
      await airdrop(connection, admin, LAMPORTS_PER_SOL)

      const extensions = [
        ExtensionType.MintCloseAuthority,
        ExtensionType.PermanentDelegate,
        // ExtensionType.DefaultAccountState,
        ExtensionType.NonTransferable,
      ]
      const mintLen = getMintLen(extensions)
      const lamports =
        await connection.getMinimumBalanceForRentExemption(mintLen)

      // const defaultState = AccountState.Frozen

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
        // createInitializeDefaultAccountStateInstruction(
        //   mint,
        //   defaultState,
        //   TOKEN_2022_PROGRAM_ID
        // ),
        createInitializeNonTransferableMintInstruction(
          mint,
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
      transaction.feePayer = admin

      try {
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [adminKeypair, mintKeypair],
          undefined
        )
        console.log(
          `Transaction confirmed with signature: ${signature}, mint: ${mint.toBase58()}`
        )
        const mintData = await getMint(
          connection,
          mint,
          'confirmed',
          TOKEN_2022_PROGRAM_ID
        )
        console.log(
          `Mint ${mintData.address.toBase58()} created successfully (admin: ${admin.toBase58()}, user: ${user.toBase58()})`
        )
      } catch (e) {
        console.error('Transaction failed:', jsonStringify(e, null))
        // console.error(jsonStringify(transaction))
        throw e
      }

      // TokenInvalidAccountOwnerError
      // const tokenKeypair = Keypair.generate()
      // const token = tokenKeypair.publicKey
      // const tokenAux = await createAccount(
      //   connection,
      //   adminKeypair,
      //   mint,
      //   user,
      //   tokenKeypair,
      // );
      // expect(tokenAux.toBase58()).toBe(token.toBase58())
      // console.log(`Token account ${token.toBase58()} created successfully`)
      const token = await createToken(
        connection,
        mint,
        adminKeypair,
        user,
        extensions,
        true,
      )
      console.log(`Token account ${token.toBase58()} created successfully`)
      const token2 = await createToken(
        connection,
        mint,
        adminKeypair,
        user2,
        extensions
      )
      console.log(`Token account ${token2.toBase58()} created successfully`)

      expect(1 + 1).toBe(2)
    })
  })
})

function jsonStringify(data: unknown, indent: number | null = 2): string {
  const adjustedIndent = indent === null ? undefined : indent
  return JSON.stringify(
    data,
    (_key, value) =>
      typeof value === 'bigint' || value instanceof Decimal
        ? value.toString()
        : value,
    adjustedIndent
  )
}

async function airdrop(
  connection: Connection,
  publicKey: PublicKey,
  amount: number
): Promise<void> {
  const signature = await connection.requestAirdrop(publicKey, amount)
  await connection.confirmTransaction(signature, 'confirmed')
  const account = await connection.getAccountInfo(publicKey)
  if (!account) {
    throw new Error(`Account ${publicKey} not found after airdrop`)
  }
}

async function createToken(
  connection: Connection,
  mint: PublicKey,
  minter: Keypair,
  owner: PublicKey,
  extensions: ExtensionType[] = [],
  isSeeded: boolean = false
): Promise<PublicKey> {
  const accountLen = getAccountLen(extensions)
  const lamportsToken =
    await connection.getMinimumBalanceForRentExemption(accountLen)

  let initIx: TransactionInstruction
  let tokenKeypair: Keypair | undefined = undefined
  let token: PublicKey

  if (isSeeded) {
    const seed = 'token-' + mint.toBase58() + '-' + owner.toBase58()
    token = await PublicKey.createWithSeed(
      minter.publicKey,
      seed,
      TOKEN_2022_PROGRAM_ID
    )
    initIx = SystemProgram.createAccountWithSeed({
      fromPubkey: minter.publicKey,
      newAccountPubkey: token,
      basePubkey: minter.publicKey,
      seed,
      space: accountLen,
      lamports: lamportsToken,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  } else {
    tokenKeypair = Keypair.generate()
    token = tokenKeypair.publicKey
    initIx = SystemProgram.createAccount({
      fromPubkey: minter.publicKey,
      newAccountPubkey: token,
      space: accountLen,
      lamports: lamportsToken,
      programId: TOKEN_2022_PROGRAM_ID,
    })
  }

  const transaction = new Transaction().add(
    initIx,
    // createInitializeDefaultAccountStateInstruction(
    //   token,
    //   AccountState.Frozen,
    //   TOKEN_2022_PROGRAM_ID
    // ),
    createInitializeAccountInstruction(
      token,
      mint,
      owner,
      TOKEN_2022_PROGRAM_ID
    )
  )

  const signers = tokenKeypair ? [minter, tokenKeypair] : [minter]
  await sendAndConfirmTransaction(
    connection,
    transaction,
    signers,
    undefined
  )
  return token
}
