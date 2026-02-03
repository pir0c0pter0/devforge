import { z } from 'zod'

/**
 * Zod schema for validating instruction input
 */
export const addInstructionSchema = z.object({
  instruction: z
    .string()
    .min(1, 'Instruction cannot be empty')
    .max(10000, 'Instruction must be 10000 characters or less')
    .trim(),
})

/**
 * TypeScript type inferred from the schema
 */
export type AddInstructionInput = z.infer<typeof addInstructionSchema>
