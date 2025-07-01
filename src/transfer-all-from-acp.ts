import { BI, Cell, commons, hd, helpers } from '@ckb-lumos/lumos';
import * as codec from '@ckb-lumos/codec';
import {
  privateKey,
  indexer,
  rpc,
  getUsdiTypeScript,
  getUsdiCellDep,
  getAcpCellDep,
} from './constants';
import { calculateTxFee, generateSecp256k1EmptyWitness, getAcpUsdiCells } from './utils';

/**
 * Transfer all USDI from an ACP address to another address.
 * @param acpAddress - The source ACP address to transfer from.
 * @param toAddress - The target address to transfer to.
 */
const transferAllUSDIfromAcpAddress = async (
  acpAddress: string,
  toAddress: string,
): Promise<void> => {
  const fromAcpCells = await getAcpUsdiCells(acpAddress);
  if (!fromAcpCells || fromAcpCells.length === 0) {
    throw new Error(`No ACP cell found for address: ${acpAddress}`);
  }

  let txSkeleton = helpers.TransactionSkeleton({ cellProvider: indexer });

  // Collect USDI input cells from ACP address
  let usdiAmount = BI.from(0);
  let inputsCapacities = BI.from(0);
  const inputCells: Cell[] = [];
  for (const cell of fromAcpCells) {
    usdiAmount = usdiAmount.add(codec.number.Uint128LE.unpack(cell.data));
    inputsCapacities = inputsCapacities.add(BI.from(cell.cellOutput.capacity));
    inputCells.push(cell);
  }
  txSkeleton = txSkeleton.update('inputs', (inputs) => inputs.push(...inputCells));

  console.log(`inputsCapacities: ${inputsCapacities}, hex: ${inputsCapacities.toString(16)}`);

  const output = {
    cellOutput: {
      lock: helpers.parseAddress(toAddress),
      type: getUsdiTypeScript(),
      capacity: `0x${inputsCapacities.toString(16)}`,
    },
    data: '0x' + Buffer.from(codec.number.Uint128LE.pack(usdiAmount)).toString('hex'),
  };
  txSkeleton = txSkeleton.update('outputs', (outputs) => outputs.push(output));

  txSkeleton = txSkeleton.update('cellDeps', (cellDeps) =>
    cellDeps.push(getAcpCellDep(), getUsdiCellDep()),
  );

  txSkeleton = txSkeleton.update('witnesses', (witnesses) => {
    return witnesses.set(0, generateSecp256k1EmptyWitness());
  });

  const txFee = calculateTxFee(txSkeleton, 1000); // Assuming a fee rate of 1000 shannons/KB
  txSkeleton = txSkeleton.update('outputs', (outputs) => {
    return outputs.set(0, {
      cellOutput: {
        ...output.cellOutput,
        capacity: `0x${inputsCapacities.sub(txFee).toString(16)}`,
      },
      data: output.data,
    });
  });

  txSkeleton = commons.common.prepareSigningEntries(txSkeleton);
  const message = txSkeleton.get('signingEntries').get(0)?.message;
  if (!privateKey) {
    throw new Error('CKB_SECP256K1_PRIVATE_KEY is not set in the environment variables.');
  }
  const Sig = hd.key.signRecoverable(message!, privateKey);
  const tx = helpers.sealTransaction(txSkeleton, [Sig]);

  const txHash = await rpc.sendTransaction(tx, 'passthrough');
  console.log(`tx hash is: ${txHash}`);
};

// Example usage: transfer all USDI from an ACP address to another address
// Make sure to replace the addresses with valid ones.
// The source address should be an ACP address with USDI cells, and the target address should
// be a valid address that can receive USDI.
transferAllUSDIfromAcpAddress(
  'ckt1qq6pngwqn6e9vlm92th84rk0l4jp2h8lurchjmnwv8kq3rt5psf4vq0mgqg9nng0tyzhw660mruc5k44akj42cq9melzd',
  'ckt1qrfrwcdnvssswdwpn3s9v8fp87emat306ctjwsm3nmlkjg8qyza2cqgqq8dsj68qt7k5gvvnr200y6xk5tp5wx3xh559cq9j',
)
  .then(() => console.log('USDI transferred successfully'))
  .catch((error) => console.error('Error transferring USDI:', error));
