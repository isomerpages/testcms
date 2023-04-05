import _ from "lodash"
import yaml from "yaml"

import { sanitizer } from "@services/utilServices/Sanitizer"

type YamlRecord = {
  [key: string]: YamlRecord | string
}

const sanitizeYamlRecord = (yamlRec: YamlRecord): YamlRecord =>
  _(yamlRec)
    .mapValues((val) => {
      if (typeof val === "string") return sanitizer.sanitize(val)
      return sanitizeYamlRecord(val)
    })
    .value()

// Note: `yaml.parse()` and `yaml.stringify()` should not be used anywhere
// else in the codebase.
export const sanitizedYamlParse = (
  unparsedContent: string
): Record<string, unknown> => {
  const parsedContent = yaml.parse(unparsedContent) as YamlRecord

  return sanitizeYamlRecord(parsedContent)
}

export const sanitizedYamlStringify = (prestringifiedContent: object): string =>
  sanitizer.sanitize(yaml.stringify(prestringifiedContent))
