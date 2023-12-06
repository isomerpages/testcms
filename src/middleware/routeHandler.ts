import { BackoffOptions, backOff } from "exponential-backoff"
import simpleGit from "simple-git"

import { config } from "@config/config"

import GithubSessionData from "@classes/GithubSessionData"

import { lock, unlock } from "@utils/mutex-utils"
import { getCommitAndTreeSha, revertCommit } from "@utils/utils.js"

import {
  MAX_CONCURRENT_GIT_PROCESSES,
  STAGING_BRANCH,
  STAGING_LITE_BRANCH,
} from "@constants/constants"

import { FEATURE_FLAGS } from "@root/constants/featureFlags"
import LockedError from "@root/errors/LockedError"
import logger from "@root/logger/logger"
import convertNeverThrowToPromise from "@root/utils/neverthrow"
import GitFileSystemService from "@services/db/GitFileSystemService"

const BRANCH_REF = config.get("github.branchRef")

const backoffOptions: BackoffOptions = {
  numOfAttempts: 5,
}
const simpleGitInstance = simpleGit({
  maxConcurrentProcesses: MAX_CONCURRENT_GIT_PROCESSES,
})
const gitFileSystemService = new GitFileSystemService(simpleGitInstance)

const handleGitFileLock = async (
  repoName: string,
  next: (arg0: any) => void
) => {
  const result = await gitFileSystemService.hasGitFileLock(repoName, true)
  if (result.isErr()) {
    next(result.error)
    return false
  }
  const isGitLocked = result.value
  if (isGitLocked) {
    logger.error(`Failed to lock repo ${repoName}: git file system in use.`)
    next(
      new LockedError(
        `Someone else is currently modifying repo ${repoName}. Please try again later.`
      )
    )
    return false
  }
  return true
}

// Used when there are no write API calls to the repo on GitHub
export const attachReadRouteHandlerWrapper = (routeHandler: any) => async (
  req: any,
  res: any,
  next: any
) => {
  routeHandler(req, res).catch((err: any) => {
    next(err)
  })
}

// Used when there are write API calls to the repo on GitHub
export const attachWriteRouteHandlerWrapper = (routeHandler: any) => async (
  req: any,
  res: any,
  next: any
) => {
  const { siteName } = req.params
  const { growthbook } = req

  let isGitAvailable = true

  // only check git file lock if the repo is ggs enabled
  if (growthbook?.getFeatureValue(FEATURE_FLAGS.IS_GGS_ENABLED, false)) {
    isGitAvailable = await handleGitFileLock(siteName, next)
  }

  if (!isGitAvailable) return

  try {
    await lock(siteName)
  } catch (err) {
    next(err)
    return
  }

  await routeHandler(req, res, next).catch(async (err: any) => {
    await unlock(siteName)
    next(err)
  })

  try {
    await unlock(siteName)
  } catch (err) {
    next(err)
  }
}

export const attachRollbackRouteHandlerWrapper = (routeHandler: any) => async (
  req: any,
  res: any,
  next: any
) => {
  const { userSessionData } = res.locals
  const { siteName } = req.params

  const { accessToken } = userSessionData
  const { growthbook } = req

  const shouldUseGitFileSystem = !!growthbook?.getFeatureValue(
    FEATURE_FLAGS.IS_GGS_ENABLED,
    false
  )

  const isGitAvailable = await handleGitFileLock(siteName, next)
  if (!isGitAvailable) return
  try {
    await lock(siteName)
  } catch (err) {
    next(err)
    return
  }

  let originalStagingCommitSha: any
  let originalStagingLiteCommitSha: any

  if (shouldUseGitFileSystem) {
    const results = await Promise.all([
      gitFileSystemService.getLatestCommitOfBranch(siteName, STAGING_BRANCH),
      gitFileSystemService.getLatestCommitOfBranch(
        siteName,
        STAGING_LITE_BRANCH
      ),
    ])
    const [stagingResult, stagingLiteResult] = results

    if (stagingResult.isErr() || stagingLiteResult.isErr()) {
      await unlock(siteName)
      if (stagingResult.isErr()) next(stagingResult.error)
      if (stagingLiteResult.isErr()) next(stagingLiteResult.error)
      return
    }
    originalStagingCommitSha = stagingResult.value.sha
    originalStagingLiteCommitSha = stagingLiteResult.value.sha
    if (!originalStagingCommitSha || !originalStagingLiteCommitSha) {
      await unlock(siteName)
      if (stagingResult.isErr()) next(stagingResult.error)
      return
    }
    // Unused for git file system, but to maintain existing structure
    res.locals.githubSessionData = new GithubSessionData({
      currentCommitSha: "",
      treeSha: "",
    })
  } else {
    try {
      const {
        currentCommitSha: currentStgCommitSha,
        treeSha: stgTreeSha,
      } = await getCommitAndTreeSha(siteName, accessToken, STAGING_BRANCH)

      const {
        currentCommitSha: currentStgLiteCommitSha,
      } = await getCommitAndTreeSha(siteName, accessToken, STAGING_LITE_BRANCH)

      const githubSessionData = new GithubSessionData({
        currentCommitSha: currentStgCommitSha,
        treeSha: stgTreeSha,
      })
      res.locals.githubSessionData = githubSessionData

      originalStagingCommitSha = currentStgCommitSha
      originalStagingLiteCommitSha = currentStgLiteCommitSha
    } catch (err) {
      await unlock(siteName)
      logger.error(`Failed to rollback repo ${siteName}: ${err}`)
      next(err)
      return
    }
  }

  await routeHandler(req, res, next).catch(async (err: any) => {
    try {
      if (shouldUseGitFileSystem) {
        await backOff(
          () =>
            convertNeverThrowToPromise(
              gitFileSystemService.rollback(
                siteName,
                originalStagingCommitSha,
                STAGING_BRANCH
              )
            ),
          backoffOptions
        )

        await backOff(
          () =>
            convertNeverThrowToPromise(
              gitFileSystemService.rollback(
                siteName,
                originalStagingLiteCommitSha,
                STAGING_LITE_BRANCH
              )
            ),
          backoffOptions
        )

        await backOff(() => {
          let pushRes = gitFileSystemService.push(
            siteName,
            STAGING_BRANCH,
            true
          )
          if (originalStagingLiteCommitSha) {
            pushRes = pushRes.andThen(() =>
              gitFileSystemService.push(siteName, STAGING_LITE_BRANCH, true)
            )
          }

          return convertNeverThrowToPromise(pushRes)
        }, backoffOptions)
      } else {
        await backOff(
          () =>
            revertCommit(
              originalStagingCommitSha,
              siteName,
              accessToken,
              STAGING_BRANCH
            ),
          backoffOptions
        )
        await backOff(
          () =>
            revertCommit(
              originalStagingLiteCommitSha,
              siteName,
              accessToken,
              STAGING_LITE_BRANCH
            ),
          backoffOptions
        )
      }
    } catch (retryErr) {
      await unlock(siteName)
      logger.error(`Failed to rollback repo ${siteName}: ${retryErr}`)
      next(retryErr)
      return
    }
    await unlock(siteName)
    next(err)
  })

  try {
    await unlock(siteName)
  } catch (err) {
    next(err)
  }
}
