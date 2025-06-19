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
  createInitializeAccount3Instruction,
  setAuthority,
  AuthorityType,
  freezeAccount,
  approve,
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
import crypto from 'crypto'

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
      await airdrop(connection, admin, 55 * LAMPORTS_PER_SOL)

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

      const token = await createAssociatedToken(
        connection,
        mint,
        adminKeypair,
        user
      )
      console.log(
        `Associated token account ${token.toBase58()} created successfully`
      )
      const token2 = await createAssociatedToken(
        connection,
        mint,
        adminKeypair,
        user2
      )
      console.log(
        `Associated account ${token2.toBase58()} created successfully`
      )
      const token3 = await createToken(
        connection,
        mint,
        adminKeypair,
        user,
        extensions
      )
      console.log(`Token account ${token3.toBase58()} created successfully`)
      const token4 = await createSeededToken(
        connection,
        mintKeypair,
        adminKeypair,
        user,
        extensions
      )
      console.log(
        `Seeded token account ${token4.toBase58()} created successfully`
      )

      const mintAmount = 100n
      await multipleMint({
        connection,
        minter: adminKeypair,
        mint,
        mintAmount,
        tokens: [token, token2, token3, token4],
      })

      // Failing to transfer from non-transferable mint
      const transferAmount = 10n

      await expect(
        transfer(
          connection,
          userKeypair,
          token,
          token2,
          userKeypair,
          transferAmount,
          [userKeypair],
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/Transfer is disabled for this mint/)
      let token1 = await getAccount(
        connection,
        token,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      )
      expect(token1.amount).toBe(mintAmount)
      expect(token1.owner.toBase58()).toBe(user.toBase58())
      expect(token1.delegate?.toBase58()).toBeUndefined()

      // Failing to change authority
      await expect(
        setAuthority(
          connection,
          adminKeypair,
          token,
          userKeypair,
          AuthorityType.AccountOwner,
          user2,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/The owner authority cannot be changed/)
      await expect(
        setAuthority(
          connection,
          adminKeypair,
          token3,
          userKeypair,
          AuthorityType.AccountOwner,
          user2,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/The owner authority cannot be changed/)
      await expect(
        setAuthority(
          connection,
          adminKeypair,
          token4,
          userKeypair,
          AuthorityType.AccountOwner,
          user2,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/The owner authority cannot be changed/)

      // User cannot freeze account (frozen account cannot be burned)
      // note to unfreeze account, you need to call 'revoke' on the frozen account
      await expect(
        freezeAccount(
          connection,
          adminKeypair,
          token,
          mint,
          userKeypair,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/owner does not match/)

      // User can burn
      await burn(
          connection,
          adminKeypair,
          token,
          mint,
          userKeypair,
          transferAmount,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )

      // User can delegate
      await approve(
        connection,
        adminKeypair,
        token,
        user2,
        userKeypair,
        LAMPORTS_PER_SOL * 10,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )

      // Admin can burn
      await burn(
        connection,
        adminKeypair,
        token,
        mint,
        adminKeypair,
        transferAmount,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
      token1 = await getAccount(
        connection,
        token,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      )
      expect(token1.amount).toBe(mintAmount - 2n*transferAmount)
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

  const programId = TOKEN_2022_PROGRAM_ID
  // seed cannot be longer than 32 chars, so we use md5 hash of owner public key
  const seed = crypto.createHash('md5').update(owner.toBase58()).digest('hex')
  const seededToken = await PublicKey.createWithSeed(
    mintKeypair.publicKey,
    seed,
    programId
  )
  const transaction = new Transaction().add(
    SystemProgram.createAccountWithSeed({
      fromPubkey: minter.publicKey,
      newAccountPubkey: seededToken,
      space: accountLen,
      lamports: lamportsToken,
      basePubkey: mintKeypair.publicKey,
      seed,
      programId,
    }),
    createInitializeAccount3Instruction(
      seededToken,
      mint,
      owner,
      TOKEN_2022_PROGRAM_ID
    )
  )
  transaction.feePayer = minter.publicKey
  console.log(
    `Creating seeded token account ${seededToken.toBase58()} with mint ${mint.toBase58()}`
  )
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [minter, mintKeypair],
    undefined
  )
  return seededToken
}

async function multipleMint({
  connection,
  minter,
  mint,
  mintAmount,
  tokens,
}: {
  connection: Connection
  minter: Keypair
  mint: PublicKey
  mintAmount: bigint
  tokens: PublicKey[]
}): Promise<string[]> {
  const signatures: string[] = []
  for (const token of tokens) {
    const sig = await mintTo(
      connection,
      minter,
      mint,
      token,
      minter,
      mintAmount,
      [minter],
      undefined,
      TOKEN_2022_PROGRAM_ID
    )
    signatures.push(sig)
  }
  console.log(
    `Minted ${mintAmount} tokens to ${tokens.map(t => t.toBase58()).join(', ')} with signatures ${signatures.join(', ')}`
  )

  return signatures
}
