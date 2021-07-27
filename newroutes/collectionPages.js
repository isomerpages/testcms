const express = require("express")

// Import middleware
const {
  attachReadRouteHandlerWrapper,
  attachWriteRouteHandlerWrapper,
  attachRollbackRouteHandlerWrapper,
} = require("@middleware/routeHandler")

const {
  CreatePageRequestSchema,
  UpdatePageRequestSchema,
  DeletePageRequestSchema,
} = require("./RequestSchema")

class CollectionPagesRouter {
  constructor({ collectionController }) {
    this.CollectionController = collectionController

    const methods = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
    // Bind all methods
    methods
      .filter((method) => method !== "constructor")
      .forEach((method) => {
        this[method] = this[method].bind(this)
      })
  }

  // Create new page in collection
  async createCollectionPage(req, res) {
    const { accessToken } = req

    const { siteName, collectionName, subcollectionName } = req.params
    const { error } = CreatePageRequestSchema.validate(req.body)
    if (error) throw error
    const { newFileName, pageBody, frontMatter } = req.body
    const createResp = await this.CollectionController.CreatePage(
      { siteName, accessToken },
      {
        fileName: newFileName,
        collectionName,
        content: pageBody,
        frontMatter,
        thirdNavTitle: subcollectionName,
      }
    )

    return res.status(200).json(createResp)
  }

  // Read page in collection
  async readCollectionPage(req, res) {
    const { accessToken } = req

    const { siteName, pageName, collectionName, subcollectionName } = req.params
    const { sha, content } = await this.CollectionController.ReadPage(
      { siteName, accessToken },
      { fileName: pageName, collectionName, thirdNavTitle: subcollectionName }
    )

    return res.status(200).json({ collectionName, pageName, sha, content })
  }

  // Update page in collection
  async updateCollectionPage(req, res) {
    const { accessToken } = req

    const { siteName, pageName, collectionName, subcollectionName } = req.params
    const { error } = UpdatePageRequestSchema.validate(req.body)
    if (error) throw error
    const { frontMatter, pageBody, sha, newFileName } = req.body
    const updateResp = await this.CollectionController.UpdatePage(
      { siteName, accessToken },
      {
        fileName: pageName,
        newFileName,
        collectionName,
        thirdNavTitle: subcollectionName,
        content: pageBody,
        frontMatter,
        sha,
      }
    )

    return res.status(200).json(updateResp)
  }

  // Delete page in collection
  async deleteCollectionPage(req, res) {
    const { accessToken } = req

    const { siteName, pageName, collectionName, subcollectionName } = req.params
    const { error } = DeletePageRequestSchema.validate(req.body)
    if (error) throw error
    const { sha } = req.body
    await this.CollectionController.DeletePage(
      { siteName, accessToken },
      {
        fileName: pageName,
        collectionName,
        thirdNavTitle: subcollectionName,
        sha,
      }
    )

    return res.status(200).send("OK")
  }

  getRouter() {
    const router = express.Router()

    router.post(
      "/:siteName/collections/:collectionName/pages",
      attachRollbackRouteHandlerWrapper(this.createCollectionPage)
    )
    router.post(
      "/:siteName/collections/:collectionName/subcollections/:subcollectionName/pages",
      attachRollbackRouteHandlerWrapper(this.createCollectionPage)
    )
    router.get(
      "/:siteName/collections/:collectionName/pages/:pageName",
      attachReadRouteHandlerWrapper(this.readCollectionPage)
    )
    router.get(
      "/:siteName/collections/:collectionName/subcollections/:subcollectionName/pages/:pageName",
      attachReadRouteHandlerWrapper(this.readCollectionPage)
    )
    router.post(
      "/:siteName/collections/:collectionName/pages/:pageName",
      attachWriteRouteHandlerWrapper(this.updateCollectionPage)
    )
    router.post(
      "/:siteName/collections/:collectionName/subcollections/:subcollectionName/pages/:pageName",
      attachWriteRouteHandlerWrapper(this.updateCollectionPage)
    )
    router.delete(
      "/:siteName/collections/:collectionName/pages/:pageName",
      attachRollbackRouteHandlerWrapper(this.deleteCollectionPage)
    )
    router.delete(
      "/:siteName/collections/:collectionName/subcollections/:subcollectionName/pages/:pageName",
      attachRollbackRouteHandlerWrapper(this.deleteCollectionPage)
    )

    return router
  }
}

module.exports = { CollectionPagesRouter }
