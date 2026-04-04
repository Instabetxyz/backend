import { Wallet } from 'ethers';
import * as crypto from 'crypto';
import * as encryption from '../src/services/encryption';

function getUncompressedPublicKey(privateKey: string): string {
  const ecdh = crypto.createECDH('secp256k1');
  ecdh.setPrivateKey(Buffer.from(privateKey.replace(/^0x/, ''), 'hex'));
  return ecdh.getPublicKey('hex');
}

async function main() {
  console.log('=== 1. Test basic encrypt/decrypt ===\n');

  const key = encryption.generateKey();
  console.log('Generated key:', key.toString('hex'));

  const plaintext = 'Hello, StreamBet!';
  const encrypted = await encryption.encrypt(plaintext, key);
  console.log('Encrypted:', encrypted);

  const decrypted = await encryption.decrypt(encrypted, key);
  console.log('Decrypted:', decrypted);

  if (decrypted !== plaintext) throw new Error('Encrypt/decrypt failed!');
  console.log('✓ encrypt/decrypt passed\n');

  console.log('=== 2. Test seal/unseal key ===\n');

  const wallet = Wallet.createRandom();
  const ownerPrivateKey = wallet.privateKey;
  const ownerPublicKey = getUncompressedPublicKey(ownerPrivateKey);

  console.log('Owner public key (uncompressed):', ownerPublicKey);

  const sealedKey = await encryption.sealKey(key, ownerPublicKey);
  console.log('Sealed key:', sealedKey.slice(0, 50) + '...');

  const unsealedKey = await encryption.unsealKey(sealedKey, ownerPrivateKey.replace(/^0x/, ''));
  console.log('Unsealed key:', unsealedKey.toString('hex'));

  if (unsealedKey.toString('hex') !== key.toString('hex')) {
    throw new Error('Seal/unseal failed!');
  }
  console.log('✓ seal/unseal passed\n');

  console.log('=== 3. Test save/load key ===\n');

  const testPath = '/tmp/test-encryption-key.bin';
  await encryption.saveKey(key, testPath);
  const loadedKey = await encryption.loadKey(testPath);

  if (loadedKey.toString('hex') !== key.toString('hex')) {
    throw new Error('Save/load failed!');
  }
  console.log('✓ save/load passed\n');

  console.log('All tests passed!');
}

main().catch(console.error);