import { ethers } from 'ethers';
import { ZgFile, Indexer, MemData } from '@0gfoundation/0g-ts-sdk';
import { config } from '../config';

const provider = new ethers.JsonRpcProvider(config.og.storageRpc, {
  chainId: config.chain.chainId,
  name: '0g-storage',
});

const signer = new ethers.Wallet(config.chain.deployerPrivateKey, provider);

const indexer = new Indexer(config.og.storageIndexerRpc);

export interface UploadResult {
  rootHash: string;
  txHash: string;
}

export interface DownloadOptions {
  withProof?: boolean;
}

export async function uploadFile(
  filePath: string,
  options?: DownloadOptions,
): Promise<UploadResult> {
  const file = await ZgFile.fromFilePath(filePath);

  const [tree, treeErr] = await file.merkleTree();
  if (treeErr !== null) {
    throw new Error(`Merkle tree error: ${treeErr}`);
  }

  const [tx, uploadErr] = await indexer.upload(file, config.og.storageRpc, signer);

  await file.close();

  if (uploadErr !== null) {
    throw new Error(`Upload error: ${uploadErr}`);
  }

  if ('rootHash' in tx) {
    return { rootHash: tx.rootHash, txHash: tx.txHash };
  } else {
    return { rootHash: tx.rootHashes[0], txHash: tx.txHashes[0] };
  }
}

export async function uploadData(
  data: Buffer | Uint8Array
): Promise<UploadResult> {
  const memData = new MemData(data);

  const [tree, treeErr] = await memData.merkleTree();
  if (treeErr !== null) {
    throw new Error(`Merkle tree error: ${treeErr}`);
  }

  const [tx, uploadErr] = await indexer.upload(memData, config.og.storageRpc, signer);

  if (uploadErr !== null) {
    throw new Error(`Upload error: ${uploadErr}`);
  }

  if ('rootHash' in tx) {
    return { rootHash: tx.rootHash, txHash: tx.txHash };
  } else {
    return { rootHash: tx.rootHashes[0], txHash: tx.txHashes[0] };
  }
}

export async function downloadFile(
  rootHash: string,
  outputPath: string,
  options: DownloadOptions = {},
): Promise<void> {
  const { withProof = false } = options;

  const err = await indexer.download(rootHash, outputPath, withProof);
  if (err !== null) {
    throw new Error(`Download error: ${err}`);
  }
}

export async function calculateRootHash(filePath: string): Promise<string> {
  const file = await ZgFile.fromFilePath(filePath);

  const [tree, treeErr] = await file.merkleTree();
  if (treeErr !== null) {
    throw new Error(`Merkle tree error: ${treeErr}`);
  }

  await file.close();

  return tree?.rootHash() ?? '';
}

export { provider, signer, indexer };