import dotenv from 'dotenv';
import { CellDep, config, Indexer, RPC, Script } from '@ckb-lumos/lumos';
dotenv.config();

export const isMainnet = process.env.IS_MAINNET === 'true' || false;
export const lumosConfig = isMainnet ? config.MAINNET : config.TESTNET;
config.initializeConfig(lumosConfig);

export const privateKey = process.env.CKB_SECP256K1_PRIVATE_KEY;

export const CKB_RPC_URL = process.env.CKB_RPC_URL || 'https://testnet.ckb.dev/rpc';
export const CKB_INDEXER_URL = process.env.CKB_INDEXER_URL || 'https://testnet.ckb.dev/indexer';
export const rpc = new RPC(CKB_RPC_URL);
export const indexer = new Indexer(CKB_INDEXER_URL, CKB_RPC_URL);

// Minimum Capacity: JoyID lock(55 bytes) + UDT type script(65 bytes) + UDT cell data(16 bytes) + Cell capacity(8 bytes) = 144 bytes
export const ACP_MIN_CAPACITY = 144;
export const ACP_MIN_HEX_CAPACITY = '0x35a4e9000'; // 144 * 10 ** 8 in hexadecimal
// Default capacity for ACP cells in CKB(0.01 CKB for transaction fee)
export const ACP_DEFAULT_CAPACITY = ACP_MIN_CAPACITY + 0.01;

export const USDI_TESTNET_TYPE_SCRIPT: Script = {
  codeHash: '0xcc9dc33ef234e14bc788c43a4848556a5fb16401a04662fc55db9bb201987037',
  hashType: 'type',
  args: '0x71fd1985b2971a9903e4d8ed0d59e6710166985217ca0681437883837b86162f',
};
export const USDI_TESTNET_CELL_DEP: CellDep = {
  outPoint: {
    txHash: '0xaec423c2af7fe844b476333190096b10fc5726e6d9ac58a9b71f71ffac204fee',
    index: '0x0',
  },
  depType: 'code',
};
export const USDI_MAINNET_TYPE_SCRIPT: Script = {
  codeHash: '0xbfa35a9c38a676682b65ade8f02be164d48632281477e36f8dc2f41f79e56bfc',
  hashType: 'type',
  args: '0xd591ebdc69626647e056e13345fd830c8b876bb06aa07ba610479eb77153ea9f',
};
export const USDI_MAINNET_CELL_DEP: CellDep = {
  outPoint: {
    txHash: '0xf6a5eef65101899db9709c8de1cc28f23c1bee90d857ebe176f6647ef109e20d',
    index: '0x0',
  },
  depType: 'code',
};

export const getUsdiTypeScript = () => {
  return isMainnet ? USDI_MAINNET_TYPE_SCRIPT : USDI_TESTNET_TYPE_SCRIPT;
};
export const getUsdiCellDep = (): CellDep => {
  return isMainnet ? USDI_MAINNET_CELL_DEP : USDI_TESTNET_CELL_DEP;
};

export const SECP256K1_LOCK: Script = {
  codeHash: config.getConfig().SCRIPTS.SECP256K1_BLAKE160?.CODE_HASH ?? '',
  hashType: config.getConfig().SCRIPTS.SECP256K1_BLAKE160?.HASH_TYPE ?? 'type',
  args: '0x',
};
export const getSecp256k1Dep = (): CellDep => {
  const secp256k1Dep = lumosConfig.SCRIPTS.SECP256K1_BLAKE160;
  return {
    depType: secp256k1Dep.DEP_TYPE,
    outPoint: {
      txHash: secp256k1Dep.TX_HASH,
      index: secp256k1Dep.INDEX,
    },
  };
};

export const ACP_LOCK: Script = {
  codeHash: config.getConfig().SCRIPTS.ANYONE_CAN_PAY?.CODE_HASH ?? '',
  hashType: config.getConfig().SCRIPTS.ANYONE_CAN_PAY?.HASH_TYPE ?? 'type',
  args: '0x',
};
export const getAcpCellDep = (): CellDep => {
  const acpDep = lumosConfig.SCRIPTS.ANYONE_CAN_PAY;
  return {
    depType: acpDep.DEP_TYPE,
    outPoint: {
      txHash: acpDep.TX_HASH,
      index: acpDep.INDEX,
    },
  };
};
