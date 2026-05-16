import { z } from 'zod'

export const credentialsSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(8).max(128),
})

export const refreshSchema = z.object({
  refreshToken: z.string().min(20).max(4096),
})

export const publicUserSchema = z.object({
  id: z.string(),
  email: z.email(),
  roles: z.array(z.string()),
  active: z.boolean(),
  createdAt: z.iso.datetime(),
})

export const tokenPairResponseSchema = z.object({
  user: publicUserSchema,
  accessToken: z.string(),
  refreshToken: z.string(),
  accessTokenExpiresAt: z.iso.datetime(),
  refreshTokenExpiresAt: z.iso.datetime(),
})

export const jwksResponseSchema = z.object({
  keys: z.array(z.record(z.string(), z.unknown())),
})

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.literal('auth'),
  timestamp: z.iso.datetime(),
})

export type CredentialsInput = z.infer<typeof credentialsSchema>
export type RefreshInput = z.infer<typeof refreshSchema>
