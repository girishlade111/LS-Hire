import GoogleProvider from "next-auth/providers/google";
import type { NextAuthOptions } from "next-auth";
import { GMAIL_SCOPES } from "./gmail/client";
import { saveUserToken } from "./redis/tokens";

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID ?? "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
      authorization: {
        params: {
          scope: GMAIL_SCOPES.join(" "),
          access_type: "offline",
          prompt: "consent"
        }
      }
    })
  ],
  session: {
    strategy: "jwt"
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.refresh_token) {
        try {
          await saveUserToken({
            userId: user.id || account.providerAccountId,
            email: user.email ?? "",
            refreshToken: account.refresh_token
          });
        } catch (error) {
          // A Redis outage must not brick sign-in entirely — the token is
          // re-issued on the next consent flow thanks to prompt: "consent".
          console.error(
            "[auth] failed to persist refresh token for user:",
            user.id,
            error
          );
        }
      }
      return true;
    },
    async jwt({ token, account }) {
      if (account) {
        token.userId = account.providerAccountId;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.userId as string;
      }
      return session;
    }
  }
};
