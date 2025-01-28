import "module-alias/register"

import { SgidClient } from "@opengovsg/sgid-client"
import simpleGit from "simple-git"

import { config } from "@config/config"

import { MAX_CONCURRENT_GIT_PROCESSES } from "@constants/constants"

import initSequelize from "@database/index"
import {
  Site,
  SiteMember,
  User,
  Whitelist,
  AccessToken,
  Repo,
  Otp,
  Deployment,
  Launch,
  Redirection,
  IsomerAdmin,
  Notification,
  ReviewRequest,
  ReviewMeta,
  ReviewComment,
  Reviewer,
  ReviewRequestView,
} from "@database/models"
import AuditLogsService from "@root/services/admin/AuditLogsService"
import { RepairService } from "@root/services/admin/RepairService"
import RepoManagementService from "@root/services/admin/RepoManagementService"
import GitFileCommitService from "@root/services/db/GitFileCommitService"
import GitFileSystemService from "@root/services/db/GitFileSystemService"
import RepoService from "@root/services/db/RepoService"
import { BaseDirectoryService } from "@root/services/directoryServices/BaseDirectoryService"
import { CollectionPageService } from "@root/services/fileServices/MdPageServices/CollectionPageService"
import { ContactUsPageService } from "@root/services/fileServices/MdPageServices/ContactUsPageService"
import { HomepagePageService } from "@root/services/fileServices/MdPageServices/HomepagePageService"
import { PageService } from "@root/services/fileServices/MdPageServices/PageService"
import { ResourcePageService } from "@root/services/fileServices/MdPageServices/ResourcePageService"
import { SubcollectionPageService } from "@root/services/fileServices/MdPageServices/SubcollectionPageService"
import { UnlinkedPageService } from "@root/services/fileServices/MdPageServices/UnlinkedPageService"
import { CollectionYmlService } from "@root/services/fileServices/YmlFileServices/CollectionYmlService"
import { ConfigService } from "@root/services/fileServices/YmlFileServices/ConfigService"
import { FooterYmlService } from "@root/services/fileServices/YmlFileServices/FooterYmlService"
import CollaboratorsService from "@root/services/identity/CollaboratorsService"
import LaunchClient from "@root/services/identity/LaunchClient"
import { LaunchesService } from "@root/services/identity/LaunchesService"
import DynamoDBDocClient from "@root/services/infra/DynamoDBClient"
import DynamoDBService from "@root/services/infra/DynamoDBService"
import RepoCheckerService from "@root/services/review/RepoCheckerService"
import ReviewCommentService from "@root/services/review/ReviewCommentService"
import { AuthService } from "@root/services/utilServices/AuthService"
import SgidAuthService from "@root/services/utilServices/SgidAuthService"
import { isomerRepoAxiosInstance } from "@services/api/AxiosInstance"
import { ResourceRoomDirectoryService } from "@services/directoryServices/ResourceRoomDirectoryService"
import { ConfigYmlService } from "@services/fileServices/YmlFileServices/ConfigYmlService"
import {
  getIdentityAuthService,
  getUsersService,
  isomerAdminsService,
  notificationsService,
} from "@services/identity"
import DeploymentsService from "@services/identity/DeploymentsService"
import PreviewService from "@services/identity/PreviewService"
import ReposService from "@services/identity/ReposService"
import { SitesCacheService } from "@services/identity/SitesCacheService"
import SitesService from "@services/identity/SitesService"
import InfraService from "@services/infra/InfraService"
import StepFunctionsService from "@services/infra/StepFunctionsService"
import ReviewRequestService from "@services/review/ReviewRequestService"
import { mailer } from "@services/utilServices/MailClient"

export const sequelize = initSequelize([
  Site,
  SiteMember,
  User,
  Whitelist,
  AccessToken,
  Otp,
  Repo,
  Deployment,
  Launch,
  Redirection,
  IsomerAdmin,
  Notification,
  ReviewMeta,
  ReviewComment,
  Reviewer,
  ReviewRequest,
  ReviewRequestView,
])
export const usersService = getUsersService(sequelize)

export const authService = new AuthService({ usersService })
export const simpleGitInstance = simpleGit({
  maxConcurrentProcesses: MAX_CONCURRENT_GIT_PROCESSES,
})

export const gitFileSystemService = new GitFileSystemService(simpleGitInstance)
export const gitFileCommitService = new GitFileCommitService(
  gitFileSystemService
)

export const gitHubService = new RepoService({
  isomerRepoAxiosInstance,
  gitFileSystemService,
  gitFileCommitService,
})

export const repoManagementService = new RepoManagementService({
  repoService: gitHubService,
})
export const configYmlService = new ConfigYmlService({ gitHubService })
export const footerYmlService = new FooterYmlService({ gitHubService })
export const collectionYmlService = new CollectionYmlService({ gitHubService })
export const baseDirectoryService = new BaseDirectoryService({
  repoService: gitHubService,
})

export const contactUsService = new ContactUsPageService({
  gitHubService,
  footerYmlService,
})
export const collectionPageService = new CollectionPageService({
  gitHubService,
  collectionYmlService,
})
export const subCollectionPageService = new SubcollectionPageService({
  gitHubService,
  collectionYmlService,
})
export const homepageService = new HomepagePageService({ gitHubService })
export const resourcePageService = new ResourcePageService({ gitHubService })
export const unlinkedPageService = new UnlinkedPageService({ gitHubService })
export const resourceRoomDirectoryService = new ResourceRoomDirectoryService({
  baseDirectoryService,
  configYmlService,
  gitHubService,
})
export const pageService = new PageService({
  collectionPageService,
  contactUsService,
  subCollectionPageService,
  homepageService,
  resourcePageService,
  unlinkedPageService,
  resourceRoomDirectoryService,
})
export const reviewCommentService = new ReviewCommentService(ReviewComment)
export const reviewRequestService = new ReviewRequestService(
  gitHubService,
  reviewCommentService,
  mailer,
  User,
  ReviewRequest,
  Reviewer,
  ReviewMeta,
  ReviewRequestView,
  pageService,
  new ConfigService(),
  sequelize
)

export const cacheRefreshInterval = 1000 * 60 * 5 // 5 minutes
export const sitesCacheService = new SitesCacheService(cacheRefreshInterval)
export const previewService = new PreviewService()
export const deploymentsService = new DeploymentsService({
  deploymentsRepository: Deployment,
})
export const sitesService = new SitesService({
  siteRepository: Site,
  gitHubService,
  configYmlService,
  usersService,
  isomerAdminsService,
  reviewRequestService,
  sitesCacheService,
  previewService,
  deploymentsService,
})
export const reposService = new ReposService({
  repository: Repo,
  simpleGit: simpleGitInstance,
})

export const launchClient = new LaunchClient()
export const launchesService = new LaunchesService({
  launchesRepository: Launch,
  repoRepository: Repo,
  deploymentRepository: Deployment,
  redirectionsRepository: Redirection,
  siteRepository: Site,
  launchClient,
})
export const stepFunctionsService = new StepFunctionsService(
  config.get("aws.stepFunctions.stepFunctionsArn")
)
export const dynamoDBService = new DynamoDBService({
  dynamoDBClient: new DynamoDBDocClient(),
})

export const identityAuthService = getIdentityAuthService(gitHubService)
export const collaboratorsService = new CollaboratorsService({
  sequelize,
  siteRepository: Site,
  siteMemberRepository: SiteMember,
  isomerAdminsService,
  sitesService,
  usersService,
  whitelist: Whitelist,
})

export const sgidClient = new SgidClient({
  clientId: config.get("sgid.clientId"),
  clientSecret: config.get("sgid.clientSecret"),
  redirectUri: config.get("sgid.redirectUri"),
  privateKey: config.get("sgid.privateKey"),
})
export const sgidAuthService = new SgidAuthService({
  sgidClient,
})

export const infraService = new InfraService({
  sitesService,
  reposService,
  deploymentsService,
  launchesService,
  collaboratorsService,
  stepFunctionsService,
  dynamoDBService,
  usersService,
})

export const repoCheckerService = new RepoCheckerService({
  siteMemberRepository: SiteMember,
  gitFileSystemService,
  repoRepository: Repo,
  git: simpleGitInstance,
  pageService,
})

export const auditLogsService = new AuditLogsService({
  collaboratorsService,
  isomerAdminsService,
  notificationsService,
  reviewRequestService,
  sitesService,
  usersService,
})

export const repairService = new RepairService({
  reposService,
  gitFileSystemService,
})
