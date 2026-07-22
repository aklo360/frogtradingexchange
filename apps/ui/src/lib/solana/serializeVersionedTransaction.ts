import {
  type MessageV0,
  type VersionedTransaction,
} from "@solana/web3.js";

const BASE58_ALPHABET =
  "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

const BASE58_VALUES = new Map(
  [...BASE58_ALPHABET].map((character, index) => [character, index]),
);

const SIGNATURE_LENGTH = 64;
const PUBLIC_KEY_LENGTH = 32;
const MESSAGE_VERSION_0_PREFIX = 1 << 7;

const encodeLength = (length: number) => {
  const bytes: number[] = [];
  let remaining = length;

  for (;;) {
    let element = remaining & 0x7f;
    remaining >>= 7;

    if (remaining === 0) {
      bytes.push(element);
      break;
    }

    element |= 0x80;
    bytes.push(element);
  }

  return new Uint8Array(bytes);
};

const concatBytes = (parts: Uint8Array[]) => {
  const totalLength = parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }

  return bytes;
};

const decodeBase58 = (value: string) => {
  let accumulator = 0n;

  for (const character of value) {
    const digit = BASE58_VALUES.get(character);
    if (digit === undefined) {
      throw new Error("Invalid base58 value");
    }
    accumulator = accumulator * 58n + BigInt(digit);
  }

  const decoded: number[] = [];
  while (accumulator > 0n) {
    decoded.push(Number(accumulator & 0xffn));
    accumulator >>= 8n;
  }

  for (const character of value) {
    if (character !== "1") break;
    decoded.push(0);
  }

  return new Uint8Array(decoded.reverse());
};

const serializeMessageV0 = (message: MessageV0) => {
  const blockhashBytes = decodeBase58(message.recentBlockhash);
  if (blockhashBytes.length !== PUBLIC_KEY_LENGTH) {
    throw new Error("Recent blockhash must decode to 32 bytes");
  }

  const serializedInstructions = message.compiledInstructions.flatMap(
    (instruction) => [
      new Uint8Array([instruction.programIdIndex]),
      encodeLength(instruction.accountKeyIndexes.length),
      new Uint8Array(instruction.accountKeyIndexes),
      encodeLength(instruction.data.length),
      new Uint8Array(instruction.data),
    ],
  );

  const serializedAddressTableLookups = message.addressTableLookups.flatMap(
    (lookup) => [
      lookup.accountKey.toBytes(),
      encodeLength(lookup.writableIndexes.length),
      new Uint8Array(lookup.writableIndexes),
      encodeLength(lookup.readonlyIndexes.length),
      new Uint8Array(lookup.readonlyIndexes),
    ],
  );

  return concatBytes([
    new Uint8Array([
      MESSAGE_VERSION_0_PREFIX,
      message.header.numRequiredSignatures,
      message.header.numReadonlySignedAccounts,
      message.header.numReadonlyUnsignedAccounts,
    ]),
    encodeLength(message.staticAccountKeys.length),
    ...message.staticAccountKeys.map((key) => key.toBytes()),
    blockhashBytes,
    encodeLength(message.compiledInstructions.length),
    ...serializedInstructions,
    encodeLength(message.addressTableLookups.length),
    ...serializedAddressTableLookups,
  ]);
};

export const serializeVersionedTransaction = (
  transaction: VersionedTransaction,
) => {
  if (transaction.version !== 0) {
    return transaction.serialize();
  }

  const signatures = transaction.signatures.map((signature) => {
    if (signature.length !== SIGNATURE_LENGTH) {
      throw new Error("Solana signature must be 64 bytes");
    }
    return new Uint8Array(signature);
  });

  return concatBytes([
    encodeLength(signatures.length),
    ...signatures,
    serializeMessageV0(transaction.message as MessageV0),
  ]);
};
