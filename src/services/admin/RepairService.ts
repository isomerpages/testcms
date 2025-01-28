import path from "path"

import { fromPromise, ResultAsync } from "neverthrow"

import { lock, unlock } from "@utils/mutex-utils"

import { EFS_VOL_PATH_STAGING_LITE } from "@root/constants"
import GitFileSystemError from "@root/errors/GitFileSystemError"
import LockedError from "@root/errors/LockedError"
import ReposService from "@root/services/identity/ReposService"

import GitFileSystemService from "../db/GitFileSystemService"

const LOCK_TIME_SECONDS = 15 * 60 // 15 minutes

interface RepairServiceProps {
  gitFileSystemService: GitFileSystemService
  reposService: ReposService
}

export class RepairService {
  gitFileSystemService: GitFileSystemService

  reposService: ReposService

  constructor({ gitFileSystemService, reposService }: RepairServiceProps) {
    this.reposService = reposService
    this.gitFileSystemService = gitFileSystemService
  }

  lockRepo(repoName: string, lockDurationSeconds: number = LOCK_TIME_SECONDS) {
    return ResultAsync.fromPromise(
      lock(repoName, lockDurationSeconds),
      (err) => new LockedError(`Unable to lock repo ${repoName}, ${err}`)
    ).map(() => repoName)
  }

  cloneRepo(repoName: string) {
    const repoUrl = `git@github.com:isomerpages/${repoName}.git`

    return (
      this.gitFileSystemService
        .cloneBranch(repoName, true)
        // Repo does not exist in EFS, clone it
        .andThen(() =>
          // repo exists in efs, but we need to pull for staging and reset staging lite
          this.gitFileSystemService
            .pull(repoName, "staging")
            .andThen(() =>
              fromPromise(
                this.reposService.setUpStagingLite(
                  path.join(EFS_VOL_PATH_STAGING_LITE, repoName),
                  repoUrl
                ),
                (error) =>
                  new GitFileSystemError(
                    `Error setting up staging lite for repo ${repoName}: ${error}`
                  )
              )
            )
        )
    )
  }

  unlockRepo(repoName: string) {
    return ResultAsync.fromPromise(
      unlock(repoName),
      (err) => `Failed to unlock repo with error: ${err}`
    )
  }
}
