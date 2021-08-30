const autoBind = require("auto-bind")
const express = require("express")

// Import middleware
const { BadRequestError } = require("@errors/BadRequestError")

const {
  attachReadRouteHandlerWrapper,
  attachRollbackRouteHandlerWrapper,
} = require("@middleware/routeHandler")

const {
  CreateDirectoryRequestSchema,
  RenameDirectoryRequestSchema,
  ReorderDirectoryRequestSchema,
} = require("@validators/RequestSchema")

class CollectionsRouter {
  constructor({ collectionDirectoryService, subcollectionDirectoryService }) {
    this.collectionDirectoryService = collectionDirectoryService
    this.subcollectionDirectoryService = subcollectionDirectoryService
    // We need to bind all methods because we don't invoke them from the class directly
    autoBind(this)
  }

  // List all collections
  async listAllCollections(req, res) {
    const { accessToken } = req

    const { siteName } = req.params
    const listResp = await this.collectionDirectoryService.listAllCollections({
      siteName,
      accessToken,
    })

    return res.status(200).json(listResp)
  }

  // List files in a collection/subcollection
  async listCollectionDirectoryFiles(req, res) {
    const { accessToken } = req

    const { siteName, collectionName, subcollectionName } = req.params
    let listResp
    if (subcollectionName) {
      listResp = await this.subcollectionDirectoryService.listFiles(
        { siteName, accessToken },
        { collectionName, subcollectionName }
      )
    } else {
      listResp = await this.collectionDirectoryService.listFiles(
        { siteName, accessToken },
        { collectionName }
      )
    }
    return res.status(200).json(listResp)
  }

  // Create new collection/subcollection
  async createCollectionDirectory(req, res) {
    const { accessToken } = req

    const { siteName, collectionName } = req.params
    const { error } = CreateDirectoryRequestSchema.validate(req.body)
    if (error) throw new BadRequestError(error.message)
    const { newDirectoryName, items } = req.body
    let createResp
    if (collectionName) {
      // Creating subcollection
      createResp = await this.subcollectionDirectoryService.createDirectory(
        { siteName, accessToken },
        {
          collectionName,
          subcollectionName: newDirectoryName,
          objArray: items,
        }
      )
    } else {
      // Creating collection
      createResp = await this.collectionDirectoryService.createDirectory(
        { siteName, accessToken },
        {
          collectionName: newDirectoryName,
          objArray: items,
        }
      )
    }

    return res.status(200).json(createResp)
  }

  // Rename collection/subcollection
  async renameCollectionDirectory(req, res) {
    const { accessToken } = req

    const { siteName, collectionName, subcollectionName } = req.params
    const { error } = RenameDirectoryRequestSchema.validate(req.body)
    if (error) throw new BadRequestError(error.message)
    const { newDirectoryName } = req.body
    if (subcollectionName) {
      await this.subcollectionDirectoryService.renameDirectory(
        { siteName, accessToken },
        {
          collectionName,
          subcollectionName,
          newDirectoryName,
        }
      )
    } else {
      await this.collectionDirectoryService.renameDirectory(
        { siteName, accessToken },
        {
          collectionName,
          newDirectoryName,
        }
      )
    }

    return res.status(200).send("OK")
  }

  // Delete collection/subcollection
  async deleteCollectionDirectory(req, res) {
    const { accessToken } = req

    const { siteName, collectionName, subcollectionName } = req.params
    if (subcollectionName) {
      await this.subcollectionDirectoryService.deleteDirectory(
        { siteName, accessToken },
        {
          collectionName,
          subcollectionName,
        }
      )
    } else {
      await this.collectionDirectoryService.deleteDirectory(
        { siteName, accessToken },
        {
          collectionName,
        }
      )
    }
    return res.status(200).send("OK")
  }

  // Reorder collection/subcollection
  async reorderCollectionDirectory(req, res) {
    const { accessToken } = req

    const { siteName, collectionName, subcollectionName } = req.params
    const { error } = ReorderDirectoryRequestSchema.validate(req.body)
    if (error) throw new BadRequestError(error.message)
    const { items } = req.body
    let reorderResp
    if (subcollectionName) {
      reorderResp = await this.subcollectionDirectoryService.reorderDirectory(
        { siteName, accessToken },
        {
          collectionName,
          subcollectionName,
          objArray: items,
        }
      )
    } else {
      reorderResp = await this.collectionDirectoryService.reorderDirectory(
        { siteName, accessToken },
        {
          collectionName,
          objArray: items,
        }
      )
    }
    return res.status(200).json(reorderResp)
  }

  getRouter() {
    const router = express.Router()

    router.get(
      "/:siteName/collections",
      attachReadRouteHandlerWrapper(this.listAllCollections)
    )
    router.get(
      "/:siteName/collections/:collectionName",
      attachReadRouteHandlerWrapper(this.listCollectionDirectoryFiles)
    )
    router.get(
      "/:siteName/collections/:collectionName/subcollections/:subcollectionName",
      attachReadRouteHandlerWrapper(this.listCollectionDirectoryFiles)
    )
    router.post(
      "/:siteName/collections",
      attachRollbackRouteHandlerWrapper(this.createCollectionDirectory)
    )
    router.post(
      "/:siteName/collections/:collectionName/subcollections",
      attachRollbackRouteHandlerWrapper(this.createCollectionDirectory)
    )
    router.post(
      "/:siteName/collections/:collectionName",
      attachRollbackRouteHandlerWrapper(this.renameCollectionDirectory)
    )
    router.post(
      "/:siteName/collections/:collectionName/subcollections/:subcollectionName",
      attachRollbackRouteHandlerWrapper(this.renameCollectionDirectory)
    )
    router.delete(
      "/:siteName/collections/:collectionName",
      attachRollbackRouteHandlerWrapper(this.deleteCollectionDirectory)
    )
    router.delete(
      "/:siteName/collections/:collectionName/subcollections/:subcollectionName",
      attachRollbackRouteHandlerWrapper(this.deleteCollectionDirectory)
    )
    router.post(
      "/:siteName/collections/:collectionName/reorder",
      attachRollbackRouteHandlerWrapper(this.reorderCollectionDirectory)
    )
    router.post(
      "/:siteName/collections/:collectionName/subcollections/:subcollectionName/reorder",
      attachRollbackRouteHandlerWrapper(this.reorderCollectionDirectory)
    )

    return router
  }
}

module.exports = { CollectionsRouter }
