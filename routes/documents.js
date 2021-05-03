const express = require('express');
const router = express.Router();

// Import classes 
const { File, DocumentType } = require('../classes/File.js');
const { MediaFile } = require('../classes/MediaFile.js');
const { 
  attachReadRouteHandlerWrapper, 
  attachWriteRouteHandlerWrapper
} = require('../middleware/routeHandler')

const extractDirectoryAndFileName = (documentName) => {
  let documentDirectory, documentFileName

  const pathArr = documentName.split('/')
  if (pathArr.length === 1) {
    documentDirectory = 'files'
    documentFileName = documentName
  } else if (pathArr.length > 1) {
    documentDirectory = `files/${pathArr.slice(0, -1)}`
    documentFileName = pathArr[pathArr.length - 1]
  }
  return {
    documentDirectory,
    documentFileName,
  }
}

// List documents
async function listDocuments (req, res, next) {
  const { accessToken } = req
  const { siteName } = req.params

  const IsomerFile = new File(accessToken, siteName)
  const documentType = new DocumentType()
  IsomerFile.setFileType(documentType)
  const documents = await IsomerFile.list()
  
  res.status(200).json({ documents })
}

// Create new document
async function createNewDocument (req, res, next) {
  const { accessToken } = req

  const { siteName } = req.params
  const { documentName, documentDirectory, content } = req.body

  // TO-DO:
  // Validate fileName and content

  const IsomerDocumentFile = new MediaFile(accessToken, siteName)
  IsomerDocumentFile.setFileTypeToDocument(documentDirectory)
  const { sha } = await IsomerDocumentFile.create(documentName, content)

  res.status(200).json({ documentName, content, sha })
}

// Read document
async function readDocument (req, res, next) {
  const { accessToken } = req
  const { siteName, documentName } = req.params

  // get document directory
  const { documentDirectory, documentFileName } = extractDirectoryAndFileName(documentName)

  const IsomerDocumentFile = new MediaFile(accessToken, siteName)
  IsomerDocumentFile.setFileTypeToDocument(documentDirectory)
  const { sha, content } = await IsomerDocumentFile.read(documentFileName)

  // TO-DO:
  // Validate content

  res.status(200).json({ documentName, sha, content })
}

// Update document
async function updateDocument (req, res, next) {
  const { accessToken } = req

  const { siteName, documentName } = req.params
  const { content, sha } = req.body

  // TO-DO:
  // Validate pageName and content

  const IsomerFile = new File(accessToken, siteName)
  const documentType = new DocumentType()
  IsomerFile.setFileType(documentType)
  const { newSha } = await IsomerFile.update(documentName, content, sha)
  
  res.status(200).json({ documentName, content, sha: newSha })
}

// Delete document
async function deleteDocument (req, res, next) {
  const { accessToken } = req

  const { siteName, documentName } = req.params
  const { sha } = req.body

  const IsomerFile = new File(accessToken, siteName)
  const documentType = new DocumentType()
  IsomerFile.setFileType(documentType)
  await IsomerFile.delete(documentName, sha)

  res.status(200).send('OK')
}

// Rename document
async function renameDocument (req, res, next) {
  const { accessToken } = req

  const { siteName, documentName, newDocumentName } = req.params
  const { sha, content } = req.body

  // TO-DO:
  // Validate documentName and content

  const { documentDirectory: oldDocumentDirectory, documentFileName: oldDocumentFileName } = extractDirectoryAndFileName(documentName)
  const { documentDirectory: newDocumentDirectory, documentFileName: newDocumentFileName } = extractDirectoryAndFileName(newDocumentName)

  const newIsomerDocumentFile = new MediaFile(accessToken, siteName)
  newIsomerDocumentFile.setFileTypeToDocument(newDocumentDirectory)
  const { sha: newSha } = await newIsomerDocumentFile.create(newDocumentFileName, content)

  const oldIsomerDocumentFile = new MediaFile(accessToken, siteName)
  oldIsomerDocumentFile.setFileTypeToDocument(oldDocumentDirectory)
  await oldIsomerDocumentFile.delete(oldDocumentFileName, sha)

  res.status(200).json({ documentName: newDocumentName, content, sha: newSha })
}

router.get('/:siteName/documents', attachReadRouteHandlerWrapper(listDocuments))
router.post('/:siteName/documents', attachWriteRouteHandlerWrapper(createNewDocument))
router.get('/:siteName/documents/:documentName', attachReadRouteHandlerWrapper(readDocument))
router.post('/:siteName/documents/:documentName', attachWriteRouteHandlerWrapper(updateDocument))
router.delete('/:siteName/documents/:documentName', attachWriteRouteHandlerWrapper(deleteDocument))
router.post('/:siteName/documents/:documentName/rename/:newDocumentName', attachWriteRouteHandlerWrapper(renameDocument))

module.exports = router;