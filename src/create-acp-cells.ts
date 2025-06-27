import {Cell, commons, config, hd, helpers, Script} from "@ckb-lumos/lumos";
import {bytes, blockchain} from "@ckb-lumos/lumos/codec";
import {privateKey, getCapacities, indexer, rpc, lumosConfig} from "./utils";

const ACP_DEFAULT_CAPACITY = 62; // Default capacity for ACP cells in CKB

/**
 * Creates ACP(anyone-can-pay) cells with a specified single capacity and count.
 * @param {number} count - The number of ACP cells to create.
 * @param {number} capacity - The capacity of each ACP cell in CKB.
 * @returns {Promise<void>}
 */
const createAcpCells = async (count: number = 1, capacity: number = ACP_DEFAULT_CAPACITY): Promise<void> => {
  if (!privateKey) {
    throw new Error("CKB_SECP256K1_PRIVATE_KEY is not set in the environment variables.");
  }
  const args = hd.key.privateKeyToBlake160(privateKey);

  const secp256k1Lock: Script = {
    codeHash: config.getConfig().SCRIPTS.SECP256K1_BLAKE160?.CODE_HASH!,
    hashType: config.getConfig().SCRIPTS.SECP256K1_BLAKE160?.HASH_TYPE!,
    args,
  };
  const secp256k1Address = helpers.encodeToAddress(secp256k1Lock);
  const balance = await getCapacities(secp256k1Address);
  console.log(`The Secp256k1 address's balance: ${balance.div(10 ** 8).toString()} CKB`);

  const acpLock: Script = {
    codeHash: config.getConfig().SCRIPTS.ANYONE_CAN_PAY?.CODE_HASH!,
    hashType: config.getConfig().SCRIPTS.ANYONE_CAN_PAY?.HASH_TYPE!,
    args,
  };

  const singleCapacity = BigInt(capacity * 10 ** 8);
  let txSkeleton = helpers.TransactionSkeleton({cellProvider: indexer});
  const expectedCapacities = singleCapacity * BigInt(count);
  // Collect input cells
  let inputsCapacities = BigInt(0);
  const inputCells: Cell[] = [];
  const collector = indexer.collector({lock: secp256k1Lock, type: "empty"});
  for await (const cell of collector.collect()) {
    inputsCapacities = inputsCapacities + BigInt(cell.cellOutput.capacity);
    inputCells.push(cell);
    if (inputsCapacities > expectedCapacities) {
      break;
    }
  }
  if (inputsCapacities < expectedCapacities) {
    throw new Error(`Not enough capacity, expected: ${expectedCapacities / BigInt(10 ** 8)}, got: ${inputsCapacities / BigInt(10 ** 8)}`);
  }
  txSkeleton = txSkeleton.update("inputs", (inputs) => inputs.concat(inputCells));

  // Construct ACP outputs with the specified capacity and count
  const acpOutputs = Array(count).fill({
    cellOutput: {
      lock: acpLock,
      capacity: `0x${singleCapacity.toString(16)}`,
    },
    data: "0x",
  });
  const changeOutput = {
    cellOutput: {
      lock: secp256k1Lock,
      capacity: `0x${(inputsCapacities - expectedCapacities).toString(16)}`,
    },
    data: "0x",
  }
  txSkeleton = txSkeleton.update("outputs", (outputs) => outputs.push(...acpOutputs, changeOutput));

  const secp256k1Dep = lumosConfig.SCRIPTS.SECP256K1_BLAKE160;
  txSkeleton = helpers.addCellDep(txSkeleton, {
    depType: secp256k1Dep.DEP_TYPE,
    outPoint: {
      txHash: secp256k1Dep.TX_HASH,
      index: secp256k1Dep.INDEX,
    },
  });

  const witnessArgs = {lock: "0x" + "00".repeat(65)};
  const witness = bytes.hexify(blockchain.WitnessArgs.pack(witnessArgs));
  txSkeleton = txSkeleton.update("witnesses", (witnesses) => {
    return witnesses.set(0, witness);
  });
  
  txSkeleton = await commons.common.payFeeByFeeRate(txSkeleton, [secp256k1Address], 1000, undefined, {config: lumosConfig});
  txSkeleton = commons.common.prepareSigningEntries(txSkeleton);
  const message = txSkeleton.get("signingEntries").get(0)?.message;
  const Sig = hd.key.signRecoverable(message!, privateKey);
  const tx = helpers.sealTransaction(txSkeleton, [Sig]);

  const txHash = await rpc.sendTransaction(tx, "passthrough");
  console.log(`tx hash is: ${txHash}`);
};

// Example usage: create 2 ACP cells with a capacity of 62 CKB each
createAcpCells(2)
  .then(() => console.log("ACP cells created successfully."))
  .catch((error) => console.error("Error creating ACP cells:", error));


