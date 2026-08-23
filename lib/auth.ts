import GoogleProvider from "next-auth/providers/google";
import type { DefaultSession, NextAuthOptions } from "next-auth";
import { GMAIL_SCOPES } from "./gmail/client";
import { saveUserToken } from "./redis/tokens";

declare module "next-auth" {
  interface Session {
    user?: DefaultSession["user"] & { id: string };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    userId?: string;
  }
}

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
        await saveUserToken({
          userId: user.id || account.providerAccountId,
          email: user.email ?? "",
          refreshToken: account.refresh_token
        });
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
      session.user.id = token.userId as string;
      return session;
    }
  }
};
