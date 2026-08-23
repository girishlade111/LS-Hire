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
    refreshToken: user.refreshToken
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
  return {
    userId,
    email: data.email ?? "",
    refreshToken: data.refreshToken
  };
}

export async function listActiveUserIds(): Promise<string[]> {
  return getRedis().smembers(ACTIVE_USERS_SET);
}

export async function removeUser(userId: string): Promise<void> {
  await getRedis().del(`${USER_KEY_PREFIX}${userId}`);
  await getRedis().srem(ACTIVE_USERS_SET, userId);
}
