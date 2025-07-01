import { BI, Cell, commons, hd, helpers } from '@ckb-lumos/lumos';
import {
  privateKey,
  ACP_DEFAULT_CAPACITY,
  getUsdiTypeScript,
  lumosConfig,
  getUsdiCellDep,
  getSecp256k1Dep,
  SECP256K1_LOCK,
  ACP_LOCK,
} from './constants';
import { generateSecp256k1EmptyWitness, getBalanceAndEmptyCells, indexer, rpc } from './utils';

/**
 * Creates ACP(anyone-can-pay) cells with a specified single capacity and count.
 * @param {number} count - The number of ACP cells to create.
 * @param {number} capacity - The capacity of each ACP cell in CKB.
 * @returns {Promise<void>}
 */
const createAcpCells = async (
  count: number = 1,
  capacity: number = ACP_DEFAULT_CAPACITY,
): Promise<void> => {
  if (!privateKey) {
    throw new Error('CKB_SECP256K1_PRIVATE_KEY is not set in the environment variables.');
  }
  const args = hd.key.privateKeyToBlake160(privateKey);

  const secp256k1Lock = {
    ...SECP256K1_LOCK,
    args,
  };
  const secp256k1Address = helpers.encodeToAddress(secp256k1Lock);
  console.log(`Secp256k1 address: ${secp256k1Address}`);
  const { balance } = await getBalanceAndEmptyCells(secp256k1Address);
  console.log(`The Secp256k1 address's balance: ${balance.div(10 ** 8).toString()} CKB`);

  const acpLock = {
    ...ACP_LOCK,
    args,
  };

  const singleCapacity = BI.from(capacity * 10 ** 8);
  let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });
  const expectedCapacities = singleCapacity.mul(BI.from(count));
  // Collect empty input cells
  let inputsCapacities = BI.from(0);
  const inputCells: Cell[] = [];
  const collector = indexer.collector({ lock: secp256k1Lock, type: 'empty' });
  for await (const cell of collector.collect()) {
    inputsCapacities = inputsCapacities.add(BI.from(cell.cellOutput.capacity));
    inputCells.push(cell);
    if (inputsCapacities.gt(expectedCapacities)) {
      break;
    }
  }
  if (inputsCapacities.lt(expectedCapacities)) {
    throw new Error(
      `Not enough capacity, expected: ${expectedCapacities.div(BI.from(10 ** 8))}, got: ${inputsCapacities.div(BI.from(10 ** 8))}`,
    );
  }
  txSkeleton = txSkeleton.update('inputs', (inputs) => inputs.concat(inputCells));

  // Construct ACP outputs with the specified capacity and count
  const acpOutputs = Array(count).fill({
    cellOutput: {
      lock: acpLock,
      type: getUsdiTypeScript(),
      capacity: `0x${singleCapacity.toString(16)}`,
    },
    data: `0x${'00'.repeat(16)}`, // 16 bytes for Uint128LE, amount = 0
  });
  const changeOutput = {
    cellOutput: {
      lock: secp256k1Lock,
      capacity: `0x${inputsCapacities.sub(expectedCapacities).toString(16)}`,
    },
    data: '0x',
  };
  txSkeleton = txSkeleton.update('outputs', (outputs) => outputs.push(...acpOutputs, changeOutput));

  txSkeleton = txSkeleton.update('cellDeps', (cellDeps) =>
    cellDeps.push(getSecp256k1Dep(), getUsdiCellDep()),
  );

  txSkeleton = txSkeleton.update('witnesses', (witnesses) => {
    return witnesses.set(0, generateSecp256k1EmptyWitness());
  });

  txSkeleton = await commons.common.payFeeByFeeRate(
    txSkeleton,
    [secp256k1Address],
    1000,
    undefined,
    { config: lumosConfig },
  );
  txSkeleton = commons.common.prepareSigningEntries(txSkeleton);
  const message = txSkeleton.get('signingEntries').get(0)?.message;
  const Sig = hd.key.signRecoverable(message!, privateKey);
  const tx = helpers.sealTransaction(txSkeleton, [Sig]);

  const txHash = await rpc.sendTransaction(tx, 'passthrough');
  console.log(`tx hash is: ${txHash}`);
};

// Example usage: create 1 ACP cells with a capacity of 144.01 CKB each
createAcpCells(1)
  .then(() => console.log('ACP cells created successfully.'))
  .catch((error) => console.error('Error creating ACP cells:', error));
