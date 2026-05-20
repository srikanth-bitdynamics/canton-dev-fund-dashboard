import NextAuth, { type DefaultSession } from 'next-auth';
import GitHub from 'next-auth/providers/github';
import type { Role } from './role-types';

declare module 'next-auth' {
  interface Session {
    user: {
      role: Role;
      githubLogin: string;
      githubId: number;
    } & DefaultSession['user'];
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    role?: Role;
    githubLogin?: string;
    githubId?: number;
    accessToken?: string;
  }
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: {
        params: {
          // read:org needed to check canton-foundation membership
          // read:project needed for Project Board #3/#5 (Phase 2 ext)
          scope: 'read:user read:org read:project',
        },
      },
    }),
  ],
  secret: process.env.AUTH_SECRET,
  trustHost: true,
  callbacks: {
    async jwt({ token, account, profile }) {
      if (account && profile) {
        token.accessToken = account.access_token;
        token.githubLogin = ((profile.login as string) ?? '') || '';
        token.githubId = Number(profile.id ?? 0);
        // Derive role on initial sign-in — lazy import so middleware/Edge bundle stays light
        if (token.githubLogin && account.access_token) {
          const { deriveRole } = await import('./role');
          token.role = await deriveRole(token.githubLogin, account.access_token);
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (token.role) session.user.role = token.role;
      if (token.githubLogin) session.user.githubLogin = token.githubLogin;
      if (token.githubId) session.user.githubId = token.githubId;
      return session;
    },
  },
  pages: {
    // Use default NextAuth pages — admin sign-in flow opens GitHub directly
  },
});
