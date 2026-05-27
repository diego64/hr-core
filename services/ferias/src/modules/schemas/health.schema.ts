import { z } from 'zod'

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('ferias'),
  timestamp: z.iso.datetime(),
})
