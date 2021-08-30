const PLACEHOLDER_FILE_NAME = ".keep"

class SubcollectionDirectoryService {
  constructor({
    baseDirectoryService,
    collectionYmlService,
    moverService,
    subcollectionPageService,
    gitHubService,
  }) {
    this.baseDirectoryService = baseDirectoryService
    this.collectionYmlService = collectionYmlService
    this.moverService = moverService
    this.subcollectionPageService = subcollectionPageService
    this.gitHubService = gitHubService
  }

  async listFiles(reqDetails, { collectionName, subcollectionName }) {
    const files = await this.collectionYmlService.listContents(reqDetails, {
      collectionName,
    })
    const subcollectionFiles = files.filter(
      (fileName) =>
        fileName.startsWith(`${subcollectionName}/`) &&
        !fileName.includes(`/.keep`)
    )

    const subcollectionNameLength = `${subcollectionName}/`.length
    return subcollectionFiles.map((fileName) => ({
      name: fileName.substring(subcollectionNameLength),
      type: "file",
    }))
  }

  async createDirectory(
    reqDetails,
    { collectionName, subcollectionName, objArray }
  ) {
    const parsedDir = `_${collectionName}/${subcollectionName}`
    await this.gitHubService.create(reqDetails, {
      content: "",
      fileName: PLACEHOLDER_FILE_NAME,
      directoryName: parsedDir,
    })

    await this.collectionYmlService.addItemToOrder(reqDetails, {
      collectionName,
      item: `${subcollectionName}/${PLACEHOLDER_FILE_NAME}`,
    })

    if (objArray) {
      // We can't perform these operations concurrently because of conflict issues
      /* eslint-disable no-await-in-loop, no-restricted-syntax */
      for (const file of objArray) {
        const fileName = file.name
        await this.moverService.movePage(reqDetails, {
          fileName,
          oldFileCollection: collectionName,
          newFileCollection: collectionName,
          newFileSubcollection: subcollectionName,
        })
      }
    }
    return objArray || []
  }

  async renameDirectory(
    reqDetails,
    { collectionName, subcollectionName, newDirectoryName }
  ) {
    const dir = `_${collectionName}/${subcollectionName}`
    const files = await this.baseDirectoryService.list(reqDetails, {
      directoryName: dir,
    })
    // We can't perform these operations concurrently because of conflict issues
    /* eslint-disable no-await-in-loop, no-restricted-syntax */
    for (const file of files) {
      const fileName = file.name
      if (fileName === PLACEHOLDER_FILE_NAME) {
        await this.gitHubService.delete(reqDetails, {
          sha: file.sha,
          fileName,
          directoryName: dir,
        })
        continue
      }
      await this.subcollectionPageService.updateSubcollection(reqDetails, {
        fileName,
        collectionName,
        oldSubcollectionName: subcollectionName,
        newSubcollectionName: newDirectoryName,
      })
    }
    await this.gitHubService.create(reqDetails, {
      content: "",
      fileName: PLACEHOLDER_FILE_NAME,
      directoryName: `_${collectionName}/${newDirectoryName}`,
    })
    await this.collectionYmlService.renameSubfolderInOrder(reqDetails, {
      collectionName,
      oldSubfolder: subcollectionName,
      newSubfolder: newDirectoryName,
    })
  }

  async deleteDirectory(reqDetails, { collectionName, subcollectionName }) {
    const dir = `_${collectionName}/${subcollectionName}`
    await this.baseDirectoryService.delete(reqDetails, {
      directoryName: dir,
      message: `Deleting subcollection ${collectionName}/${subcollectionName}`,
    })
    await this.collectionYmlService.deleteSubfolderFromOrder(reqDetails, {
      collectionName,
      subfolder: subcollectionName,
    })
  }

  async reorderDirectory(
    reqDetails,
    { collectionName, subcollectionName, objArray }
  ) {
    const newSubcollectionOrder = [`${subcollectionName}/.keep`].concat(
      objArray.map((obj) => obj.name)
    )
    const files = await this.collectionYmlService.listContents(reqDetails, {
      collectionName,
    })
    const insertPos = files.findIndex((fileName) =>
      fileName.includes(`${subcollection}/`)
    )
    // We do this step separately to account for subcollections which may not have the .keep file
    const filteredFiles = files.filter(
      (fileName) => !fileName.includes(`${subcollection}/`)
    )
    filteredFiles.splice(insertPos, 0, ...newSubcollectionOrder)

    await this.collectionYmlService.updateOrder(reqDetails, {
      collectionName,
      newOrder: filteredFiles,
    })
    return objArray
  }
}

module.exports = { SubcollectionDirectoryService }
