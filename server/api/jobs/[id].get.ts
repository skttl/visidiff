import { getJob } from '../../utils/jobs'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id') as string
  const job = getJob(id)
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }
  return {
    id: job.id,
    status: job.status,
    input: job.input,
    results: job.results,
    totalPercent: job.totalPercent,
    error: job.error,
    events: job.events
  }
})
