import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { genericOAuth } from "better-auth/plugins";

import { getDatabase } from "./db-core";

const githubEnabled = Boolean(
  process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim(),
);

const linuxDoEnabled = Boolean(
  process.env.LINUXDO_CLIENT_ID?.trim() && process.env.LINUXDO_CLIENT_SECRET?.trim(),
);

function getBetterAuthUrl() {
  return process.env.BETTER_AUTH_URL?.trim() || "http://localhost:3000";
}

function getBetterAuthSecret() {
  const secret = process.env.BETTER_AUTH_SECRET?.trim();

  if (secret) {
    return secret;
  }

  return "skillbar-website-dev-secret-change-me-please";
}

const plugins = [
  ...(linuxDoEnabled
    ? [
        genericOAuth({
          config: [
            {
              clientId: process.env.LINUXDO_CLIENT_ID!,
              clientSecret: process.env.LINUXDO_CLIENT_SECRET!,
              discoveryUrl: "https://connect.linux.do/.well-known/openid-configuration",
              pkce: true,
              providerId: "linuxdo",
              // LinuxDO does not include the RFC 9207 `iss` parameter in the
              // authorization response, so Better Auth's extra callback-time
              // issuer enforcement would reject otherwise valid logins.
              requireIssuerValidation: false,
              scopes: ["openid", "profile", "email"],
            },
          ],
        }),
      ]
    : []),
  nextCookies(),
];

export const authProviderFlags = {
  email: true,
  github: githubEnabled,
  linuxdo: linuxDoEnabled,
} as const;

export const auth = betterAuth({
  baseURL: getBetterAuthUrl(),
  database: {
    db: getDatabase(),
    type: "postgres",
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  plugins,
  secret: getBetterAuthSecret(),
  socialProviders: githubEnabled
    ? {
        github: {
          clientId: process.env.GITHUB_CLIENT_ID as string,
          clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
          scope: ["read:user", "user:email"],
        },
      }
    : undefined,
});
