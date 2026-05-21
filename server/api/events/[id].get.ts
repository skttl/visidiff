import { getEmitter, getJob } from '../../utils/jobs'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id') as string
  const job = getJob(id)
  if (!job) {
    throw createError({ statusCode: 404, statusMessage: 'Job not found' })
  }
  const emitter = getEmitter(id)
  if (!emitter) {
    throw createError({ statusCode: 404, statusMessage: 'Job emitter not found' })
  }

  const stream = createEventStream(event)

  const onEvt = async (evt: { type: string; data: any }) => {
    try {
      await stream.push({ event: evt.type, data: JSON.stringify(evt.data) })
    } catch {
      // ignore
    }
  }
  const onEnd = async () => {
    try {
      await stream.push({ event: 'close', data: '{}' })
    } catch {}
    try {
      await stream.close()
    } catch {}
  }

  // Start the stream first, then replay past events and attach listeners
  ;(async () => {
    // Tiny delay to ensure response headers are flushed
    await new Promise((r) => setTimeout(r, 0))
    for (const evt of job.events) {
      await onEvt(evt)
    }
    if (job.status === 'done' || job.status === 'error') {
      await onEnd()
      return
    }
    emitter.on('evt', onEvt)
    emitter.once('end', onEnd)
  })()

  stream.onClosed(() => {
    emitter.off('evt', onEvt)
    emitter.off('end', onEnd)
  })

  return stream.send()
})
