import autoBind from "auto-bind"
import express from "express"
import _ from "lodash"

import {
  attachReadRouteHandlerWrapper,
  attachWriteRouteHandlerWrapper,
} from "@middleware/routeHandler"

import UserSessionData from "@classes/UserSessionData"
import UserWithSiteSessionData from "@classes/UserWithSiteSessionData"

import { CollaboratorRoles } from "@root/constants"
import CollaboratorsService from "@root/services/identity/CollaboratorsService"
import SitesService from "@root/services/identity/SitesService"
import UsersService from "@root/services/identity/UsersService"
import { isIsomerError, RequestHandler } from "@root/types"
import { ResponseErrorBody } from "@root/types/dto /error"
import {
  DashboardReviewRequestDto,
  EditedItemDto,
  RequestChangeDto,
  ReviewRequestDto,
} from "@root/types/dto /review"
import ReviewRequestService from "@services/review/ReviewRequestService"
// eslint-disable-next-line import/prefer-default-export
export class ReviewsRouter {
  private readonly reviewRequestService

  private readonly identityUsersService

  private readonly sitesService

  private readonly collaboratorsService

  constructor(
    reviewRequestService: ReviewRequestService,
    identityUsersService: UsersService,
    sitesService: SitesService,
    collaboratorsService: CollaboratorsService
  ) {
    this.reviewRequestService = reviewRequestService
    this.identityUsersService = identityUsersService
    this.sitesService = sitesService
    this.collaboratorsService = collaboratorsService

    autoBind(this)
  }

  compareDiff: RequestHandler<
    { siteName: string },
    { items: EditedItemDto[] },
    unknown,
    unknown,
    { userWithSiteSessionData: UserWithSiteSessionData }
  > = async (req, res) => {
    // Step 1: Check that user exists.
    // Having session data is proof that this user exists
    // as otherwise, they would be rejected by our middleware
    const { userWithSiteSessionData } = res.locals
    const { siteName } = req.params

    // Check if they have access to site
    const hasAccess = this.identityUsersService.hasAccessToSite(
      userWithSiteSessionData.isomerUserId,
      siteName
    )

    if (!hasAccess) {
      return res.status(400).send()
    }

    const files = await this.reviewRequestService.compareDiff(
      userWithSiteSessionData
    )

    return res.status(200).json({ items: files })
  }

  createReviewRequest: RequestHandler<
    { siteName: string },
    { pullRequestNumber: number } | ResponseErrorBody,
    { reviewers: string[]; title: string; description: string },
    unknown,
    { userWithSiteSessionData: UserWithSiteSessionData }
  > = async (req, res) => {
    // Step 1: Check that the site exists
    const { siteName } = req.params
    const site = await this.sitesService.getBySiteName(siteName)

    if (!site) {
      return res.status(404).send({
        message:
          "Please ensure that the site you are requesting a review for exists!",
      })
    }

    // Step 2: Check that user exists.
    // Having session data is proof that this user exists
    // as otherwise, they would be rejected by our middleware
    const { userWithSiteSessionData } = res.locals

    // Check if they are a site admin
    const role = await this.collaboratorsService.getRole(
      siteName,
      userWithSiteSessionData.isomerUserId
    )

    if (!role || role !== CollaboratorRoles.Admin) {
      return res.status(400).send({
        message: "Only admins can request reviews!",
      })
    }

    const admin = await this.identityUsersService.findByEmail(
      userWithSiteSessionData.email
    )
    const { reviewers, title, description } = req.body

    // Step 3: Check if reviewers are admins of repo
    const reviewersMap: Record<string, boolean> = {}

    // May we repent for writing such code in production.
    reviewers.forEach((email) => {
      reviewersMap[email] = true
    })

    const collaborators = await this.collaboratorsService.list(
      siteName,
      userWithSiteSessionData.isomerUserId
    )

    // Filter to get admins,
    // then ensure that they have been requested for review
    const admins = collaborators
      .filter(
        (collaborator) =>
          collaborator.SiteMember.role === CollaboratorRoles.Admin
      )
      .filter((collaborator) => reviewersMap[collaborator.email || ""])

    const areAllReviewersAdmin = admins.length === reviewers.length
    if (!areAllReviewersAdmin) {
      return res.status(400).send({
        message: "Please ensure that all requested reviewers are admins!",
      })
    }

    // Step 4: Create RR
    const pullRequestNumber = await this.reviewRequestService.createReviewRequest(
      userWithSiteSessionData,
      admins,
      // NOTE: Safe assertion as we first retrieve the role
      // and assert that the user is an admin of said site.
      // This guarantees that the user exists in our database.
      admin!,
      site,
      title,
      description
    )

    return res.status(200).send({
      pullRequestNumber,
    })
  }

  listReviews: RequestHandler<
    { siteName: string },
    { reviews: DashboardReviewRequestDto[] } | ResponseErrorBody,
    never,
    unknown,
    { userWithSiteSessionData: UserWithSiteSessionData }
  > = async (req, res) => {
    // Step 1: Check that the site exists
    const { siteName } = req.params
    const site = await this.sitesService.getBySiteName(siteName)

    if (!site) {
      return res.status(404).send({
        message: "Please ensure that the site exists!",
      })
    }

    // Step 2: Check that user exists.
    // Having session data is proof that this user exists
    // as otherwise, they would be rejected by our middleware
    const { userWithSiteSessionData } = res.locals

    // Check if they are a collaborator
    const role = await this.collaboratorsService.getRole(
      siteName,
      userWithSiteSessionData.isomerUserId
    )

    if (!role) {
      return res.status(400).send({
        message: "Only collaborators of a site can view reviews!",
      })
    }

    // Step 3: Fetch data and return
    const reviews = await this.reviewRequestService.listReviewRequest(
      userWithSiteSessionData,
      site
    )

    return res.status(200).json({
      reviews,
    })
  }

  getReviewRequest: RequestHandler<
    { siteName: string; requestId: number },
    { reviewRequest: ReviewRequestDto } | ResponseErrorBody,
    never,
    unknown,
    { userWithSiteSessionData: UserWithSiteSessionData }
  > = async (req, res) => {
    // Step 1: Check that the site exists
    const { siteName, requestId } = req.params
    const site = await this.sitesService.getBySiteName(siteName)

    if (!site) {
      return res.status(404).send({
        message: "Please ensure that the site exists!",
      })
    }

    // Step 2: Check that user exists.
    // Having session data is proof that this user exists
    // as otherwise, they would be rejected by our middleware
    const { userWithSiteSessionData } = res.locals

    // Check if they are a collaborator
    const role = await this.collaboratorsService.getRole(
      siteName,
      userWithSiteSessionData.isomerUserId
    )

    if (!role) {
      return res.status(400).send({
        message: "Only collaborators of a site can view reviews!",
      })
    }

    const possibleReviewRequest = await this.reviewRequestService.getFullReviewRequest(
      userWithSiteSessionData,
      site,
      requestId
    )

    if (isIsomerError(possibleReviewRequest)) {
      return res.status(possibleReviewRequest.status).send({
        message: possibleReviewRequest.message,
      })
    }

    return res.status(200).json({ reviewRequest: possibleReviewRequest })
  }

  updateReviewRequest: RequestHandler<
    { siteName: string; requestId: number },
    ResponseErrorBody,
    RequestChangeDto,
    unknown,
    { userWithSiteSessionData: UserWithSiteSessionData }
  > = async (req, res) => {
    // Step 1: Check that the site exists
    const { siteName, requestId } = req.params
    const site = await this.sitesService.getBySiteName(siteName)

    if (!site) {
      return res.status(404).send({
        message: "Please ensure that the site exists!",
      })
    }

    // Step 2: Retrieve review request
    const possibleReviewRequest = await this.reviewRequestService.getReviewRequest(
      site,
      requestId
    )

    if (isIsomerError(possibleReviewRequest)) {
      return res.status(404).json({ message: possibleReviewRequest.message })
    }

    // Step 3: Check that the user updating is the requestor
    const { requestor } = possibleReviewRequest
    const { userWithSiteSessionData } = res.locals
    if (requestor.email !== userWithSiteSessionData.email) {
      return res.status(401).json({
        message: "Only requestors can update the review request!",
      })
    }

    // Step 4: Check that all new reviewers are admins of the site
    const { reviewers, title, description } = req.body
    const collaborators = await this.collaboratorsService.list(siteName)
    const collaboratorMappings = Object.fromEntries(
      reviewers.map((reviewer) => [reviewer, true])
    )
    const verifiedReviewers = collaborators.filter(
      (collaborator) =>
        collaborator.SiteMember.role === CollaboratorRoles.Admin &&
        // NOTE: We check for existence of email on the user - since this
        // is an identity feature, we assume that **all** users calling this endpoint
        // will have a valid email (guaranteed by our modal)
        collaborator.email &&
        !!collaboratorMappings[collaborator.email]
    )

    if (verifiedReviewers.length !== reviewers.length) {
      return res.status(400).json({
        message:
          "Please ensure that all requested reviewers are admins of the site!",
      })
    }

    // Step 5: Update the rr with the appropriate details
    return this.reviewRequestService.updateReviewRequest(
      possibleReviewRequest,
      {
        title,
        description,
        reviewers: verifiedReviewers,
      }
    )
  }

  mergeReviewRequest: RequestHandler<
    { siteName: string; requestId: number },
    ResponseErrorBody,
    never,
    unknown,
    { userSessionData: UserSessionData }
  > = async (req, res) => {
    // Step 1: Check that the site exists
    const { siteName, requestId } = req.params
    const site = await this.sitesService.getBySiteName(siteName)

    if (!site) {
      return res.status(404).send({
        message: "Please ensure that the site exists!",
      })
    }

    // Step 2: Check that user exists.
    // Having session data is proof that this user exists
    // as otherwise, they would be rejected by our middleware
    const { userSessionData } = res.locals

    // Check if they are a collaborator
    const role = await this.collaboratorsService.getRole(
      siteName,
      userSessionData.isomerUserId
    )

    if (!role) {
      return res.status(400).send({
        message: "Only collaborators of a site can view reviews!",
      })
    }

    // Step 3: Retrieve review request
    const possibleReviewRequest = await this.reviewRequestService.getReviewRequest(
      site,
      requestId
    )

    if (isIsomerError(possibleReviewRequest)) {
      return res.status(404).json({ message: possibleReviewRequest.message })
    }

    // Step 4: Merge review request
    // NOTE: We are not checking for existence of PR
    // as the underlying Github API returns 404 if
    // the requested review could not be found.
    await this.reviewRequestService.mergeReviewRequest(possibleReviewRequest)
    return res.status(200).send()
  }

  approveReviewRequest: RequestHandler<
    { siteName: string; requestId: number },
    ResponseErrorBody,
    never,
    unknown,
    { userWithSiteSessionData: UserWithSiteSessionData }
  > = async (req, res) => {
    // Step 1: Check that the site exists
    const { siteName, requestId } = req.params
    const site = await this.sitesService.getBySiteName(siteName)

    if (!site) {
      return res.status(404).send({
        message: "Please ensure that the site exists!",
      })
    }

    // Step 3: Retrieve review request
    const possibleReviewRequest = await this.reviewRequestService.getReviewRequest(
      site,
      requestId
    )

    if (isIsomerError(possibleReviewRequest)) {
      return res.status(404).json({ message: possibleReviewRequest.message })
    }

    // Step 4: Check if the user is a reviewer of the RR
    const { userWithSiteSessionData } = res.locals
    const { reviewers } = possibleReviewRequest
    const isReviewer = _.some(
      reviewers,
      (user) => user.email === userWithSiteSessionData.email
    )

    if (!isReviewer) {
      return res.status(401).json({
        message: "Only reviewers can approve Review Requests!",
      })
    }

    // Step 5: Approve review request
    // NOTE: We are not checking for existence of PR
    // as the underlying Github API returns 404 if
    // the requested review could not be found.
    await this.reviewRequestService.approveReviewRequest(possibleReviewRequest)
    return res.status(200).send()
  }

  closeReviewRequest: RequestHandler<
    { siteName: string; requestId: number },
    ResponseErrorBody,
    never,
    unknown,
    { userWithSiteSessionData: UserWithSiteSessionData }
  > = async (req, res) => {
    // Step 1: Check that the site exists
    const { siteName, requestId } = req.params
    const site = await this.sitesService.getBySiteName(siteName)

    if (!site) {
      return res.status(404).send({
        message: "Please ensure that the site exists!",
      })
    }

    // Step 3: Retrieve review request
    const possibleReviewRequest = await this.reviewRequestService.getReviewRequest(
      site,
      requestId
    )

    if (isIsomerError(possibleReviewRequest)) {
      return res
        .status(possibleReviewRequest.status)
        .json({ message: possibleReviewRequest.message })
    }

    // Step 4: Check if the user is the requestor
    const { userWithSiteSessionData } = res.locals
    const { requestor } = possibleReviewRequest
    const isRequestor = requestor.email === userWithSiteSessionData.email
    if (!isRequestor) {
      return res.status(401).json({
        message: "Only the requestor can close the Review Request!",
      })
    }

    // Step 5: Close review request
    // NOTE: We are not checking for existence of PR
    // as the underlying Github API returns 404 if
    // the requested review could not be found.
    await this.reviewRequestService.closeReviewRequest(possibleReviewRequest)
    return res.status(200).send()
  }

  getRouter() {
    const router = express.Router({ mergeParams: true })

    router.get("/compare", attachReadRouteHandlerWrapper(this.compareDiff))
    router.post(
      "/request",
      attachWriteRouteHandlerWrapper(this.createReviewRequest)
    )
    router.get("/summary", attachReadRouteHandlerWrapper(this.listReviews))
    router.get(
      "/:requestId",
      attachReadRouteHandlerWrapper(this.getReviewRequest)
    )
    router.post(
      "/:requestId/merge",
      attachWriteRouteHandlerWrapper(this.mergeReviewRequest)
    )
    router.post(
      "/:requestId/approve",
      attachReadRouteHandlerWrapper(this.approveReviewRequest)
    )
    router.post(
      "/:requestId",
      attachWriteRouteHandlerWrapper(this.updateReviewRequest)
    )
    router.delete(
      "/:requestId",
      attachReadRouteHandlerWrapper(this.closeReviewRequest)
    )

    return router
  }
}
