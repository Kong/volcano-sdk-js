interface CredentialPair {
  access_token?: string | null;
  refresh_token?: string | null;
}

// One instance belongs to one explicit sign-in/adoption. Captured operations keep
// it alive across replacement; settled operations do not enter a global registry.
export class AuthSessionOperations<RefreshResult, SignOutResult> {
  constructor(verified: CredentialPair | null = null) {
    this.verifyPair(verified);
  }

  verifyPair(data: CredentialPair | null): void {
    if (this.locallyCleared) {
      return;
    }
    this.verifiedPair = data !== null ? [data.access_token, data.refresh_token] : null;
  }

  clearLocalCredentials(): void {
    if (this.signingOut !== null) {
      return;
    }
    this.locallyCleared = true;
    this.verifiedPair = null;
  }

  hasVerifiedPair(accessToken: string | null, refreshToken: string | null): boolean {
    return (
      refreshToken !== null &&
      refreshToken !== '' &&
      this.verifiedPair?.[0] === accessToken &&
      this.verifiedPair[1] === refreshToken
    );
  }

  refresh(operation: () => Promise<RefreshResult>): Promise<RefreshResult> | null {
    if (this.signingOut !== null || this.locallyCleared) {
      return null;
    }
    this.refreshing ??= Promise.resolve()
      .then(operation)
      .finally(() => {
        this.refreshing = null;
      });
    return this.refreshing;
  }

  signOut(
    operation: (refreshing: Promise<RefreshResult> | null) => Promise<SignOutResult>,
  ): Promise<SignOutResult> {
    if (this.signingOut === null) {
      const refreshing = this.refreshing;
      this.signingOut = Promise.resolve()
        .then(() => operation(refreshing))
        .finally(() => {
          this.verifyPair(null);
          this.refreshing = null;
          this.signOutSettled = true;
        });
    }
    return this.signingOut;
  }
  pendingSignOut(): Promise<SignOutResult> | null {
    return this.signOutSettled ? null : this.signingOut;
  }

  verifiedPair: [string | null | undefined, string | null | undefined] | null = null;
  refreshing: Promise<RefreshResult> | null = null;
  signingOut: Promise<SignOutResult> | null = null;
  signOutSettled = false;
  locallyCleared = false;
  refreshClearedSession = false;
}
