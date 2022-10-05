import { ModelStatic } from "sequelize"

import UserWithSiteSessionData from "@classes/UserWithSiteSessionData"

import { Reviewer } from "@database/models/Reviewers"
import { ReviewMeta } from "@database/models/ReviewMeta"
import { ReviewRequest } from "@database/models/ReviewRequest"
import { Site } from "@root/database/models/Site"
import { User } from "@root/database/models/User"
import { EditedItemDto, FileType } from "@root/types/dto /review"
import {
  Commit,
  fromGithubCommitMessage,
  RawFileChangeInfo,
} from "@root/types/github"

import { isomerRepoAxiosInstance } from "../api/AxiosInstance"

/**
 * NOTE: This class does not belong as a subset of GitHub service.
 * This is because GitHub service exists to operate on _files_
 * whereas this operates on pull requests.
 *
 * Perhaps we could rename Github service into GitHubFile service
 * and this into GitHubPullRequest service to make the distinction obvious.
 *
 * Separately, this also allows us to add typings into this service.
 */
export default class ReviewRequestService {
  private readonly apiService: typeof isomerRepoAxiosInstance

  private readonly repository: ModelStatic<ReviewRequest>

  private readonly users: ModelStatic<User>

  private readonly reviewers: ModelStatic<Reviewer>

  private readonly reviewMeta: ModelStatic<ReviewMeta>

  constructor(
    apiService: typeof isomerRepoAxiosInstance,
    users: ModelStatic<User>,
    repository: ModelStatic<ReviewRequest>,
    reviewers: ModelStatic<Reviewer>,
    reviewMeta: ModelStatic<ReviewMeta>
  ) {
    this.apiService = apiService
    this.users = users
    this.repository = repository
    this.reviewers = reviewers
    this.reviewMeta = reviewMeta
  }

  compareDiff = async (
    sessionData: UserWithSiteSessionData,
    base = "staging",
    head = "master"
  ): Promise<EditedItemDto[]> => {
    // Step 1: Get the site name
    const { siteName, accessToken } = sessionData

    // Step 2: Get the list of changed files using Github's API
    // Refer here for details; https://docs.github.com/en/rest/commits/commits#compare-two-commits
    // Note that we need a triple dot (...) between base and head refs
    const { files, commits } = await this.apiService
      .get<{ files: RawFileChangeInfo[]; commits: Commit[] }>(
        `${siteName}/compare/${base}...${head}`,
        {
          headers: {
            Authorization: `token ${accessToken}`,
          },
        }
      )
      .then(({ data }) => data)

    const mappings = this.computeShaMappings(commits)

    return files.map(({ filename, sha }) => {
      const fullPath = filename.split("/")
      return {
        type: this.computeFileType(filename),
        // NOTE: The string is guaranteed to be non-empty
        // and hence this should exist.
        name: fullPath.pop() || "",
        // NOTE: pop alters in place
        path: fullPath,
        url: this.computeFileUrl(filename, siteName),
        lastEditedBy: mappings[sha].author,
        lastEditedTime: mappings[sha].unixTime,
      }
    })
  }

  // TODO
  computeFileType = (filename: string): FileType[] => ["page"]

  computeFileUrl = (filename: string, siteName: string) => "www.google.com"

  computeShaMappings = (
    commits: Commit[]
  ): Record<string, { author: string; unixTime: number }> => {
    const mappings: Record<string, { author: string; unixTime: number }> = {}

    // NOTE: commits are allowed to be arbitrarily large.
    // This mode of processing assumes that this is not the case
    // and that n(commits) << BE capability
    commits.forEach(({ commit, message, sha }) => {
      const { userId } = fromGithubCommitMessage(message)
      const lastChangedTime = new Date(commit.author.date).getTime()
      mappings[sha] = {
        author: userId || commit.author.name,
        unixTime: lastChangedTime,
      }
    })
    return mappings
  }

  createReviewRequest = async (
    sessionData: UserWithSiteSessionData,
    reviewers: User[],
    requestor: User,
    site: Site,
    title: string,
    description: string,
    base = "staging",
    head = "master"
  ): Promise<number> => {
    const { siteName, accessToken } = sessionData
    // Step 1: Create an actual pull request on Github
    // From head -> base
    const pullRequestNumber = await this.apiService
      .post<{ number: number }>(
        `${siteName}/pulls`,
        { title, base, head, body: description },
        {
          headers: {
            Authorization: `token ${accessToken}`,
          },
        }
      )
      .then(({ data }) => data.number)

    // Step 2: Only update internal model state once PR is created
    const reviewRequest = await this.repository.create({ requestor, site })
    await this.reviewers.create({
      requestId: reviewRequest.id,
      reviewerId: reviewers.map(({ id }) => id),
    })
    await this.reviewMeta.create({
      reviewId: reviewRequest.id,
      pullRequestNumber,
      reviewLink: `cms.isomer.gov.sg/${siteName}/review/${reviewRequest.id}`,
    })

    return pullRequestNumber
  }
}
