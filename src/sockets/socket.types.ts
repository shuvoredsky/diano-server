import type { AccessTokenPayload } from '@/utils/jwt.util';

export interface SocketUserPayload extends AccessTokenPayload {
  permissions?: string[];
}

export interface SocketData {
  user: SocketUserPayload;
  messageTimestamps: number[];
}

export interface MinimalBroadcastPayload {
  id: string;
  type: string;
  summary: string;
  timestamp: string;
  [key: string]: unknown;
}

