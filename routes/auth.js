const axios = require("axios")
const express = require("express")
const queryString = require("query-string")
const uuid = require("uuid/v4")
const validator = require("validator")

const logger = require("@logger/logger")

// Import error
const { AuthError } = require("@errors/AuthError")
const { BadRequestError } = require("@errors/BadRequestError")
const { ForbiddenError } = require("@errors/ForbiddenError")

// Import middleware
const { attachReadRouteHandlerWrapper } = require("@middleware/routeHandler")

const validateStatus = require("@utils/axios-utils")
const jwtUtils = require("@utils/jwt-utils")

// Import services
const { authService, userService } = require("@services")

const router = express.Router()

const { CLIENT_ID } = process.env
const { CLIENT_SECRET } = process.env
const { REDIRECT_URI } = process.env
const AUTH_TOKEN_EXPIRY_MS = parseInt(
  process.env.AUTH_TOKEN_EXPIRY_DURATION_IN_MILLISECONDS,
  10
)
const CSRF_TOKEN_EXPIRY_MS = 600000
const { FRONTEND_URL } = process.env

const CSRF_COOKIE_NAME = "isomer-csrf"
const COOKIE_NAME = "isomercms"

async function clearAllCookies(res) {
  const cookieSettings = {
    path: "/",
  }

  res.clearCookie(COOKIE_NAME, cookieSettings)
  res.clearCookie(CSRF_COOKIE_NAME, cookieSettings)
}

async function sendOtp(req, res) {
  const { email } = req.body
  if (!email || !validator.isEmail(email)) {
    throw new BadRequestError("Please provide a valid email")
  }

  try {
    if (!(await authService.canSendOtp(email))) {
      throw new Error(`Invalid email ${email}`)
    }
    await authService.sendOtp(email)
    return res.sendStatus(200)
  } catch (err) {
    logger.error(err.message)
    throw new AuthError("Unable to send OTP")
  }
}

async function verifyOtp(req, res) {
  const { email, otp } = req.body
  if (!email || !validator.isEmail(email))
    throw new BadRequestError("Please provide email")
  if (!otp) throw new BadRequestError("Please provide OTP")

  if (!authService.verifyOtp(email, otp)) {
    throw new AuthError("Invalid OTP")
  }

  // If OTP is valid, redirect to github login
  const state = uuid()
  const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${CLIENT_ID}&state=${state}&scope=repo`

  const csrfTokenExpiry = new Date()
  csrfTokenExpiry.setTime(csrfTokenExpiry.getTime() + CSRF_TOKEN_EXPIRY_MS)

  const cookieSettings = {
    expires: csrfTokenExpiry,
    httpOnly: true,
    secure:
      process.env.NODE_ENV !== "DEV" && process.env.NODE_ENV !== "LOCAL_DEV",
  }

  // Include user email in the cookie
  const token = jwtUtils.signToken({ state, email })

  res.cookie(CSRF_COOKIE_NAME, token, cookieSettings)
  return res.status(200).json({ githubAuthUrl })
}

async function githubAuth(req, res) {
  const csrfState = req.cookies[CSRF_COOKIE_NAME]
  const { code, state } = req.query

  let email
  try {
    const decoded = jwtUtils.verifyToken(csrfState)
    if (decoded.state !== state) throw new Error("State does not match")
    email = decoded.email
  } catch (err) {
    throw new ForbiddenError()
  }

  const params = {
    code,
    redirect_uri: REDIRECT_URI,
    state,
  }

  const resp = await axios.post(
    "https://github.com/login/oauth/access_token",
    params,
    {
      auth: {
        username: CLIENT_ID,
        password: CLIENT_SECRET,
      },
    }
  )

  const { access_token: accessToken } = queryString.parse(resp.data)
  if (!accessToken) throw new AuthError("Access token not found")

  // Retrieve user information to put into access token
  const endpoint = `https://api.github.com/user`
  const userResp = await axios.get(endpoint, {
    validateStatus,
    headers: {
      Authorization: `token ${accessToken}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
  })

  let userId
  if (userResp.data) userId = userResp.data.login

  // Find or create user after GitHub auth passes
  const user = await userService.findOrCreate(email)
  if (!user) throw Error("Failed to create user")

  const authTokenExpiry = new Date()
  authTokenExpiry.setTime(authTokenExpiry.getTime() + AUTH_TOKEN_EXPIRY_MS)

  const cookieSettings = {
    path: "/",
    expires: authTokenExpiry,
    httpOnly: true,
    sameSite: true,
    secure:
      process.env.NODE_ENV !== "DEV" && process.env.NODE_ENV !== "LOCAL_DEV",
  }

  const token = jwtUtils.signToken({
    access_token: accessToken,
    user_id: userId,
    isomer_user_id: user.id,
  })

  res.cookie(COOKIE_NAME, token, cookieSettings)
  return res.redirect(`${FRONTEND_URL}/sites`)
}

async function logout(req, res) {
  clearAllCookies(res)
  return res.sendStatus(200)
}

async function whoami(req, res) {
  const { accessToken } = req

  // Make a call to github
  const endpoint = "https://api.github.com/user"

  try {
    const resp = await axios.get(endpoint, {
      headers: {
        Authorization: `token ${accessToken}`,
        "Content-Type": "application/json",
      },
    })
    const userId = resp.data.login
    return res.status(200).json({ userId })
  } catch (err) {
    clearAllCookies(res)
    // Return a 401 os that user will be redirected to logout
    return res.sendStatus(401)
  }
}

router.post("/otp", attachReadRouteHandlerWrapper(sendOtp))
router.post("/login", attachReadRouteHandlerWrapper(verifyOtp))
router.get("/", attachReadRouteHandlerWrapper(githubAuth))
router.get("/logout", attachReadRouteHandlerWrapper(logout))
router.get("/whoami", attachReadRouteHandlerWrapper(whoami))

module.exports = router
