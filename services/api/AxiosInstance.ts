import axios, { AxiosRequestConfig, AxiosResponse } from "axios"

import logger from "@logger/logger"

// Env vars
const { GITHUB_ORG_NAME } = process.env

const requestFormatter = (config: AxiosRequestConfig) => {
  logger.info("Making GitHub API call")
  return {
    ...config,
    headers: {
      "Content-Type": "application/json",
      ...config.headers,
    },
  }
}

const respHandler = (response: AxiosResponse) => {
  // Any status code that lie within the range of 2xx will cause this function to trigger
  const GITHUB_API_LIMIT = 5000
  const remainingRequests = response.headers["x-ratelimit-remaining"]
  if (remainingRequests < GITHUB_API_LIMIT * 0.4) {
    logger.info("60% of access token capacity reached")
  } else if (remainingRequests < GITHUB_API_LIMIT * 0.2) {
    logger.info("80% of access token capacity reached")
  }
  return response
}

const isomerRepoAxiosInstance = axios.create({
  baseURL: `https://api.github.com/repos/${GITHUB_ORG_NAME}/`,
})
isomerRepoAxiosInstance.interceptors.request.use(requestFormatter)
isomerRepoAxiosInstance.interceptors.response.use(respHandler)

const genericGitHubAxiosInstance = axios.create()
genericGitHubAxiosInstance.interceptors.request.use(requestFormatter)
genericGitHubAxiosInstance.interceptors.response.use(respHandler)

export { isomerRepoAxiosInstance, genericGitHubAxiosInstance }
