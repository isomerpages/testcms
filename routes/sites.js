const express = require('express');
const router = express.Router();
const axios = require('axios');
const jwtUtils = require('../utils/jwt-utils')
const _ = require('lodash')
const Bluebird = require('bluebird')

const ISOMER_GITHUB_ORG_NAME = 'isomerpages'

// validateStatus allows axios to handle a 404 HTTP status without rejecting the promise.
// This is necessary because GitHub returns a 404 status when the file does not exist.
const validateStatus = (status) => {
  return (status >= 200 && status < 300) || status === 404
}

/* Returns a list of all sites (repos) that the user has access to on Isomer. */
// TO-DO: Paginate properly
router.get('/', async function(req, res, next) {
  try {
    const { oauthtoken } = req.cookies
    let { access_token } = jwtUtils.verifyToken(oauthtoken)

    // variable to store user repos
    const userRepos = []
    let pageCount = 1

    // variable to track pagination of user's repos in case user has more than 100
    let hasNextPage = true;
    const filePath = `https://api.github.com/user/repos?per_page=100&page=`;

    while (hasNextPage) {
      const resp = await axios.get(filePath + pageCount, {
        headers: {
          Authorization: `token ${access_token}`,
          "Content-Type": "application/json"
        }
      })

      // keep only isomer repos
      const isomerRepos = resp.data.reduce((acc, repo) => {
        if (repo.full_name.split('/')[0] === ISOMER_GITHUB_ORG_NAME) {
          return acc.concat(repo.full_name)
        }
      }, [])

      // push to results
      userRepos.concat(...isomerRepos)

      // keeps going if there is a next page
      hasNextPage = resp.headers.link.includes('next')

      // increment the pageCount
      ++pageCount
    }

    console.log(userRepos.length)

    res.status(200).json({ userRepos })
  } catch (err) {
    console.log(err)
  }
});

module.exports = router;