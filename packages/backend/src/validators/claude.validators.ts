import { z } from 'zod'

// Container ID deve ser UUID ou docker container ID (hex 12-64 chars)
export const containerIdSchema = z.string()
  .regex(/^[a-f0-9]{12,64}$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, {
    message: 'Invalid container ID format'
  })

// Instruction não pode ter caracteres de controle perigosos
export const instructionSchema = z.string()
  .min(1, 'Instruction cannot be empty')
  .max(10000, 'Instruction too long')
  .transform(s => s.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '')) // Remove control chars exceto \n \r \t

export const sendInstructionSchema = z.object({
  containerId: containerIdSchema,
  instruction: instructionSchema,
  mode: z.enum(['interactive', 'autonomous']).default('interactive')
})

export const containerOperationSchema = z.object({
  containerId: containerIdSchema
})

export type SendInstructionInput = z.infer<typeof sendInstructionSchema>
export type ContainerOperationInput = z.infer<typeof containerOperationSchema>

// Função helper para validar com erro amigável
export function validateContainerId(id: string): string {
  const result = containerIdSchema.safeParse(id)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    throw new Error(`Invalid container ID: ${firstIssue?.message || 'Unknown validation error'}`)
  }
  return result.data
}

export function validateInstruction(instruction: string): string {
  const result = instructionSchema.safeParse(instruction)
  if (!result.success) {
    const firstIssue = result.error.issues[0]
    throw new Error(`Invalid instruction: ${firstIssue?.message || 'Unknown validation error'}`)
  }
  return result.data
}
