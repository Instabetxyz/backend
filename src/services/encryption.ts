import * as crypto from 'crypto';
import * as fs from 'fs/promises';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;

export function generateKey(): Buffer {
  return crypto.randomBytes(KEY_LENGTH);
}

export async function saveKey(key: Buffer, filePath: string): Promise<void> {
  await fs.writeFile(filePath, key);
}

export async function loadKey(filePath: string): Promise<Buffer> {
  const key = await fs.readFile(filePath);
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`);
  }
  return key;
}

export async function encrypt(plaintext: string, key: Buffer): Promise<Buffer<ArrayBuffer>> {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`);
  }

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  const result = Buffer.concat([iv, authTag, ciphertext]);
  return result
}

export async function decrypt(ciphertext: string, key: Buffer): Promise<string> {
  if (key.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`);
  }

  const data = Buffer.from(ciphertext, 'base64');

  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new Error('Invalid ciphertext: too short');
  }

  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const plaintext = Buffer.concat([
    decipher.update(encrypted),
    decipher.final(),
  ]);

  return plaintext.toString('utf8');
}

export async function sealKey(
  encryptionKey: Buffer,
  ownerPublicKey: string
): Promise<string> {
  if (encryptionKey.length !== KEY_LENGTH) {
    throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${encryptionKey.length}`);
  }

  let hexKey = ownerPublicKey.startsWith('0x')
    ? ownerPublicKey.slice(2)
    : ownerPublicKey;

  if (hexKey.length === 66 && (hexKey.startsWith('02') || hexKey.startsWith('03'))) {
    throw new Error('Compressed public key not supported. Use uncompressed key (04 prefix).');
  }

  if (hexKey.startsWith('04')) {
    hexKey = hexKey.slice(2);
  }

  if (hexKey.length !== 128) {
    throw new Error(`Invalid public key: expected 128 hex chars (64 bytes), got ${hexKey.length}`);
  }

  const ecdhInstance = crypto.createECDH('secp256k1');
  ecdhInstance.generateKeys();
  const ephemeralPublicKey = ecdhInstance.getPublicKey('hex', 'uncompressed');

  const otherPublicKey = Buffer.from('04' + hexKey, 'hex');
  const sharedSecret = ecdhInstance.computeSecret(otherPublicKey);

  const aesKey = sharedSecret.subarray(0, 32);

  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, aesKey, iv);

  const encryptedEncryptionKey = Buffer.concat([
    cipher.update(encryptionKey),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const result = Buffer.concat([
    Buffer.from(ephemeralPublicKey, 'hex'),
    iv,
    authTag,
    encryptedEncryptionKey,
  ]);

  return result.toString('base64');
}

export async function unsealKey(
  sealedKey: string,
  ownerPrivateKey: string
): Promise<Buffer> {
  const data = Buffer.from(sealedKey, 'base64');

  const expectedLength = 65 + IV_LENGTH + AUTH_TAG_LENGTH + KEY_LENGTH;
  if (data.length !== expectedLength) {
    throw new Error(`Invalid sealed key length: expected ${expectedLength} bytes, got ${data.length}`);
  }

  const ephemeralPublicKey = data.subarray(0, 65);
  const iv = data.subarray(65, 65 + IV_LENGTH);
  const authTag = data.subarray(65 + IV_LENGTH, 65 + IV_LENGTH + AUTH_TAG_LENGTH);
  const encryptedEncryptionKey = data.subarray(65 + IV_LENGTH + AUTH_TAG_LENGTH);

  const ecdhInstance = crypto.createECDH('secp256k1');
  ecdhInstance.setPrivateKey(Buffer.from(ownerPrivateKey, 'hex'));
  const sharedSecret = ecdhInstance.computeSecret(ephemeralPublicKey);
  const aesKey = sharedSecret.subarray(0, 32);

  const decipher = crypto.createDecipheriv(ALGORITHM, aesKey, iv);
  decipher.setAuthTag(authTag);

  const encryptionKey = Buffer.concat([
    decipher.update(encryptedEncryptionKey),
    decipher.final(),
  ]);

  return encryptionKey;
}