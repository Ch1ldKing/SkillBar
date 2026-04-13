import "server-only";

import { auth } from "./auth-core";

export { auth, authProviderFlags } from "./auth-core";

export type AuthSession = typeof auth.$Infer.Session;
export type AuthUser = AuthSession["user"];
