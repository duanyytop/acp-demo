import { helpers, Indexer, BI, RPC, Cell, BIish } from '@ckb-lumos/lumos';
import * as codec from '@ckb-lumos/codec';
import {
  ACP_MIN_HEX_CAPACITY,
  CKB_INDEXER_URL,
  CKB_RPC_URL,
  getUsdiTypeScript,
  isMainnet,
  USDI_MAINNET_TYPE_SCRIPT,
  USDI_TESTNET_TYPE_SCRIPT,
} from './constants';
import { blockchain } from '@ckb-lumos/lumos/codec';
import { createTransactionFromSkeleton, TransactionSkeletonType } from '@ckb-lumos/lumos/helpers';

export const rpc = new RPC(CKB_RPC_URL);
export const indexer = new Indexer(CKB_INDEXER_URL, CKB_RPC_URL);

export const getBalanceAndEmptyCells = async (
  address: string,
): Promise<{ balance: BI; emptyCells: Cell[] }> => {
  const collector = indexer.collector({
    lock: helpers.parseAddress(address),
  });

  let balance = BI.from(0);
  const emptyCells: Cell[] = [];
  for await (const cell of collector.collect()) {
    balance = balance.add(BI.from(cell.cellOutput.capacity));
    if (!cell.cellOutput.type) {
      emptyCells.push(cell);
    }
  }

  return { balance, emptyCells };
};

export const getUSDIBalanceAndCells = async (
  address: string,
): Promise<{ balance: BI; cells: Cell[] }> => {
  const collector = indexer.collector({
    lock: helpers.parseAddress(address),
    type: isMainnet ? USDI_MAINNET_TYPE_SCRIPT : USDI_TESTNET_TYPE_SCRIPT,
  });

  let balance = BI.from(0);
  const cells: Cell[] = [];
  for await (const cell of collector.collect()) {
    balance = balance.add(codec.number.Uint128LE.unpack(cell.data));
    cells.push(cell);
  }

  return { balance, cells };
};

export const getAcpUsdiCell = async (address: string): Promise<Cell | null> => {
  const collector = indexer.collector({
    lock: helpers.parseAddress(address),
    type: getUsdiTypeScript(),
    outputCapacityRange: [ACP_MIN_HEX_CAPACITY, '0xFFFFFFFFFFFFFFFF'],
  });
  for await (const cell of collector.collect()) {
    return cell;
  }
  return null;
};

export const getAcpUsdiCells = async (address: string): Promise<Cell[]> => {
  const collector = indexer.collector({
    lock: helpers.parseAddress(address),
    type: getUsdiTypeScript(),
    outputCapacityRange: [ACP_MIN_HEX_CAPACITY, '0xFFFFFFFFFFFFFFFF'],
  });
  const cells: Cell[] = [];
  for await (const cell of collector.collect()) {
    cells.push(cell);
  }
  return cells;
};

export const generateSecp256k1EmptyWitness = () => {
  const witnessArgs = { lock: '0x' + '00'.repeat(65) };
  const witness = codec.bytes.hexify(blockchain.WitnessArgs.pack(witnessArgs));
  return witness;
};

const getTransactionSize = (txSkeleton: TransactionSkeletonType): number => {
  const tx = createTransactionFromSkeleton(txSkeleton);
  const serializedTx = blockchain.Transaction.pack(tx);
  // 4 is serialized offset bytesize
  const size = serializedTx.byteLength + 4;
  return size;
};

const calculateFeeCompatible = (size: number, feeRate: BIish): BI => {
  const ratio = BI.from(1000);
  const base = BI.from(size).mul(feeRate);
  const fee = base.div(ratio);
  if (fee.mul(ratio).lt(base)) {
    return fee.add(1);
  }
  return BI.from(fee);
};

export const calculateTxFee = (txSkeleton: TransactionSkeletonType, feeRate: number): BI => {
  const size = getTransactionSize(txSkeleton);
  return calculateFeeCompatible(size, feeRate);
};
