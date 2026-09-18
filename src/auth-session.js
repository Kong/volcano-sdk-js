// One instance belongs to one explicit sign-in/adoption. Captured operations keep
// it alive across replacement; settled operations do not enter a global registry.
export class AuthSessionOperations {
  constructor(verified = null) {
    this.verifyPair(verified);
  }

  verifyPair(data) {
    this.verifiedPair = data ? [data.access_token, data.refresh_token] : null;
  }

  hasVerifiedPair(accessToken, refreshToken) {
    return Boolean(
      refreshToken &&
      this.verifiedPair?.[0] === accessToken &&
      this.verifiedPair?.[1] === refreshToken,
    );
  }

  refresh(operation) {
    if (this.signingOut) {
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
      this.signingOut = Promise.resolve().then(() => operation(refreshing));
    }
    return this.signingOut;
  }
  refreshing = null;
  signingOut = null;
}
