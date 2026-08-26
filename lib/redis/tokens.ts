import { decryptSecret, encryptSecret } from "../security";
import { getRedis } from "./client";

export interface StoredUser {
  userId: string;
  email: string;
  refreshToken: string;
}

const USER_KEY_PREFIX = "user:";
const ACTIVE_USERS_SET = "users:active";

export async function saveUserToken(user: StoredUser): Promise<void> {
  await getRedis().hset(`${USER_KEY_PREFIX}${user.userId}`, {
    email: user.email,
    // Refresh tokens grant full Gmail access — always store encrypted.
    refreshToken: encryptSecret(user.refreshToken)
  });
  await getRedis().sadd(ACTIVE_USERS_SET, user.userId);
}

export async function getUserToken(userId: string): Promise<StoredUser | null> {
  const data = await getRedis().hgetall<Record<string, string>>(
    `${USER_KEY_PREFIX}${userId}`
  );
  if (!data || !data.refreshToken) {
    return null;
  }

  let refreshToken: string;
  try {
    refreshToken = decryptSecret(data.refreshToken);
  } catch (error) {
    console.error(
      `[redis/tokens] stored token for user ${userId} is unreadable (wrong key or tampered); treating as missing:`,
      error
    );
    return null;
  }

  return {
    userId,
    email: data.email ?? "",
    refreshToken
  };
}

export async function listActiveUserIds(): Promise<string[]> {
  return getRedis().smembers(ACTIVE_USERS_SET);
}

export async function removeUser(userId: string): Promise<void> {
  await getRedis().del(`${USER_KEY_PREFIX}${userId}`);
  await getRedis().srem(ACTIVE_USERS_SET, userId);
}
