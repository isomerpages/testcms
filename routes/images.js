const express = require('express');
const router = express.Router();
const jwtUtils = require('../utils/jwt-utils')

// Import classes 
const { File, ImageType } = require('../classes/File.js')

// List images
router.get('/:siteName/images', async function(req, res, next) {
  try {
    const { oauthtoken } = req.cookies
    const { access_token } = jwtUtils.verifyToken(oauthtoken)
    const { siteName } = req.params

    const GitHubFile = new File(access_token, siteName)
    const images = await GitHubFile.setFileType(ImageType).list()
    
    res.status(200).json({ images })
  } catch (err) {
    console.log(err)
  }
})

// Create new image
router.post('/:siteName/images', async function(req, res, next) {
  try {
    const { oauthtoken } = req.cookies
    const { access_token } = jwtUtils.verifyToken(oauthtoken)

    const { siteName } = req.params
    const { imageName, content } = req.body

    // TO-DO:
    // Validate imageName and content

    const GitHubFile = new File(access_token, siteName)
    await GitHubFile.setFileType(ImageType).create(imageName, content)

    res.status(200).json({ imageName, content })
  } catch (err) {
    console.log(err)
  }
})

// Read image
router.get('/:siteName/images/:imageName', async function(req, res, next) {
  try {
    const { oauthtoken } = req.cookies
    const { access_token } = jwtUtils.verifyToken(oauthtoken)

    const { siteName, imageName } = req.params

    const GitHubFile = new File(access_token, siteName)
    const { sha, content } = await GitHubFile.setFileType(ImageType).read(imageName)

    // TO-DO:
    // Validate content

    res.status(200).json({ imageName, sha, content })
  } catch (err) {
    console.log(err)
  }
})

// Update image
router.post('/:siteName/images/:imageName', async function(req, res, next) {
  try {
    const { oauthtoken } = req.cookies
    const { access_token } = jwtUtils.verifyToken(oauthtoken)

    const { siteName, imageName } = req.params
    const { content, sha } = req.body

    // TO-DO:
    // Validate imageName and content

    const GitHubFile = new File(access_token, siteName)
    const { sha, content } = await GitHubFile.setFileType(ImageType).read(imageName)

    res.status(200).json({ imageName, content })
  } catch (err) {
    console.log(err)
  }
})

// Delete image
router.delete('/:siteName/images/:imageName', async function(req, res, next) {
  try {
    const { oauthtoken } = req.cookies
    const { access_token } = jwtUtils.verifyToken(oauthtoken)

    const { siteName, imageName } = req.params
    const { sha } = req.body

    const GitHubFile = new File(access_token, siteName)
    await GitHubFile.setFileType(ImageType).delete(imageName, sha)

    res.status(200).json({ imageName, content })
  } catch (err) {
    console.log(err)
  }
})

// Rename image
router.post('/:siteName/images/:imageName/rename', async function(req, res, next) {
  try {
    const { oauthtoken } = req.cookies
    const { access_token } = jwtUtils.verifyToken(oauthtoken)

    const { siteName, imageName } = req.params
    const { newImageName, sha, content } = req.body

    // TO-DO:
    // Validate imageName and content

    // Create new file with name ${newImageName}

    const GitHubFile = new File(access_token, siteName)
    await GitHubFile.setFileType(ImageType).create(newImageName, content)
    await GitHubFile.delete(imageName, sha)

    res.status(200).json({ newImageName, content })
  } catch (err) {
    console.log(err)
  }
})

module.exports = router;