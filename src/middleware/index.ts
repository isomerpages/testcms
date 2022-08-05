import FormSG from "@opengovsg/formsg-sdk"
import express, {
  NextFunction,
  Request,
  Response,
  RequestHandler as ExpressRequestHandler,
} from "express"

import { AuthorizationMiddleware } from "@middleware/authorization"

import UserSessionData from "@classes/UserSessionData"

import UserWithSiteSessionData from "@root/classes/UserWithSiteSessionData"
import { AuthenticationMiddleware } from "@root/middleware/authentication"
import AuthenticationMiddlewareService from "@root/services/middlewareServices/AuthenticationMiddlewareService"
import { RequestHandler } from "@root/types"
import AuthService from "@services/identity/AuthService"
import IsomerAdminsService from "@services/identity/IsomerAdminsService"
import UsersService from "@services/identity/UsersService"
import AuthorizationMiddlewareService from "@services/middlewareServices/AuthorizationMiddlewareService"
import FormsProcessingService from "@services/middlewareServices/FormsProcessingService"

const getAuthenticationMiddleware = ({
  identityAuthService,
}: {
  identityAuthService: AuthService
}) => {
  const authenticationMiddlewareService = new AuthenticationMiddlewareService({
    identityAuthService,
  })
  const authenticationMiddleware = new AuthenticationMiddleware({
    authenticationMiddlewareService,
  })
  return authenticationMiddleware
}

const getAuthorizationMiddleware = ({
  identityAuthService,
  usersService,
  isomerAdminsService,
}: {
  identityAuthService: AuthService
  usersService: UsersService
  isomerAdminsService: IsomerAdminsService
}) => {
  const authorizationMiddlewareService = new AuthorizationMiddlewareService({
    identityAuthService,
    usersService,
    isomerAdminsService,
  })
  const authorizationMiddleware = new AuthorizationMiddleware({
    authorizationMiddlewareService,
  })
  return authorizationMiddleware
}

const formsg = FormSG()
const formSGService = new FormsProcessingService({ formsg })

/**
 * Handles FormSG response authentication and decryption. 
 * 
 * To be inserted before routes requiring FormSG response data - e.g. 
 * router.post(
      "/",
      attachFormSGHandler(<formKey>),
      actualRoute
    )
 *
 * Retrieve form data from res.locals.submission.
 */
const attachFormSGHandler = (formKey: string): ExpressRequestHandler[] => [
  formSGService.authenticate(),
  express.json(),
  formSGService.decrypt({ formKey }),
]

const attachSiteHandler: RequestHandler<
  Record<string, string>,
  unknown,
  unknown,
  never,
  {
    userSessionData: UserSessionData
    userWithSiteSessionData: UserWithSiteSessionData
  }
> = (req, res, next) => {
  const {
    params: { siteName },
  } = req
  const { userSessionData } = res.locals
  const userWithSiteSessionData = new UserWithSiteSessionData({
    ...userSessionData.getGithubParams(),
    siteName,
  })
  res.locals.userWithSiteSessionData = userWithSiteSessionData
  return next()
}

export {
  getAuthenticationMiddleware,
  getAuthorizationMiddleware,
  attachFormSGHandler,
  attachSiteHandler,
}
