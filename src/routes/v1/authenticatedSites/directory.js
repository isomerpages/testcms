import { Versions } from "@constants"

import { statsMiddleware } from "@root/middleware/stats"

const express = require("express")

const router = express.Router({ mergeParams: true })

// Import middleware
const { attachReadRouteHandlerWrapper } = require("@middleware/routeHandler")

const { Directory, FolderType } = require("@classes/Directory")

// List pages and directories in folder
async function listDirectoryContent(req, res) {
  const { userWithSiteSessionData } = res.locals
  const { siteName, path } = req.params
  const { accessToken } = userWithSiteSessionData

  const decodedPath = decodeURIComponent(path)

  const IsomerDirectory = new Directory(accessToken, siteName)
  const folderType = new FolderType(decodedPath)
  IsomerDirectory.setDirType(folderType)
  let directoryContents = []

  // try catch should be removed during refactor
  // .list() should return an empty array instead of throwing error
  try {
    directoryContents = await IsomerDirectory.list()
  } catch (e) {
    // directory does not exist, catch error
    console.log(e)
  }
  return res.status(200).json({ directoryContents })
}

router.get(
  "/:path",
  statsMiddleware.logVersionNumberCallFor(Versions.V1, "listDirectoryContent"),
  attachReadRouteHandlerWrapper(listDirectoryContent)
)

module.exports = router
