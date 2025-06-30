import { BI, Cell, commons, hd, helpers } from '@ckb-lumos/lumos';
import * as codec from '@ckb-lumos/codec';
import {
  privateKey,
  indexer,
  lumosConfig,
  rpc,
  getUsdiTypeScript,
  getUsdiCellDep,
  getSecp256k1Dep,
  getAcpCellDep,
  SECP256K1_LOCK,
} from './constants';
import {
  getBalanceAndEmptyCells,
  getUSDIBalanceAndCells,
  getAcpUsdiCell,
  generateSecp256k1EmptyWitness,
} from './utils';

/**
 * Transfer USDI assets to ACP(anyone-can-pay) lock.
 * @param {string} targetAddress - The target ACP address to transfer.
 * @param {number} amount  - The amount of USDI to transfer.
 * @returns {Promise<void>}
 */
const transferUSDIToAcpAddress = async (targetAddress: string, amount: number): Promise<void> => {
  if (!privateKey) {
    throw new Error('CKB_SECP256K1_PRIVATE_KEY is not set in the environment variables.');
  }
  const args = hd.key.privateKeyToBlake160(privateKey);

  const secp256k1Lock = {
    ...SECP256K1_LOCK,
    args,
  };
  const secp256k1Address = helpers.encodeToAddress(secp256k1Lock);
  const { balance, emptyCells } = await getBalanceAndEmptyCells(secp256k1Address);
  const { balance: usdiBalance, cells: usdiCells } = await getUSDIBalanceAndCells(secp256k1Address);
  const expectedAmount = BI.from(amount * 10 ** 6); // USDI is in 6 decimal places
  if (usdiBalance < expectedAmount) {
    throw new Error(
      `USDI Insufficient balance, expected: ${amount} USDI, got: ${usdiBalance.div(10 ** 6).toString()}`,
    );
  }
  console.log(
    `The Secp256k1 address's balance: ${balance.div(10 ** 8).toString()} CKB, USDI balance: ${usdiBalance.div(10 ** 6).toString()} USDI`,
  );

  const targetAcpCell = await getAcpUsdiCell(targetAddress);
  if (!targetAcpCell) {
    throw new Error(`No ACP cell found for address: ${targetAddress}`);
  }

  let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });

  // Collect USDI input cells and check if we need an empty cell for transaction fee
  let usdiSupply = BI.from(0);
  let inputsCapacities = BI.from(0);
  let needEmptyCell = true;
  const inputCells: Cell[] = [];
  for (const cell of usdiCells) {
    usdiSupply = usdiSupply.add(codec.number.Uint128LE.unpack(cell.data));
    inputsCapacities = inputsCapacities.add(BI.from(cell.cellOutput.capacity));
    inputCells.push(cell);
    // Check if the cell has enough capacity for transaction fee, if it does, we can skip adding an empty cell
    if (BI.from(cell.cellOutput.capacity).gt(helpers.minimalCellCapacityCompatible(cell))) {
      needEmptyCell = false;
    }
    if (usdiSupply > expectedAmount) {
      break;
    }
  }
  if (usdiSupply < expectedAmount) {
    throw new Error(
      `Not enough USDI, expected: ${amount}, got: ${usdiSupply.div(BI.from(10 ** 6))}`,
    );
  }
  if (needEmptyCell) {
    if (emptyCells.length === 0 || !emptyCells) {
      throw new Error('No empty cell found with enough capacity.');
    }
    inputCells.push(emptyCells[0]);
  }
  txSkeleton = txSkeleton.update('inputs', (inputs) => inputs.push(...inputCells, targetAcpCell));

  const acpOutput = {
    cellOutput: {
      ...targetAcpCell.cellOutput,
      type: getUsdiTypeScript(),
    },
    data: '0x' + Buffer.from(codec.number.Uint128LE.pack(expectedAmount)).toString('hex'),
  };
  const changeUsdiOutput = {
    cellOutput: {
      lock: secp256k1Lock,
      type: getUsdiTypeScript(),
      capacity: `0x${inputsCapacities.toString(16)}`,
    },
    data:
      '0x' +
      Buffer.from(codec.number.Uint128LE.pack(usdiSupply.sub(expectedAmount))).toString('hex'),
  };
  txSkeleton = txSkeleton.update('outputs', (outputs) => outputs.push(changeUsdiOutput, acpOutput));
  if (needEmptyCell) {
    const changeOutput = {
      cellOutput: emptyCells[0].cellOutput,
      data: '0x',
    };
    txSkeleton = txSkeleton.update('outputs', (outputs) => outputs.push(changeOutput));
  }

  txSkeleton = txSkeleton.update('cellDeps', (cellDeps) =>
    cellDeps.push(getSecp256k1Dep(), getAcpCellDep(), getUsdiCellDep()),
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

// Example usage: transfer 0.1 USDI to an ACP address
// Note: Make sure the target address is a valid ACP address and has enough capacity to hold
transferUSDIToAcpAddress(
  'ckt1qq6pngwqn6e9vlm92th84rk0l4jp2h8lurchjmnwv8kq3rt5psf4vq0e4xk4rmg5jdkn8aams492a7jlg73ue0ghutfuy',
  0.1,
)
  .then(() => console.log('USDI transferred successfully.'))
  .catch((error) => console.error('Error transferring USDI:', error));
