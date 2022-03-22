import { BadRequestError } from "@errors/BadRequestError"
import { NotFoundError } from "@errors/NotFoundError"

import { GitHubService } from "@services/db/GitHubService"

import _AuthService from "../AuthService"

import { mockAccessToken, mockSiteName, mockUserId } from "./constants"

const mockGitHubService = {
  checkHasAccess: jest.fn(),
}
const AuthService = new _AuthService({
  gitHubService: (mockGitHubService as unknown) as GitHubService,
})

describe("Auth Service", () => {
  it("should call axios successfully and return true when the call is successful", async () => {
    // Arrange
    const expected = true

    // Act
    const actual = await AuthService.hasAccessToSite(
      mockSiteName,
      mockUserId,
      mockAccessToken
    )

    // Assert
    expect(actual).toBe(expected)
    expect(mockGitHubService.checkHasAccess).toHaveBeenCalledWith(
      { accessToken: mockAccessToken, siteName: mockSiteName },
      { userId: mockUserId }
    )
  })

  it("should call axios successfully and return false when the call fails with 403", async () => {
    // Arrange
    const expected = false
    mockGitHubService.checkHasAccess.mockRejectedValueOnce(
      new NotFoundError("")
    )

    // Act
    const actual = await AuthService.hasAccessToSite(
      mockSiteName,
      mockUserId,
      mockAccessToken
    )

    // Assert
    expect(actual).toBe(expected)
    expect(mockGitHubService.checkHasAccess).toHaveBeenCalledWith(
      { accessToken: mockAccessToken, siteName: mockSiteName },
      { userId: mockUserId }
    )
  })

  it("should call axios successfully and bubble the error when the status is not 403 or 404", async () => {
    // Arrange
    const expected = {
      response: { status: 400 },
    }
    mockGitHubService.checkHasAccess.mockRejectedValueOnce(
      new BadRequestError(expected)
    )

    // Act
    const actual = AuthService.hasAccessToSite(
      mockSiteName,
      mockUserId,
      mockAccessToken
    )

    // Assert
    expect(actual).rejects.toThrowError(new BadRequestError(expected))
    expect(mockGitHubService.checkHasAccess).toHaveBeenCalledWith(
      { accessToken: mockAccessToken, siteName: mockSiteName },
      { userId: mockUserId }
    )
  })
})
