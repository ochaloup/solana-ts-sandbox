import {
  createInitializeMint2Instruction,
  createInitializeMintCloseAuthorityInstruction,
  ExtensionType,
  getMintLen,
  TOKEN_2022_PROGRAM_ID,
  createInitializePermanentDelegateInstruction,
  getAccountLen,
  getMint,
  createInitializeNonTransferableMintInstruction,
  createInitializeAccountInstruction,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  mintTo,
  transfer,
  burn,
  getAccount,
} from '@solana/spl-token'
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  sendAndConfirmTransaction,
  SystemProgram,
  Transaction,
} from '@solana/web3.js'
import {
  spawnTestValidator,
  waitForLocalRpcConnection,
} from './setup/solana-validator'
import { WrappedProcess } from '@marinade.finance/ts-common/dist/src/process'
import { Decimal } from 'decimal.js'

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


      // ------------------- CREATE MINT -------------------
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
      // ------------------- END: CREATE MINT -------------------


      // const token = await createAssociatedToken(
      //   connection,
      //   mint,
      //   adminKeypair,
      //   user
      // )
      // console.log(
      //   `Associated token account ${token.toBase58()} created successfully`
      // )
      // const token2 = await createAssociatedToken(
      //   connection,
      //   mint,
      //   adminKeypair,
      //   user2
      // )
      // console.log(
      //   `Associated token account ${token2.toBase58()} created successfully`
      // )
      // const token3 = await createToken(
      //   connection,
      //   mint,
      //   adminKeypair,
      //   user,
      //   extensions
      // )
      // console.log(`Token account ${token3.toBase58()} created successfully`)
      const token4 = await createSeededToken(
        connection,
        mintKeypair,
        adminKeypair,
        user,
        extensions
      )
      console.log(`Token account ${token4.toBase58()} created successfully`)

      // const token1AmountMint = 10n
      // const token1AmountRemoved = 5n
      // let sig = await mintTo(
      //   connection,
      //   adminKeypair,
      //   mint,
      //   token,
      //   adminKeypair,
      //   token1AmountMint,
      //   [adminKeypair],
      //   undefined,
      //   TOKEN_2022_PROGRAM_ID
      // )
      // console.log(
      //   `Minted ${token1AmountMint} tokens to ${token.toBase58()} with signature ${sig}`
      // )

      // try {
      //   await transfer(
      //     connection,
      //     userKeypair,
      //     token,
      //     token2,
      //     userKeypair,
      //     token1AmountRemoved,
      //     [userKeypair],
      //     undefined,
      //     TOKEN_2022_PROGRAM_ID
      //   )
      //   throw new Error(
      //     'Transfer should have failed due to non-transferable mint'
      //   )
      // } catch (e) {
      //   console.log(`Transfer failed as expected: ${jsonStringify(e, null)}`)
      // }

      // sig = await burn(
      //   connection,
      //   adminKeypair,
      //   token,
      //   mint,
      //   adminKeypair,
      //   token1AmountRemoved,
      //   [adminKeypair],
      //   undefined,
      //   TOKEN_2022_PROGRAM_ID
      // )
      // console.log(
      //   `Burned 5 tokens from ${token.toBase58()} with signature ${sig}`
      // )
      // const tokenAfterBurnData = getAccount(
      //   connection,
      //   token,
      //   'confirmed',
      //   TOKEN_2022_PROGRAM_ID
      // )
      // console.log(
      //   `Token account after burn: ${(await tokenAfterBurnData).amount} tokens`
      // )
      // expect((await tokenAfterBurnData).amount).toBe(
      //   token1AmountMint - token1AmountRemoved
      // )

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
  amount: number = LAMPORTS_PER_SOL
): Promise<void> {
  const signature = await connection.requestAirdrop(publicKey, amount)
  await connection.confirmTransaction(signature, 'confirmed')
  const account = await connection.getAccountInfo(publicKey)
  if (!account) {
    throw new Error(`Account ${publicKey} not found after airdrop`)
  }
}

// eslint-disable-next-line  @typescript-eslint/no-unused-vars
async function createUser(
  connected: Connection,
  lamports: number = LAMPORTS_PER_SOL
): Promise<Keypair> {
  const user = Keypair.generate()
  await airdrop(connected, user.publicKey, lamports)
  return user
}

async function createToken(
  connection: Connection,
  mint: PublicKey,
  minter: Keypair,
  owner: PublicKey,
  extensions: ExtensionType[]
): Promise<PublicKey> {
  const accountLen = getAccountLen(extensions)
  const lamportsToken =
    await connection.getMinimumBalanceForRentExemption(accountLen)
  const tokenKeypair = Keypair.generate()
  const token = tokenKeypair.publicKey

  const transaction = new Transaction().add(
    // createInitializeDefaultAccountStateInstruction(
    //   token,
    //   AccountState.Frozen,
    //   TOKEN_2022_PROGRAM_ID
    // ),
    SystemProgram.createAccount({
      fromPubkey: minter.publicKey,
      newAccountPubkey: token,
      space: accountLen,
      lamports: lamportsToken,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(
      token,
      mint,
      owner,
      TOKEN_2022_PROGRAM_ID
    )
  )
  transaction.feePayer = minter.publicKey
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [minter, tokenKeypair],
    undefined
  )
  return token
}

async function createAssociatedToken(
  connection: Connection,
  mint: PublicKey,
  minter: Keypair,
  owner: PublicKey
): Promise<PublicKey> {
  const associatedToken = await getAssociatedTokenAddress(
    mint,
    owner,
    false,
    TOKEN_2022_PROGRAM_ID
  )
  const transaction = new Transaction().add(
    createAssociatedTokenAccountInstruction(
      minter.publicKey,
      associatedToken,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID
    )
  )
  transaction.feePayer = minter.publicKey
  await sendAndConfirmTransaction(connection, transaction, [minter], undefined)
  return associatedToken
}

// not working, not clear why now. Probably Token Program does not support seeds.
/*
    Message: Transaction simulation failed: Error processing Instruction 0: custom program error: 0x0. 
    Logs: 
    [
      "Program 11111111111111111111111111111111 invoke [1]",
      "Program 11111111111111111111111111111111 failed: custom program error: 0x0"
    ]. 
*/
// eslint-disable-next-line  @typescript-eslint/no-unused-vars
async function createSeededToken(
  connection: Connection,
  mintKeypair: Keypair,
  minter: Keypair,
  owner: PublicKey,
  extensions: ExtensionType[]
): Promise<PublicKey> {
  const accountLen = getAccountLen(extensions)
  const lamportsToken =
    await connection.getMinimumBalanceForRentExemption(accountLen)
  const mint = mintKeypair.publicKey

  const seed = '0x42' + owner.toBase58()
  const seededToken = await PublicKey.createWithSeed(
    minter.publicKey,
    seed,
    TOKEN_2022_PROGRAM_ID
  )
  const transaction = new Transaction().add(
    SystemProgram.createAccountWithSeed({
      fromPubkey: minter.publicKey,
      newAccountPubkey: seededToken,
      space: accountLen,
      lamports: lamportsToken,
      basePubkey: minter.publicKey,
      seed,
      programId: TOKEN_2022_PROGRAM_ID,
    })
    // createInitializeAccountInstruction(
    //   seededToken,
    //   mint,
    //   owner,
    //   TOKEN_2022_PROGRAM_ID
    // )
  )
  transaction.feePayer = minter.publicKey
  console.log(
    `Creating seeded token account ${seededToken.toBase58()} with mint ${mint.toBase58()}`
  )
  await sendAndConfirmTransaction(connection, transaction, [minter], undefined)
  return seededToken
}
