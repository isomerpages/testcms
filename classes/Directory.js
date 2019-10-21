const axios = require('axios');
const _ = require('lodash')

const GITHUB_ORG_NAME = 'isomerpages'

// validateStatus allows axios to handle a 404 HTTP status without rejecting the promise.
// This is necessary because GitHub returns a 404 status when the file does not exist.
const validateStatus = (status) => {
  return (status >= 200 && status < 300) || status === 404
}

class Directory {
  constructor(accessToken, siteName) {
    this.accessToken = accessToken
    this.siteName = siteName
    this.baseEndpoint = null
  }

  setDirType(dirType) {
    const folderPath = dirType.getFolderName()
    this.baseEndpoint = `https://api.github.com/repos/${GITHUB_ORG_NAME}/${this.siteName}/contents/${folderPath}`
  }

  async list() {
    try {
      const endpoint = `${this.baseEndpoint}`

      const resp = await axios.get(endpoint, {
        validateStatus: validateStatus,
        headers: {
          Authorization: `token ${this.accessToken}`,
          "Content-Type": "application/json"
        }
      })
  
      if (resp.status !== 200) return {}
  
      const directories = resp.data.map(object => {
        const pathNameSplit = object.path.split("/")
        const dirName = pathNameSplit[pathNameSplit.length - 1]
        if (object.type === 'dir') {
          return {
            path: encodeURIComponent(object.path),
            dirName
          }
        }
      })
  
      return _.compact(directories)
    } catch (err) {
      throw err
    }
  }
}

class ResourceRoomType {
  constructor(resourceRoomName) {
    this.folderName = `${resourceRoomName}`
  }
  getFolderName() {
    return this.folderName
  }
}

module.exports = { Directory, ResourceRoomType }
