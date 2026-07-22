import {
  AddressLookupTableAccount,
  Keypair,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { serializeVersionedTransaction } from "./serializeVersionedTransaction";

describe("serializeVersionedTransaction", () => {
  it("serializes v0 transactions with address lookup tables", () => {
    const payer = Keypair.generate().publicKey;
    const lookupTableAddress = Keypair.generate().publicKey;
    const lookedUpWritableAccount = Keypair.generate().publicKey;
    const recentBlockhash = Keypair.generate().publicKey.toBase58();

    const lookupTable = new AddressLookupTableAccount({
      key: lookupTableAddress,
      state: {
        deactivationSlot: 0xffffffffffffffffn,
        lastExtendedSlot: 1,
        lastExtendedSlotStartIndex: 0,
        authority: undefined,
        addresses: [lookedUpWritableAccount],
      },
    });

    const instruction = new TransactionInstruction({
      programId: SystemProgram.programId,
      keys: [
        { pubkey: payer, isSigner: true, isWritable: true },
        { pubkey: lookedUpWritableAccount, isSigner: false, isWritable: true },
      ],
      data: new Uint8Array([2]) as unknown as Buffer,
    });

    const message = new TransactionMessage({
      payerKey: payer,
      recentBlockhash,
      instructions: [instruction],
    }).compileToV0Message([lookupTable]);

    const serialized = serializeVersionedTransaction(
      new VersionedTransaction(message),
    );
    const decoded = VersionedTransaction.deserialize(serialized);

    expect(decoded.version).toBe(0);
    expect(decoded.signatures).toHaveLength(1);
    expect(decoded.signatures[0]).toHaveLength(64);
    expect(decoded.message.addressTableLookups).toHaveLength(1);
    expect(
      decoded.message.addressTableLookups[0].accountKey.equals(
        lookupTableAddress,
      ),
    ).toBe(true);
    expect(decoded.message.addressTableLookups[0].writableIndexes).toEqual([0]);
  });
});
