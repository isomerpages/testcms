import { BaseIsomerError } from "./BaseError"
import {
  IdentifiableError,
  PossibleComponentTypes,
  PossibleFileCodes,
} from "./IsomerError"

export default class BadRequestError
  extends BaseIsomerError
  implements IdentifiableError {
  componentCode: PossibleComponentTypes

  fileCode: PossibleFileCodes

  constructor(
    message?: string | undefined,
    meta?: Record<string, unknown>,
    componentCode?: IdentifiableError["componentCode"],
    fileCode?: IdentifiableError["fileCode"]
  ) {
    super({ status: 400, message, meta })
    this.componentCode = componentCode || "X"
    this.fileCode = fileCode || "000"
  }
}

export { BadRequestError }
