/* eslint-disable import/prefer-default-export */ // todo remove this and use prefer-default-export

import AWS, { Lambda } from "aws-sdk"

import { MessageBody } from "@root/services/identity/QueueService"

export const stepFunctionsTrigger = async (event: MessageBody) => {
  const { AWS_REGION, AWS_ACCOUNT_NUMBER, NODE_ENV } = process.env
  const stepFunctionsParams =
    NODE_ENV === "LOCAL_DEV" ? { endpoint: "http://localhost:8083" } : {}
  try {
    const stepFunctions = new AWS.StepFunctions(stepFunctionsParams)

    const stateMachineArn = `arn:aws:states:${AWS_REGION}:${AWS_ACCOUNT_NUMBER}:stateMachine:siteLaunch`

    const params = {
      stateMachineArn,
      input: JSON.stringify(event),
    }

    stepFunctions.startExecution(params, (res, err) => {
      console.log(`Your state machine ${stateMachineArn} executed successfully`)
      if (err) {
        throw err
      }
    })
  } catch (err) {
    const lambda = new AWS.Lambda({
      region: AWS_REGION,
      endpoint:
        NODE_ENV === "LOCAL_DEV" // todo change to some env var
          ? "http://localhost:3002"
          : `https://lambda.${AWS_REGION}.amazonaws.com`,
    })
    const params: Lambda.Types.InvocationRequest = {
      FunctionName: `isomercms-dev-failureNotification`,
      InvocationType: "RequestResponse",
      Payload: JSON.stringify(event),
    }
    lambda.invoke(params, (res, error) => {
      console.log(res, error)
    })
  }
}
