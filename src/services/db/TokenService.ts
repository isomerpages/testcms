import { AxiosResponse } from "axios"
import {
  Result,
  ok,
  err,
  ResultAsync,
  okAsync,
  errAsync,
  fromPromise,
} from "neverthrow"
import { ModelStatic } from "sequelize"

import logger from "@logger/logger"

import DatabaseError from "@errors/DatabaseError"
import NoAvailableTokenError from "@errors/NoAvailableTokenError"
import TokenParsingError from "@errors/TokenParsingError"

import { AccessToken } from "@database/models"

export const GITHUB_TOKEN_LIMIT = 5000
export const GITHUB_TOKEN_THRESHOLD = 4000 // allowed uses
export const GITHUB_RESET_INTERVAL = 60 * 60 // seconds
export const GITHUB_TOKEN_REMAINING_HEADER = "x-ratelimit-remaining"
export const GITHUB_TOKEN_RESET_HEADER = "x-ratelimit-reset"
const ACTIVE_TOKEN_WARN_LEVEL = 0.6
const ACTIVE_TOKEN_ALARM_LEVEL = 0.8

export type MaybeResetTime = Result<number, null>
export const NO_RESET_TIME: MaybeResetTime = err(null)

export type TokenData = {
  id: number

  tokenString: string

  remainingRequests: number

  resetTime: MaybeResetTime
}

export type MaybeTokenData = Result<TokenData, null>
export const NO_TOKEN_DATA: MaybeTokenData = err(null)

type ResponseTokenData = {
  token: string
  remainingRequests: number
  resetTime: number
}

export function queryActiveTokens(
  tokenDB: ModelStatic<AccessToken>
): ResultAsync<TokenData[], DatabaseError> {
  return fromPromise(
    tokenDB.findAll({
      where: {
        isReserved: false,
      },
    }),
    (error) => {
      const dbError = new DatabaseError(
        `Unable to retrieve active tokens from database: ${error}`
      )
      logger.error(dbError.message)
      return dbError
    }
  ).map((activeTokens) =>
    activeTokens.map((activeToken) => ({
      id: activeToken.id,
      tokenString: activeToken.token,
      remainingRequests: GITHUB_TOKEN_LIMIT,
      resetTime: NO_RESET_TIME,
    }))
  )
}

export function activeUsageAlert(activeTokensData: TokenData[]) {
  const exhaustedTokensCount = activeTokensData.filter(
    (tokenData) =>
      tokenData.remainingRequests <= GITHUB_TOKEN_LIMIT - GITHUB_TOKEN_THRESHOLD
  ).length
  if (
    exhaustedTokensCount >=
    activeTokensData.length * ACTIVE_TOKEN_ALARM_LEVEL
  ) {
    logger.info(
      `${ACTIVE_TOKEN_ALARM_LEVEL * 100}% of access token capacity reached`
    )
    logger.info(
      `${exhaustedTokensCount}/${activeTokensData.length} active tokens exhausted`
    )
  } else if (
    exhaustedTokensCount >=
    activeTokensData.length * ACTIVE_TOKEN_WARN_LEVEL
  ) {
    logger.info(
      `${ACTIVE_TOKEN_WARN_LEVEL * 100}% of access token capacity reached`
    )
    logger.info(
      `${exhaustedTokensCount}/${activeTokensData.length} active tokens exhausted`
    )
  }
}

function validateResponseTokenData(response: AxiosResponse) {
  // response.config.headers.Authorization format: token ghp_********************************
  return (
    typeof response.config?.headers?.Authorization === "string" &&
    response.config?.headers?.Authorization.slice(0, 6) === "token " &&
    !Number.isNaN(+response.headers?.[GITHUB_TOKEN_REMAINING_HEADER]) &&
    !Number.isNaN(+response.headers?.[GITHUB_TOKEN_RESET_HEADER])
  )
}

export function parseResponseTokenData(
  response: AxiosResponse
): Result<ResponseTokenData, TokenParsingError> {
  if (
    !validateResponseTokenData(response) ||
    typeof response.config?.headers?.Authorization !== "string"
  ) {
    logger.error(`Invalid GitHub response format: ${response}`)
    return err(new TokenParsingError(response))
  }

  const token: string = response.config?.headers?.Authorization?.slice(6)
  const remainingRequests = Number(
    response.headers[GITHUB_TOKEN_REMAINING_HEADER]
  )
  const resetTime = Number(response.headers[GITHUB_TOKEN_RESET_HEADER])
  return ok({ token, remainingRequests, resetTime })
}

export function compareResetTime(
  left: TokenData,
  right: TokenData,
  nowEpochSecondsUTC: number
): boolean {
  const leftResetTime = left.resetTime.andThen((resetTime) =>
    resetTime < nowEpochSecondsUTC ? NO_RESET_TIME : ok(resetTime)
  )
  const rightResetTime = right.resetTime.andThen((resetTime) =>
    resetTime < nowEpochSecondsUTC ? NO_RESET_TIME : ok(resetTime)
  )
  if (leftResetTime.isOk() && rightResetTime.isOk()) {
    return leftResetTime.value < rightResetTime.value
  }
  return leftResetTime.isOk()
}

export function selectActiveToken(
  activeTokensData: TokenData[]
): MaybeTokenData {
  let currentBest: MaybeTokenData = NO_TOKEN_DATA
  const now: Date = new Date()
  const nowEpochSecondsUTC: number =
    now.getTime() / 1000 + (now.getTimezoneOffset() * 60) / 1000
  activeTokensData.forEach((activeTokenData) => {
    // Choose earliest non-null reset time from tokens that has not exceeded  threshold
    const notExhaused =
      activeTokenData.remainingRequests >
      GITHUB_TOKEN_LIMIT - GITHUB_TOKEN_THRESHOLD
    const resetTimeHasPast =
      activeTokenData.resetTime.isErr() ||
      activeTokenData.resetTime.value < nowEpochSecondsUTC

    if (notExhaused || resetTimeHasPast) {
      const earlierThanCurrentBest =
        currentBest.isErr() ||
        compareResetTime(activeTokenData, currentBest.value, nowEpochSecondsUTC)
      if (earlierThanCurrentBest) {
        currentBest = ok(activeTokenData)
      }
    }
  })
  return currentBest
}

export function occupyReservedToken(reservedToken: AccessToken) {
  const resetTime = new Date()
  resetTime.setSeconds(resetTime.getSeconds() + GITHUB_RESET_INTERVAL)
  reservedToken.update("resetTime", resetTime)

  // set reset time to null after reset time
  setTimeout(() => {
    reservedToken.update("resetTime", null)
  }, GITHUB_RESET_INTERVAL * 1000)
}

export function sourceReservedToken(
  tokenDB: ModelStatic<AccessToken>
): ResultAsync<MaybeTokenData, DatabaseError> {
  return fromPromise(
    tokenDB.findOne({
      where: {
        isReserved: true,
        resetTime: null,
      },
    }),
    (error) => {
      const dbError = new DatabaseError(
        `Unable to retrieve reserved tokens from database: ${error}`
      )
      logger.error(dbError.message)
      return dbError
    }
  ).map((reservedToken) => {
    if (reservedToken !== null) {
      occupyReservedToken(reservedToken)

      return ok({
        id: reservedToken.id,
        tokenString: reservedToken.token,
        remainingRequests: GITHUB_TOKEN_LIMIT,
        resetTime: NO_RESET_TIME,
      })
    }
    return NO_TOKEN_DATA
  })
}

export function selectReservedToken(
  reservedTokenData: MaybeTokenData,
  tokenDB: ModelStatic<AccessToken>
): ResultAsync<MaybeTokenData, DatabaseError> {
  if (
    reservedTokenData.isOk() &&
    reservedTokenData.value.remainingRequests >
      GITHUB_TOKEN_LIMIT - GITHUB_TOKEN_THRESHOLD
  ) {
    return okAsync(reservedTokenData)
  }
  return sourceReservedToken(tokenDB)
}

type IsReservedTokenType = boolean

export function selectToken(
  useReservedTokens: boolean,
  activeTokenData: TokenData[],
  reservedToken: MaybeTokenData,
  tokenDB: ModelStatic<AccessToken>
): ResultAsync<
  [TokenData, IsReservedTokenType],
  NoAvailableTokenError | DatabaseError
> {
  if (useReservedTokens === false) {
    const activeToken = selectActiveToken(activeTokenData)
    if (activeToken.isOk()) {
      return okAsync([activeToken.value, false])
    }
    logger.info("active tokens capacity reached")
  }
  return selectReservedToken(reservedToken, tokenDB).andThen(
    (newReservedToken) => {
      if (newReservedToken.isOk()) {
        return okAsync<[TokenData, IsReservedTokenType]>([
          newReservedToken.value,
          true,
        ])
      }
      logger.error("All tokens capacity reached")
      return errAsync(new NoAvailableTokenError())
    }
  )
}

export class TokenService {
  private activeTokensData: TokenData[] = []

  private reservedTokenData: MaybeTokenData = NO_TOKEN_DATA

  private useReservedTokens = false

  private initialized = false

  private tokenDB: ModelStatic<AccessToken>

  constructor(tokenDB: ModelStatic<AccessToken>) {
    this.tokenDB = tokenDB
  }

  ensureInitialization(): ResultAsync<boolean, DatabaseError> {
    if (this.initialized) {
      return okAsync(true)
    }
    this.initialized = true
    return queryActiveTokens(this.tokenDB).map((activeTokensData) => {
      this.activeTokensData = activeTokensData
      return false
    })
  }

  private switchToReserve() {
    logger.info("switching to using reserved tokens")
    this.useReservedTokens = true
    setTimeout(() => {
      this.useReservedTokens = false
    }, GITHUB_RESET_INTERVAL * 1000) // 1 hour timeout
  }

  getAccessToken(): ResultAsync<string, NoAvailableTokenError | DatabaseError> {
    return this.ensureInitialization().andThen((_isInitialised) =>
      selectToken(
        this.useReservedTokens,
        this.activeTokensData,
        this.reservedTokenData,
        this.tokenDB
      ).andThen((validToken) => {
        const [tokenData, isReserved] = validToken
        if (isReserved && !this.useReservedTokens) {
          this.switchToReserve()
          this.reservedTokenData = ok(tokenData)
        }
        return okAsync(tokenData.tokenString)
      })
    )
  }

  onResponse = async (response: AxiosResponse) => {
    parseResponseTokenData(response).map((tokenData) =>
      this.updateTokens(
        tokenData.token,
        tokenData.remainingRequests,
        tokenData.resetTime
      )
    )
  }

  updateTokens(token: string, remainingRequests: number, resetTime: number) {
    const foundActiveToken = this.activeTokensData.find(
      (activeTokenData) => activeTokenData.tokenString === token
    )
    if (foundActiveToken !== undefined) {
      foundActiveToken.remainingRequests = remainingRequests
      foundActiveToken.resetTime = ok(resetTime)
    }
    if (
      this.reservedTokenData.isOk() &&
      this.reservedTokenData.value.tokenString === token
    ) {
      this.reservedTokenData.value.remainingRequests = remainingRequests
      this.reservedTokenData.value.resetTime = ok(resetTime)
    }
    if (this.initialized) {
      activeUsageAlert(this.activeTokensData)
    }
  }
}

const tokenServiceInstance = new TokenService(AccessToken)

export { tokenServiceInstance }
