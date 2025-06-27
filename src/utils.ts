import dotenv from "dotenv";
import {config, helpers, Indexer, BI, RPC} from "@ckb-lumos/lumos";
dotenv.config();

export const isMainnet = process.env.IS_MAINNET === "true" || false;
export const lumosConfig = isMainnet ? config.MAINNET : config.TESTNET;
config.initializeConfig(lumosConfig);

export const privateKey = process.env.CKB_SECP256K1_PRIVATE_KEY;

const CKB_RPC_URL = process.env.CKB_RPC_URL || "https://testnet.ckb.dev/rpc";
const CKB_INDEXER_URL = process.env.CKB_INDEXER_URL || "https://testnet.ckb.dev/indexer";
export const rpc = new RPC(CKB_RPC_URL);
export const indexer = new Indexer(CKB_INDEXER_URL, CKB_RPC_URL);

export const getCapacities = async (address: string): Promise<BI> => {
  const collector = indexer.collector({
    lock: helpers.parseAddress(address),
  });

  let capacities = BI.from(0);
  for await (const cell of collector.collect()) {
    capacities = capacities.add(cell.cellOutput.capacity);
  }

  return capacities;
}