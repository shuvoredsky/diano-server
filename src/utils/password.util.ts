import bcrypt from 'bcrypt';
import { env } from '@/config/env.config';

/**
 * Hashes a plaintext password using bcrypt with configured salt rounds.
 */
export const hashPassword = async (password: string): Promise<string> => {
  return bcrypt.hash(password, env.BCRYPT_ROUNDS);
};

/**
 * Compares a plaintext password against a stored bcrypt hash.
 */
export const comparePassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};

/**
 * Checks if a bcrypt hash was created with fewer rounds than currently configured.
 * Bcrypt hash format: $2a$10$... or $2b$12$... where parts[2] is the round count.
 */
export const needsRehash = (hash: string): boolean => {
  const parts = hash.split('$');
  if (parts.length < 4) return true;
  const rounds = parseInt(parts[2] ?? '0', 10);
  return rounds < env.BCRYPT_ROUNDS;
};

/**
 * Password strength policy:
 * - Minimum 8 characters
 * - At least one uppercase letter
 * - At least one lowercase letter
 * - At least one number
 * - At least one special character
 */
export const PASSWORD_REGEX =
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{8,}$/;

export const isPasswordStrong = (password: string): boolean => {
  return PASSWORD_REGEX.test(password);
};
