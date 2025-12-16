import { getRuntimeEnv } from "@/lib/env"

export function logError(context: string, error: unknown) {
  const { NODE_ENV } = getRuntimeEnv()

  if (NODE_ENV === "production") {
    if (error instanceof Error) {
      console.error(context, { message: error.message })
    } else {
      console.error(context)
    }
    return
  }

  console.error(context, error)
}

