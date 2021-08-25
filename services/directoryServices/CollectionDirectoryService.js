const {
  ConflictError,
  protectedFolderConflictErrorMsg,
} = require("@errors/ConflictError")

const ISOMER_TEMPLATE_DIRS = ["_data", "_includes", "_site", "_layouts"]
const ISOMER_TEMPLATE_PROTECTED_DIRS = [
  "data",
  "includes",
  "site",
  "layouts",
  "files",
  "images",
  "misc",
  "pages",
]
const PLACEHOLDER_FILE_NAME = ".keep"

class CollectionDirectoryService {
  constructor({
    baseDirectoryService,
    navYmlService,
    collectionYmlService,
    moverService,
  }) {
    this.baseDirectoryService = baseDirectoryService
    this.navYmlService = navYmlService
    this.collectionYmlService = collectionYmlService
    this.moverService = moverService
  }

  convertYmlToObjOrder(fileOrder) {
    let currSubcollectionName = ""
    const currSubcollectionFiles = []
    const processedFiles = []
    fileOrder.forEach((filePath) => {
      if (filePath.includes("/")) {
        const [subcollectionName, fileName] = filePath.split("/")
        if (subcollectionName !== currSubcollectionName) {
          if (currSubcollectionName !== "") {
            processedFiles.push({
              name: currSubcollectionName,
              type: "dir",
              children: currSubcollectionFiles,
            })
          }
          currSubcollectionName = subcollectionName
        }
        if (fileName !== ".keep") processedFiles.push(fileName)
      } else {
        processedFiles.push({
          name: filePath,
          type: "file",
        })
      }
    })
    if (currSubcollectionName !== "") {
      processedFiles.push({
        name: currSubcollectionName,
        type: "dir",
        children: currSubcollectionFiles,
      })
    }
    return processedFiles
  }

  convertObjToYmlOrder(objArr) {
    const fileOrder = []
    objArr.forEach((obj) => {
      if (obj.type === "dir") {
        const subcollectionName = obj.name
        fileOrder.push(`${subcollectionName}/${PLACEHOLDER_FILE_NAME}`)
        obj.children.forEach((fileName) => {
          fileOrder.push(`${subcollectionName}/${fileName}`)
        })
      } else {
        fileOrder.push(obj.name)
      }
    })
    return fileOrder
  }

  async listAllCollections(reqDetails) {
    const filesOrDirs = await this.baseDirectoryService.list(reqDetails, {
      directoryName: "",
    })
    return filesOrDirs.reduce((acc, curr) => {
      if (
        curr.type === "dir" &&
        !ISOMER_TEMPLATE_DIRS.includes(curr.name) &&
        curr.name.slice(0, 1) === "_"
      )
        acc.push(curr.path.slice(1))
      return acc
    }, [])
  }

  async listFiles(reqDetails, { collectionName }) {
    const files = await this.collectionYmlService.listContents(reqDetails, {
      collectionName,
    })

    return this.convertYmlToObjOrder(files)
  }

  async createDirectory(reqDetails, { collectionName, objArray }) {
    if (ISOMER_TEMPLATE_PROTECTED_DIRS.includes(collectionName))
      throw new ConflictError(protectedFolderConflictErrorMsg(collectionName))
    await this.collectionYmlService.create(reqDetails, {
      collectionName,
    })
    if (objArray) {
      const orderArray = this.convertObjToYmlOrder(objArray)
      // We can't perform these operations concurrently because of conflict issues
      /* eslint-disable no-await-in-loop, no-restricted-syntax */
      for (const fileName of orderArray) {
        await this.moverService.movePage(reqDetails, {
          fileName,
          newFileCollection: collectionName,
        })
      }
    }
    return objArray || []
  }

  async renameDirectory(reqDetails, { collectionName, newDirectoryName }) {
    if (ISOMER_TEMPLATE_PROTECTED_DIRS.includes(newDirectoryName))
      throw new ConflictError(protectedFolderConflictErrorMsg(newDirectoryName))
    await this.baseDirectoryService.rename(reqDetails, {
      oldDirectoryName: `_${collectionName}`,
      newDirectoryName: `_${newDirectoryName}`,
      message: `Renaming collection ${collectionName} to ${newDirectoryName}`,
    })
    await this.collectionYmlService.renameCollectionInOrder(reqDetails, {
      oldCollectionName: collectionName,
      newCollectionName: newDirectoryName,
    })
    await this.navYmlService.renameCollectionInNav(reqDetails, {
      oldCollectionName: collectionName,
      newCollectionName: newDirectoryName,
    })
  }

  async deleteDirectory(reqDetails, { collectionName }) {
    await this.baseDirectoryService.delete(reqDetails, {
      directoryName: `_${collectionName}`,
      message: `Deleting collection ${collectionName}`,
    })
    await this.navYmlService.deleteCollectionInNav(reqDetails, {
      collectionName,
    })
  }

  async reorderDirectory(reqDetails, { collectionName, objArray }) {
    const fileOrder = this.convertObjToYmlOrder(objArray)
    await this.collectionYmlService.updateOrder(reqDetails, {
      collectionName,
      newOrder: fileOrder,
    })
    return objArray
  }
}

module.exports = { CollectionDirectoryService }
