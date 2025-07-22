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
  revoke,
  thawAccount,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
} from '@solana/spl-token'
import { createMemoInstruction } from '@solana/spl-memo'
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
import crypto from 'crypto'
import bs58 from 'bs58'

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
    it('seeded mint token 2022', async () => {
      const userKeypair = Keypair.generate()
      const user = userKeypair.publicKey
      await airdrop(connection, user, 3 * LAMPORTS_PER_SOL)
      const adminKeypair = Keypair.generate() // delegate authority
      const admin = adminKeypair.publicKey
      await airdrop(connection, admin, 55 * LAMPORTS_PER_SOL)
      const mintAmount = 22n

      const [mintAddress, mintIxes] = await getSeededMintInstructions(
        connection,
        userKeypair,
        admin
      )
      const mintDataNone = await connection.getAccountInfo(mintAddress)
      expect(mintDataNone).toBeNull()

      const associatedToken = await getAssociatedTokenAddress(
        mintAddress,
        user,
        false,
        TOKEN_2022_PROGRAM_ID
      )
      const associatedTokenIx =
        createAssociatedTokenAccountIdempotentInstruction(
          user,
          associatedToken,
          user,
          mintAddress,
          TOKEN_2022_PROGRAM_ID
        )

      const mintIx = createMintToInstruction(
        mintAddress,
        associatedToken,
        user,
        mintAmount,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )

      const additionalIxes = [
        SystemProgram.transfer({
          fromPubkey: user,
          toPubkey: admin,
          lamports: 111,
        }),
        createMemoInstruction('This is a memo for the transaction'),
      ]

      const transaction = new Transaction().add(
        ...mintIxes,
        associatedTokenIx,
        mintIx,
        ...additionalIxes
      )
      transaction.feePayer = user
      transaction.recentBlockhash = (
        await connection.getRecentBlockhash()
      ).blockhash
      transaction.sign(userKeypair)
      console.log(
        `Sending a transaction of 'create mint + create token + mint + sol memo transfer' of size ${transaction.serialize().length}`
      )
      try {
        const signature = await sendAndConfirmTransaction(
          connection,
          transaction,
          [userKeypair],
          undefined
        )
        console.log(
          `Transaction confirmed with signature: ${signature}, mint: ${mintAddress.toBase58()}`
        )
      } catch (e) {
        console.error('Transaction failed:', jsonStringify(e, 2))
        throw e
      }

      const mintData = await getMint(
        connection,
        mintAddress,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      )
      console.log(
        `Mint ${mintData.address.toBase58()} created successfully (mint authority: ${mintData.mintAuthority?.toBase58() || 'none'}, ` +
          `decimals: ${mintData.decimals}, supply: ${mintData.supply.toString()}, freezeAuthority: ${mintData.freezeAuthority?.toBase58() || 'none'})`
      )
      expect(mintData.mintAuthority?.toBase58()).toBe(user.toBase58())
      expect(mintData.freezeAuthority?.toBase58()).toBe(admin.toBase58())
      expect(mintData.supply).toBe(mintAmount)

      const mintDataRaw = await connection.getAccountInfo(mintAddress)
      const decimalArray = mintDataRaw ? Array.from(mintDataRaw.data) : []
      console.log('mint data: ' + decimalArray)
      console.log('admin data: ' + Array.from(admin.toBuffer()))
      const tokenDataRaw = await connection.getAccountInfo(associatedToken)
      const tokenData = tokenDataRaw ? Array.from(tokenDataRaw.data) : []
      console.log('token data: ' + tokenData)

      // permanent delegate cannot mint
      await expect(
        multipleMint({
          connection,
          minter: adminKeypair,
          mint: mintAddress,
          mintAmount: 1n,
          tokens: [associatedToken],
        })
      ).rejects.toThrow(/Error: owner does not match/)
      await multipleMint({
        connection,
        minter: userKeypair,
        mint: mintAddress,
        mintAmount: 1n,
        tokens: [associatedToken],
      })

      // permanent delegate cannot transfer as the token is non-transferable
      const adminToken = await createAssociatedToken(
        connection,
        mintAddress,
        adminKeypair,
        admin
      )
      await expect(
        transfer(
          connection,
          adminKeypair,
          associatedToken,
          adminToken,
          adminKeypair, // from authority
          1n,
          [adminKeypair],
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/Transfer is disabled for this mint/)
      // neither user - token owner - can transfer
      await expect(
        transfer(
          connection,
          userKeypair,
          associatedToken,
          adminToken,
          userKeypair, // from authority
          1n,
          [userKeypair],
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/Transfer is disabled for this mint/)

      // burning is possible
      await burn(
        connection,
        adminKeypair,
        associatedToken,
        mintAddress,
        adminKeypair,
        1n,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
      await burn(
        connection,
        userKeypair,
        associatedToken,
        mintAddress,
        userKeypair,
        1n,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
      // we minted some, burned 2, so we should have some - 1 left
      const expectedAmount = mintAmount - 1n
      const accountData = await getAccount(
        connection,
        associatedToken,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      )
      expect(accountData.amount).toBe(expectedAmount)
      await expect(
        burn(
          connection,
          adminKeypair, // tx fee payer
          associatedToken,
          mintAddress,
          adminKeypair,
          expectedAmount + 1n, // burn more than we have
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/Error: insufficient funds/)

      // freeze authority cannot be changed by owner
      await expect(
        setAuthority(
          connection,
          userKeypair, // tx fee payer
          mintAddress,
          userKeypair,
          AuthorityType.FreezeAccount,
          user,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/Error: owner does not match/)
      // but admin as freeze authority can change it
      await setAuthority(
        connection,
        adminKeypair, // tx fee payer
        mintAddress,
        adminKeypair,
        AuthorityType.FreezeAccount,
        admin, // new freeze authority
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )

      // user may change the mint authority (the permanent delegate cannot)
      await setAuthority(
        connection,
        userKeypair,
        mintAddress,
        userKeypair,
        AuthorityType.MintTokens,
        user, // new mint authority
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )

      // get mints that matches the permanent delegate
      //  - data size: 242 with our extensions
      //  - permanent delegate is 13rd in the enum set (https://github.com/solana-program/token-2022/blob/848e9d8fe0a100431743504cbc50cc61b3349797/program/src/extension/mod.rs#L1058)
      //    - it is repr-C, as u16 in little-endian: '12, 0'
      //  - next is size of option data (https://github.com/solana-program/token-2022/blob/848e9d8fe0a100431743504cbc50cc61b3349797/program/src/extension/permanent_delegate.rs)
      //    - 32 bytes for the public key: '32, 0'
      //  - next is the public key of the permanent delegate
      const searchBytes = [12, 0, 32, 0, ...admin.toBytes()]
      const searchData = Buffer.from(searchBytes)
      const dataSize = mintDataRaw?.data.length ?? 0
      const memcmp = {
        offset: dataSize - searchBytes.length,
        bytes: bs58.encode(searchData),
      }
      console.log('memcmp: ' + JSON.stringify(memcmp))
      const accounts = await connection.getProgramAccounts(
        TOKEN_2022_PROGRAM_ID,
        { filters: [{ dataSize }, { memcmp }] }
      )
      console.log(
        `Found ${accounts.length} mints with permanent delegate ${user.toBase58()}`
      )
      expect(accounts.length).toEqual(1)
      expect(accounts[0]?.pubkey.toBase58()).toEqual(mintAddress.toBase58())
    })

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

      const txFeePayer = Keypair.generate()
      await airdrop(connection, txFeePayer.publicKey, 99 * LAMPORTS_PER_SOL)

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

      const token1 = await createAssociatedToken(
        connection,
        mint,
        adminKeypair,
        user
      )
      console.log(
        `Associated token account ${token1.toBase58()} created successfully`
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
        tokens: [token1, token2, token3, token4],
      })

      // Failing to transfer from non-transferable mint
      const transferAmount = 10n

      await expect(
        transfer(
          connection,
          txFeePayer,
          token1,
          token2,
          userKeypair, // from authority
          transferAmount,
          [userKeypair],
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/Transfer is disabled for this mint/)
      let token1Data = await getAccount(
        connection,
        token1,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      )
      expect(token1Data.amount).toBe(mintAmount)
      expect(token1Data.owner.toBase58()).toBe(user.toBase58())
      expect(token1Data.delegate?.toBase58()).toBeUndefined()
      // not possible to transfer token to other token account of the same user
      await expect(
        transfer(
          connection,
          txFeePayer,
          token1,
          token3, // token 3 owner == user
          userKeypair, // from authority
          transferAmount,
          [userKeypair],
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/Transfer is disabled for this mint/)
      const token3Data = await getAccount(
        connection,
        token3,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      )
      expect(token1Data.owner.toBase58()).toEqual(token3Data.owner.toBase58())

      // Failing to change authority
      await expect(
        setAuthority(
          connection,
          txFeePayer,
          token1,
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
          txFeePayer,
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
          txFeePayer,
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
      // note to unfreeze account, you need to call 'thaw' on the frozen account
      await expect(
        freezeAccount(
          connection,
          txFeePayer,
          token1,
          mint,
          userKeypair,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/owner does not match/)

      // Admin may freeze and unfreeze account
      await freezeAccount(
        connection,
        txFeePayer,
        token1,
        mint,
        adminKeypair,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
      console.log(
        `Token account ${token1.toBase58()} frozen successfully by admin ${admin.toBase58()}`
      )
      // user cannot un-freeze account
      await expect(
        thawAccount(
          connection,
          txFeePayer,
          token1,
          mint,
          userKeypair,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/owner does not match/)
      await thawAccount(
        connection,
        txFeePayer,
        token1,
        mint,
        adminKeypair,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
      console.log(
        `Token account ${token1.toBase58()} thawed successfully by admin ${admin.toBase58()}`
      )

      // User can burn
      await burn(
        connection,
        txFeePayer,
        token1,
        mint,
        userKeypair,
        transferAmount,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )

      // User can delegate (revoke is to undelegate)
      await approve(
        connection,
        txFeePayer,
        token1,
        user2,
        userKeypair,
        LAMPORTS_PER_SOL * 10,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
      // Delegate cannot transfer but he can burn
      await expect(
        transfer(
          connection,
          txFeePayer,
          token1,
          token2,
          user2Keypair, // from authority
          transferAmount,
          undefined,
          undefined,
          TOKEN_2022_PROGRAM_ID
        )
      ).rejects.toThrow(/Transfer is disabled for this mint/)
      // User can un-delegate
      await revoke(
        connection,
        txFeePayer,
        token1,
        userKeypair,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
      console.log(
        `Token account ${token1.toBase58()} un-delegated successfully by user ${user.toBase58()}`
      )

      // Admin can burn
      await burn(
        connection,
        txFeePayer,
        token1,
        mint,
        adminKeypair,
        transferAmount,
        undefined,
        undefined,
        TOKEN_2022_PROGRAM_ID
      )
      token1Data = await getAccount(
        connection,
        token1,
        'confirmed',
        TOKEN_2022_PROGRAM_ID
      )
      expect(token1Data.amount).toBe(mintAmount - 2n * transferAmount)
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
  feePayer: Keypair,
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
      feePayer.publicKey,
      associatedToken,
      owner,
      mint,
      TOKEN_2022_PROGRAM_ID
    )
  )
  transaction.feePayer = feePayer.publicKey
  await sendAndConfirmTransaction(
    connection,
    transaction,
    [feePayer],
    undefined
  )
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

async function getSeededMintInstructions(
  connection: Connection,
  minter: Keypair,
  admin: PublicKey,
  seed: string = 'MNDENATIVE_BID'
): Promise<[PublicKey, TransactionInstruction[]]> {
  const extensions: ExtensionType[] = [
    ExtensionType.PermanentDelegate,
    ExtensionType.NonTransferable,
    ExtensionType.MintCloseAuthority,
  ]

  const token22ProgramId = TOKEN_2022_PROGRAM_ID
  const accountLen = getMintLen(extensions)
  const accountRentLamports =
    await connection.getMinimumBalanceForRentExemption(accountLen)
  if (seed.length > 32) {
    throw new Error(
      `Seed must be 32 characters or less, got ${seed.length} (seed: ${seed})`
    )
  }
  const mintSeededAddress = await PublicKey.createWithSeed(
    minter.publicKey,
    seed,
    token22ProgramId
  )
  const instructions = [
    SystemProgram.createAccountWithSeed({
      fromPubkey: minter.publicKey,
      newAccountPubkey: mintSeededAddress,
      space: accountLen,
      lamports: accountRentLamports,
      basePubkey: minter.publicKey,
      seed,
      programId: token22ProgramId,
    }),
    createInitializeNonTransferableMintInstruction(
      mintSeededAddress,
      token22ProgramId
    ),
    createInitializeMintCloseAuthorityInstruction(
      mintSeededAddress,
      admin,
      token22ProgramId
    ),
    // for searching with getProgramAccounts it is important to have this extension as last one
    createInitializePermanentDelegateInstruction(
      mintSeededAddress,
      admin,
      TOKEN_2022_PROGRAM_ID
    ), // -- not possible to initialize immutable owner for a mint
    // createInitializeImmutableOwnerInstruction(
    //   mintSeededAddress,
    //   token22ProgramId
    // ),
    createInitializeMint2Instruction(
      mintSeededAddress,
      0,
      minter.publicKey,
      admin,
      token22ProgramId
    ),
  ]
  console.log(
    `Instructions for creating seeded mint account ${mintSeededAddress.toBase58()} ` +
      `(seed: ${seed}, basePubkey/minter: ${minter.publicKey.toBase58()}, admin: ${admin.toBase58()}) prepared`
  )
  return [mintSeededAddress, instructions]
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
