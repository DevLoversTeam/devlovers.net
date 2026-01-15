import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.QUIZ_ENCRYPTION_KEY;
  if (!key) {
    throw new Error('QUIZ_ENCRYPTION_KEY environment variable is not set');
  }
  return Buffer.from(key, 'hex');
}

export interface CorrectAnswersMap {
  [questionId: string]: string;
}

/**
 * Encrypts answers map. Returns base64 string: IV (16b) + AuthTag (16b) + CipherText
 */
export function encryptAnswers(answers: CorrectAnswersMap): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const plaintext = JSON.stringify(answers);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  const result = Buffer.concat([iv, authTag, encrypted]);
  return result.toString('base64');
}

/**
 * Decrypts blob. Returns null if tampered or wrong key.
 */
export function decryptAnswers(encryptedBlob: string): CorrectAnswersMap | null {
  try {
    const key = getEncryptionKey();
    const data = Buffer.from(encryptedBlob, 'base64');

    const iv = data.subarray(0, IV_LENGTH);
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);

    return JSON.parse(decrypted.toString('utf8'));
  } catch {
    // Decryption failed - tampered data or wrong key
    return null;
  }
}

/**
 * Creates encrypted blob from quiz questions
 */
export function createEncryptedAnswersBlob(
  questions: Array<{ id: string; answers: Array<{ id: string; isCorrect: boolean }> }>
): string {
  const answersMap: CorrectAnswersMap = {};

  for (const question of questions) {
    const correctAnswer = question.answers.find(a => a.isCorrect);
    if (correctAnswer) {
      answersMap[question.id] = correctAnswer.id;
    }
  }

  return encryptAnswers(answersMap);
}
