export enum SiteLaunchLambdaType {
  GENERAL_DOMAIN_VALIDATION = "general-domain-validation",
  PRIMARY_DOMAIN_VALIDATION = "primary-domain-validation",
  REDIRECTION_DOMAIN_VALIDATION = "redirection-domain-validation",
}

export enum SiteLaunchLambdaStatus {
  SUCCESS_SITE_LIVE = "success - site live",
  SUCCESS_PROPAGATING = "success - propagating",
  FAILURE_WRONG_CLOUDFRONT_DISTRIBUTION = "failure - wrong cloudfront distribution",
  FAILURE_CLOUDFRONT_ALIAS_CLASH = "failure - cloudfront alias clash",
  PENDING_DURING_SITE_LAUNCH = "pending - during site launch",
  PENDING_PRE_SITE_LAUNCH = "pending - pre site launch",
}

export interface MessageBody {
  repoName: string
  appId: string
  primaryDomainSource: string
  primaryDomainTarget: string
  domainValidationSource: string
  domainValidationTarget: string
  requestorEmail: string
  agencyEmail: string
  githubRedirectionUrl?: string
  redirectionDomain?: [
    {
      source: string
      target: string
      type: string
    }
  ]
  status?: SiteLaunchLambdaStatus
  statusMetadata?: string
}
