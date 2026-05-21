import { createError, defineEventHandler } from 'h3'
import { cancelJob, getJob } from '../../utils/jobs'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') as string
  const job = getJob(id)
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }
  const cancelled = cancelJob(id)
  if (!cancelled) {
    throw createError({ statusCode: 409, statusMessage: 'Job is not running' })
  }
  return { ok: true }
})
