// One instance belongs to one explicit sign-in/adoption. Captured operations keep
// it alive across replacement; settled operations do not enter a global registry.
export class AuthSessionOperations {
  constructor(verified = null) {
    this.verifyPair(verified);
  }

  verifyPair(data) {
    if (this.locallyCleared) {
      return;
    }
    this.verifiedPair = data ? [data.access_token, data.refresh_token] : null;
  }

  clearLocalCredentials() {
    if (this.signingOut) {
      return;
    }
    this.locallyCleared = true;
    this.verifiedPair = null;
  }

  hasVerifiedPair(accessToken, refreshToken) {
    return Boolean(
      refreshToken &&
      this.verifiedPair?.[0] === accessToken &&
      this.verifiedPair?.[1] === refreshToken,
    );
  }

  refresh(operation) {
    if (this.signingOut || this.locallyCleared) {
      return null;
    }
    if (!this.refreshing) {
      this.refreshing = Promise.resolve()
        .then(operation)
        .finally(() => {
          this.refreshing = null;
        });
    }
    return this.refreshing;
  }

  signOut(operation) {
    if (!this.signingOut) {
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
  pendingSignOut() {
    return this.signOutSettled ? null : this.signingOut;
  }

  refreshing = null;
  signingOut = null;
  signOutSettled = false;
  locallyCleared = false;
  refreshClearedSession = false;
}
