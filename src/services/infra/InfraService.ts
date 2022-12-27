import { SubDomainSettings } from "aws-sdk/clients/amplify"
import Joi from "joi"
import { Err, err, Ok, ok } from "neverthrow"

import { Site } from "@database/models"
import { User } from "@database/models/User"
import {
  MessageBody,
  SiteLaunchLambdaStatus,
} from "@root/../microservices/site-launch/shared/types"
import { SiteStatus, JobStatus, RedirectionTypes } from "@root/constants"
import logger from "@root/logger/logger"
import { AmplifyError } from "@root/types/amplify"
import DeploymentsService from "@services/identity/DeploymentsService"
import {
  SiteLaunchCreateParams,
  LaunchesService,
} from "@services/identity/LaunchesService"
import ReposService from "@services/identity/ReposService"
import SitesService from "@services/identity/SitesService"
import { mailer } from "@services/utilServices/MailClient"

import QueueService from "../identity/QueueService"

const SITE_LAUNCH_UPDATE_INTERVAL = 30000
export const REDIRECTION_SERVER_IP = "18.136.36.203"

interface InfraServiceProps {
  sitesService: SitesService
  reposService: ReposService
  deploymentsService: DeploymentsService
  launchesService: LaunchesService
  queueService: QueueService
}

interface dnsRecordDto {
  source: string
  target: string
  type: RedirectionTypes
}
export default class InfraService {
  private readonly sitesService: InfraServiceProps["sitesService"]

  private readonly reposService: InfraServiceProps["reposService"]

  private readonly deploymentsService: InfraServiceProps["deploymentsService"]

  private readonly launchesService: InfraServiceProps["launchesService"]

  private readonly queueService: InfraServiceProps["queueService"]

  constructor({
    sitesService,
    reposService,
    deploymentsService,
    launchesService,
    queueService,
  }: InfraServiceProps) {
    this.sitesService = sitesService
    this.reposService = reposService
    this.deploymentsService = deploymentsService
    this.launchesService = launchesService
    this.queueService = queueService
  }

  createSite = async (
    submissionId: string,
    creator: User,
    siteName: string,
    repoName: string
  ) => {
    let site: Site | undefined // For error handling
    try {
      // 1. Create a new site record in the Sites table
      const newSiteParams = {
        name: siteName,
        apiTokenName: "", // TODO: figure this out
        creator,
        creatorId: creator.id,
      }
      site = await this.sitesService.create(newSiteParams)
      logger.info(`Created site record in database, site ID: ${site.id}`)

      // 2. Set up GitHub repo and branches using the ReposService
      const repo = await this.reposService.setupGithubRepo({ repoName, site })
      logger.info(`Created repo in GitHub, repo name: ${repoName}`)

      // 3. Set up the Amplify project using the DeploymentsService
      const deployment = await this.deploymentsService.setupAmplifyProject({
        repoName,
        site,
      })
      logger.info(`Created deployment in AWS Amplify, repo name: ${repoName}`)

      // 4. Set Amplify deployment URLs in repo
      await this.reposService.modifyDeploymentUrlsOnRepo(
        repoName,
        deployment.productionUrl,
        deployment.stagingUrl
      )

      // 5. Set up permissions
      await this.reposService.setRepoAndTeamPermissions(repoName)

      // 6. Update status
      const updateSuccessSiteInitParams = {
        id: site.id,
        siteStatus: SiteStatus.Initialized,
        jobStatus: JobStatus.Ready,
      }
      await this.sitesService.update(updateSuccessSiteInitParams)
      logger.info(`Successfully created site on Isomer, site ID: ${site.id}`)

      return { site, repo, deployment }
    } catch (err) {
      if (site !== undefined) {
        const updateFailSiteInitParams = {
          id: site.id,
          jobStatus: JobStatus.Failed,
        }
        await this.sitesService.update(updateFailSiteInitParams)
      }
      logger.error(`Failed to created '${repoName}' site on Isomer: ${err}`)
      throw err
    }
  }

  removeTrailingDot = (url: string) => {
    if (url.endsWith(".")) {
      return url.slice(0, -1)
    }
    return url
  }

  isValidUrl(url: string): boolean {
    const schema = Joi.string().domain()
    if (
      schema.validate(url).error &&
      // joi reports initial "_" for certificates as as an invalid url WRONGLY,
      // therefore check if after removing it, it reports as a valid url
      schema.validate(url.substring(1)).error
    ) {
      return false
    }
    return true
  }

  parseDNSRecords = (
    record?: string
  ): Err<never, string> | Ok<dnsRecordDto, never> => {
    if (!record) {
      return err(`Record was not defined`)
    }

    // Note: the records would have the shape of 'blah.gov.sg. CNAME blah.validations.aws.'
    const recordsInfo = record.split(" ")

    // type checking
    const sourceUrl = this.removeTrailingDot(recordsInfo[0])

    // for the root domain record, Amplify records this as : ' CNAME gibberish.cloudfront.net'.
    // while this is not a valid URL, this is ok, as it is just an interim representation from Amplify.
    const isSourceUrlEmpty = sourceUrl === ""
    if (!isSourceUrlEmpty && !this.isValidUrl(sourceUrl)) {
      return err(`Source url: "${sourceUrl}" was not a valid url`)
    }

    const targetUrl = this.removeTrailingDot(recordsInfo[2])
    if (!this.isValidUrl(targetUrl)) {
      return err(`Target url "${targetUrl}" was not a valid url`)
    }

    let recordType
    if (recordsInfo[1] === "A") {
      recordType = RedirectionTypes.A
    } else if (recordsInfo[1] === "CNAME") {
      recordType = RedirectionTypes.CNAME
    } else {
      return err(`Unknown DNS record type: ${recordsInfo[1]}`)
    }

    const dnsRecord: dnsRecordDto = {
      source: sourceUrl,
      target: targetUrl,
      type: recordType,
    }
    return ok(dnsRecord)
  }

  launchSite = async (
    requestor: User,
    agency: User,
    repoName: string,
    primaryDomain: string,
    subDomainSettings: SubDomainSettings
  ): Promise<Err<never, unknown> | Ok<SiteLaunchCreateParams, never>> => {
    // call amplify to trigger site launch process
    let newLaunchParams: SiteLaunchCreateParams
    try {
      // Set up domain association using LaunchesService
      const redirectionDomainResult = await this.launchesService.configureDomainInAmplify(
        repoName,
        primaryDomain,
        subDomainSettings
      )

      if (redirectionDomainResult.isErr()) {
        return err(redirectionDomainResult.error)
      }

      const { appId, siteId } = redirectionDomainResult.value

      logger.info(
        `Created Domain association for ${repoName} to ${primaryDomain}`
      )

      // Get DNS records from Amplify
      /**
       * note: we wait for ard 90 sec as there is a time taken
       * for amplify to generate the certification manager in the first place
       * This is a dirty workaround for now, and will cause issues when we integrate
       * this directly within the Isomer CMS.
       * todo: push this check into a queue-like system when integrating this with cms
       */
      await new Promise((resolve) => setTimeout(resolve, 90000))

      /**
       * todo: add some level of retry logic if get domain association command
       * does not contain the DNS redirections info.
       */

      const dnsInfo = await this.launchesService.getDomainAssociationRecord(
        primaryDomain,
        appId
      )

      const certificationRecord = this.parseDNSRecords(
        dnsInfo.domainAssociation?.certificateVerificationDNSRecord
      )
      if (certificationRecord.isErr()) {
        return err(
          new AmplifyError(
            `Missing certificate, error while parsing ${JSON.stringify(dnsInfo)}
            ${certificationRecord.error}`,
            repoName,
            appId
          )
        )
      }

      const {
        source: domainValidationSource,
        target: domainValidationTarget,
      } = certificationRecord.value

      const subDomainList = dnsInfo.domainAssociation?.subDomains
      if (!subDomainList || !subDomainList[0].dnsRecord) {
        return err(
          new AmplifyError(
            "Missing subdomain subdomain list not created yet",
            repoName,
            appId
          )
        )
      }

      const primaryDomainInfo = this.parseDNSRecords(subDomainList[0].dnsRecord)

      if (primaryDomainInfo.isErr()) {
        return err(
          new AmplifyError(
            `Missing primary domain info${primaryDomainInfo.error}`,
            repoName,
            appId
          )
        )
      }

      /**
       * shape of dnsInfo.domainAssociation.subDomains:
       * {
       *   dnsRecord: "CNAME gibberish.cloudfront.net",
       *   subDomainSettings: {
       *     branchName : "master",
       *     prefix? : "www"
       *   }
       * }
       */

      const primaryDomainTarget = primaryDomainInfo.value.target
      const redirectionDomainList = dnsInfo.domainAssociation?.subDomains?.filter(
        (subDomain) => subDomain.subDomainSetting?.prefix
      )

      /**
       * Amplify only stores the prefix.
       * ie: if I wanted to have a www.blah.gov.sg -> giberish.cloudfront.net,
       * amplify will store the prefix as "www". To get the entire redirectionDomainSource,
       * I would have to add the prefix ("www") with the primary domain (blah.gov.sg)
       */
      const userId = agency.id
      newLaunchParams = {
        userId,
        siteId,
        primaryDomainSource: primaryDomain,
        primaryDomainTarget,
        domainValidationSource,
        domainValidationTarget,
      }

      if (redirectionDomainList?.length) {
        newLaunchParams.redirectionDomainSource = `www.${primaryDomain}` // we only support 'www' redirections for now
      }

      // Create launches records table
      const launchesRecord = await this.launchesService.createOrUpdate(
        newLaunchParams
      )
      logger.info(`Created launch record in database:  ${launchesRecord}`)

      const message: MessageBody = {
        repoName,
        appId,
        primaryDomainSource: primaryDomain,
        primaryDomainTarget,
        domainValidationSource,
        domainValidationTarget,
        requestorEmail: requestor.email ? requestor.email : "",
        agencyEmail: agency.email ? agency.email : "", // TODO: remove conditional after making email not optional/nullable
      }

      if (newLaunchParams.redirectionDomainSource) {
        message.redirectionDomain = [
          {
            source: newLaunchParams.redirectionDomainSource,
            target: primaryDomainTarget,
            type: RedirectionTypes.A,
          },
        ]
      }

      this.queueService.sendMessage(message)

      return ok(newLaunchParams)
    } catch (error) {
      logger.error(`Failed to create '${repoName}' site on Isomer: ${error}`)
      // requester email is guaranteed to exist as currently these are Isomer users
      this.sendRetryToIsomerAdmin(requestor.email!, repoName)

      throw error
    }
  }

  sendRetryToIsomerAdmin = async (email: string, repoName: string) => {
    const subject = `[Isomer] Failure to create domain association for ${repoName}`
    const body = `<p>Unable to trigger create domain association for ${repoName}.</P
    <p>If domain association was already created, please log into the amplify console and trigger a retry. </p>
    <p>Else, resubmit the form and try again.</p>`
    await mailer.sendMail(email, subject, body)
  }

  siteUpdate = async () => {
    const messages = await this.queueService.pollMessages()
    await Promise.all(
      messages.map(async (message) => {
        const site = await this.sitesService.getBySiteName(message.repoName)
        if (site) {
          let updateSuccessSiteLaunchParams = {
            id: site.id,
            siteStatus: SiteStatus.Launched,
            jobStatus: JobStatus.Running,
          }

          const successEmailDetails = {
            subject: `Launch site ${message.repoName} SUCCESS`,
            body: `<p>Isomer site ${message.repoName} was launched successfully.</p>
            <p>You may now visit your live website. <a href="${message.primaryDomainSource}">${message.primaryDomainSource}</a> should be accessible within a few minutes.</p>
            <p>This email was sent from the Isomer CMS backend.</p>`,
          }

          const failureEmailDetails = {
            subject: `Launch site ${message.repoName} FAILURE`,
            body: `<p>Isomer site ${message.repoName} was not launched successfully.</p>
            <p>Error: ${message.statusMetadata}</p>
            <p>This email was sent from the Isomer CMS backend.</p>
            `,
          }

          let emailDetails: { subject: string; body: string }
          if (message.status === SiteLaunchLambdaStatus.SUCCESS) {
            emailDetails = successEmailDetails
          } else {
            updateSuccessSiteLaunchParams = {
              id: site.id,
              siteStatus: SiteStatus.Initialized,
              jobStatus: JobStatus.Failed,
            }
            emailDetails = failureEmailDetails
          }
          await this.sitesService.update(updateSuccessSiteLaunchParams)
          await mailer.sendMail(
            message.requestorEmail,
            emailDetails.subject,
            emailDetails.body
          )

          if (message.status === SiteLaunchLambdaStatus.SUCCESS) {
            emailDetails.subject = `Launch site ${message.repoName} SUCCESS`
            emailDetails.body = `<p>Isomer site ${message.repoName} was launched successfully.</p>
          <p>You may now visit your live website. <a href="${message.primaryDomainSource}">${message.primaryDomainSource}</a> should be accessible within a few minutes.</p>
          <p>This email was sent from the Isomer CMS backend.</p>`
          } else {
            emailDetails.subject = `Launch site ${message.repoName} FAILURE`
            emailDetails.body = `<p>Isomer site ${message.repoName} was not launched successfully.</p>
          <p>Error: ${message.statusMetadata}</p>
          <p>This email was sent from the Isomer CMS backend.</p>
          `
          }
          await mailer.sendMail(
            message.agencyEmail,
            emailDetails.subject,
            emailDetails.body
          )
          await mailer.sendMail(
            message.requestorEmail,
            emailDetails.subject,
            emailDetails.body
          )

          await this.sitesService.update(updateSuccessSiteLaunchParams)
        }
      })
    )
  }

  pollQueue = async () => {
    setInterval(this.siteUpdate, SITE_LAUNCH_UPDATE_INTERVAL)
  }
}
