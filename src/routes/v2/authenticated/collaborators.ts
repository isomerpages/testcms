import autoBind from "auto-bind"
import express from "express"

import { AuthorizationMiddleware } from "@middleware/authorization"
import { attachReadRouteHandlerWrapper } from "@middleware/routeHandler"

import SessionData from "@classes/SessionData"

import { BaseIsomerError } from "@root/errors/BaseError"
import { attachSiteHandler } from "@root/middleware"
import { RequestHandler } from "@root/types"
import CollaboratorsService from "@services/identity/CollaboratorsService"

interface CollaboratorsRouterProps {
  collaboratorsService: CollaboratorsService
  authorizationMiddleware: AuthorizationMiddleware
}

// eslint-disable-next-line import/prefer-default-export
export class CollaboratorsRouter {
  private readonly collaboratorsService

  private readonly authorizationMiddleware

  constructor({
    collaboratorsService,
    authorizationMiddleware,
  }: CollaboratorsRouterProps) {
    this.collaboratorsService = collaboratorsService
    this.authorizationMiddleware = authorizationMiddleware
    autoBind(this)
  }

  createCollaborator: RequestHandler<
    never,
    unknown,
    { email: string; acknowledge?: boolean },
    { siteName: string },
    { sessionData: SessionData }
  > = async (req, res) => {
    const { email, acknowledge = false } = req.body
    const { siteName } = req.params
    const resp = await this.collaboratorsService.create(
      siteName,
      email,
      acknowledge
    )

    // Check for error and throw
    if (resp instanceof BaseIsomerError) {
      throw resp
    }
    return res.sendStatus(200)
  }

  deleteCollaborator: RequestHandler<
    never,
    unknown,
    never,
    { siteName: string; userId: string },
    { sessionData: SessionData }
  > = async (req, res) => {
    const { siteName, userId } = req.params
    const resp = await this.collaboratorsService.delete(siteName, userId)

    // Check for error and throw
    if (resp instanceof BaseIsomerError) {
      throw resp
    }
    return res.sendStatus(200)
  }

  listCollaborators: RequestHandler<
    never,
    unknown,
    never,
    { siteName: string },
    { sessionData: SessionData }
  > = async (req, res) => {
    const { siteName } = req.params
    const { sessionData } = res.locals
    const collaborators = await this.collaboratorsService.list(
      siteName,
      sessionData.getIsomerUserId()
    )

    return res.status(200).json({ collaborators })
  }

  getCollaboratorRole: RequestHandler<
    never,
    unknown,
    never,
    { siteName: string },
    { sessionData: SessionData }
  > = async (req, res) => {
    const { siteName } = req.params
    const { sessionData } = res.locals
    const role = await this.collaboratorsService.getRole(
      siteName,
      sessionData.getIsomerUserId()
    )
    return res.status(200).json({ role })
  }

  getRouter() {
    const router = express.Router({ mergeParams: true })
    router.get(
      "/role",
      attachSiteHandler,
      this.authorizationMiddleware.verifySiteMember,
      attachReadRouteHandlerWrapper(this.getCollaboratorRole)
    )
    router.get(
      "/",
      attachSiteHandler,
      this.authorizationMiddleware.verifySiteMember,
      attachReadRouteHandlerWrapper(this.listCollaborators)
    )
    router.post(
      "/",
      attachSiteHandler,
      this.authorizationMiddleware.verifySiteAdmin,
      attachReadRouteHandlerWrapper(this.createCollaborator)
    )
    router.delete(
      "/:userId",
      attachSiteHandler,
      this.authorizationMiddleware.verifySiteAdmin,
      attachReadRouteHandlerWrapper(this.deleteCollaborator)
    )

    return router
  }
}
