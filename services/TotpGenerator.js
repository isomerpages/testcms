const { totp } = require("otplib")

class TotpGenerator {
  constructor(secret, expiry) {
    this.secret = secret
    this.expiry = expiry || 5
    // We divide expiry window by half and accept otps from the previous window
    // to ensure that otps are valid for at least EXPIRY minutes and a
    // maximum of (EXPIRY * 2) minutes.
    // For example, if EXPIRY = 5 minutes and otp is generate on the 4th minute
    // of the time step. It will be valid for (5 - 4) + 5 = 6 minutes instead of
    // expiring in 1 minute.
    this.generator = totp.clone({
      step: expiry * 60,
      window: [1, 0],
    })
  }

  getExpiryMinutes() {
    // Round down to nearest minute
    return Math.floor(this.expiry)
  }

  getSecret(email) {
    return `${email.toLowerCase()}_${this.secret}`
  }

  generate(email) {
    const secret = this.getSecret(email)
    return this.generator.generate(secret)
  }

  verify(email, otp) {
    const secret = this.getSecret(email)
    return this.generator.verify({ token: otp, secret })
  }
}

module.exports = TotpGenerator
