const { BadRequestError } = require("@errors/BadRequestError")

const {
  retrieveDataFromMarkdown,
  convertDataToMarkdown,
} = require("@utils/markdown-utils")

const { titleSpecialCharCheck } = require("@validators/validators")

class CollectionPageService {
  constructor({ gitHubService, collectionYmlService }) {
    this.gitHubService = gitHubService
    this.collectionYmlService = collectionYmlService
  }

  async create(
    sessionData,
    { fileName, collectionName, content, frontMatter, shouldIgnoreCheck }
  ) {
    if (
      !shouldIgnoreCheck &&
      titleSpecialCharCheck({ title: fileName, isFile: true })
    )
      throw new BadRequestError(
        `Special characters not allowed when creating files. Given name: ${fileName}`
      )
    const parsedCollectionName = `_${collectionName}`

    await this.collectionYmlService.addItemToOrder(sessionData, {
      collectionName,
      item: fileName,
    })

    // We want to make sure that the front matter has no third nav title parameter
    delete frontMatter.third_nav_title
    const newContent = convertDataToMarkdown(frontMatter, content)

    const { sha } = await this.gitHubService.create(sessionData, {
      content: newContent,
      fileName,
      directoryName: parsedCollectionName,
    })
    return { fileName, content: { frontMatter, pageBody: content }, sha }
  }

  async read(sessionData, { fileName, collectionName }) {
    const parsedCollectionName = `_${collectionName}`
    const { content: rawContent, sha } = await this.gitHubService.read(
      sessionData,
      {
        fileName,
        directoryName: parsedCollectionName,
      }
    )
    const { frontMatter, pageContent } = retrieveDataFromMarkdown(rawContent)
    return { fileName, content: { frontMatter, pageBody: pageContent }, sha }
  }

  async update(
    sessionData,
    { fileName, collectionName, content, frontMatter, sha }
  ) {
    const parsedCollectionName = `_${collectionName}`
    const newContent = convertDataToMarkdown(frontMatter, content)
    const { newSha } = await this.gitHubService.update(sessionData, {
      fileContent: newContent,
      sha,
      fileName,
      directoryName: parsedCollectionName,
    })
    return {
      fileName,
      content: { frontMatter, pageBody: content },
      oldSha: sha,
      newSha,
    }
  }

  async delete(sessionData, { fileName, collectionName, sha }) {
    const parsedCollectionName = `_${collectionName}`

    // Remove from collection.yml
    await this.collectionYmlService.deleteItemFromOrder(sessionData, {
      collectionName,
      item: fileName,
    })
    return this.gitHubService.delete(sessionData, {
      sha,
      fileName,
      directoryName: parsedCollectionName,
    })
  }

  async rename(
    sessionData,
    { oldFileName, newFileName, collectionName, content, frontMatter, sha }
  ) {
    if (titleSpecialCharCheck({ title: newFileName, isFile: true }))
      throw new BadRequestError(
        `Special characters not allowed when renaming files. Given name: ${newFileName}`
      )
    const parsedCollectionName = `_${collectionName}`

    await this.collectionYmlService.updateItemInOrder(sessionData, {
      collectionName,
      oldItem: oldFileName,
      newItem: newFileName,
    })

    await this.gitHubService.delete(sessionData, {
      sha,
      fileName: oldFileName,
      directoryName: parsedCollectionName,
    })

    // We want to make sure that the front matter has no third nav title parameter
    delete frontMatter.third_nav_title
    const newContent = convertDataToMarkdown(frontMatter, content)

    const { sha: newSha } = await this.gitHubService.create(sessionData, {
      content: newContent,
      fileName: newFileName,
      directoryName: parsedCollectionName,
    })
    return {
      fileName: newFileName,
      content: { frontMatter, pageBody: content },
      oldSha: sha,
      newSha,
    }
  }
}

module.exports = { CollectionPageService }
