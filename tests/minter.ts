import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { Minter } from "../target/types/minter";
import { PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { expect } from "chai";

describe("minter", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.Minter as Program<Minter>;
  const creator = anchor.web3.Keypair.generate();
  const tipper = anchor.web3.Keypair.generate();

  before(async () => {
    // Airdrop SOL to the creator and tipper accounts
    const airdropCreator = await provider.connection.requestAirdrop(creator.publicKey, 10 * LAMPORTS_PER_SOL);
    const airdropTipper = await provider.connection.requestAirdrop(tipper.publicKey, 10 * LAMPORTS_PER_SOL);
    
    // Wait for the airdrop transactions to be confirmed
    await provider.connection.confirmTransaction(airdropCreator);
    await provider.connection.confirmTransaction(airdropTipper);
  });

  it("Initializes the tip account", async () => {
    const [tipAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("tip_account"), tipper.publicKey.toBuffer()],
      program.programId
    );

    await program.methods
      .initialize()
      .accounts({
        tipAccount: tipAccount,
        tipper: tipper.publicKey,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([tipper])
      .rpc();

    const account = await program.account.tipAccount.fetch(tipAccount);
    expect(account.tipper.toString()).to.equal(tipper.publicKey.toString());
    expect(account.creator.toString()).to.equal(creator.publicKey.toString());
    expect(account.totalTips.toNumber()).to.equal(0);
  });

  it("Sends a tip successfully", async () => {
    const [tipAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("tip_account"), tipper.publicKey.toBuffer()],
      program.programId
    );

    const tipAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);
    const creatorBalanceBefore = await provider.connection.getBalance(creator.publicKey);

    await program.methods
      .sendTip(tipAmount)
      .accounts({
        tipAccount: tipAccount,
        tipper: tipper.publicKey,
        creator: creator.publicKey,
        systemProgram: SystemProgram.programId,
      })
      .signers([tipper])
      .rpc();

    const account = await program.account.tipAccount.fetch(tipAccount);
    expect(account.totalTips.toNumber()).to.equal(tipAmount.toNumber());

    const creatorBalanceAfter = await provider.connection.getBalance(creator.publicKey);
    expect(creatorBalanceAfter - creatorBalanceBefore).to.equal(tipAmount.toNumber());
  });

  it("Prevents self-tipping", async () => {
    const [tipAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("tip_account"), tipper.publicKey.toBuffer()],
      program.programId
    );

    const tipAmount = new anchor.BN(0.1 * LAMPORTS_PER_SOL);

    try {
      await program.methods
        .sendTip(tipAmount)
        .accounts({
          tipAccount: tipAccount,
          tipper: tipper.publicKey,
          creator: tipper.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([tipper])
        .rpc();
      expect.fail("Expected an error but none was thrown");
    } catch (error: any) {
      if (error instanceof anchor.AnchorError) {
        expect(error.error.errorMessage).to.include("You cannot tip yourself");
      } else {
        throw error;
      }
    }
  });

  it("Prevents zero tips", async () => {
    const [tipAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("tip_account"), tipper.publicKey.toBuffer()],
      program.programId
    );

    const tipAmount = new anchor.BN(0);

    try {
      await program.methods
        .sendTip(tipAmount)
        .accounts({
          tipAccount: tipAccount,
          tipper: tipper.publicKey,
          creator: creator.publicKey,
          systemProgram: SystemProgram.programId,
        })
        .signers([tipper])
        .rpc();
      expect.fail("Expected an error but none was thrown");
    } catch (error: any) {
      if (error instanceof anchor.AnchorError) {
        expect(error.error.errorMessage).to.include("The tip amount must be greater than 0");
      } else {
        throw error;
      }
    }
  });
});

