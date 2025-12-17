import { z } from 'zod';

// Calendar Event Schema - for extracting event information from text
export const CalendarEventSchema = z.object({
  name: z.string().describe('The name of the event'),
  date: z.string().describe('The date or time of the event'),
  participants: z
    .array(z.string())
    .describe('List of participants in the event'),
});

// Math Reasoning Schema - for step-by-step math problem solving
const StepSchema = z.object({
  explanation: z.string().describe('Explanation of this step'),
  output: z.string().describe('The output or result of this step'),
});

export const MathReasoningSchema = z.object({
  steps: z.array(StepSchema).describe('Step-by-step solution'),
  final_answer: z.string().describe('The final answer to the problem'),
});

// Data Extraction Schema - general purpose structured data extraction
export const DataExtractionSchema = z.object({
  entities: z.array(z.string()).describe('Named entities found in the text'),
  keywords: z.array(z.string()).describe('Important keywords'),
  summary: z.string().describe('Brief summary of the content'),
});

// Schema registry - map schema names to schemas
export const SCHEMAS = {
  calendar_event: CalendarEventSchema,
  math_reasoning: MathReasoningSchema,
  data_extraction: DataExtractionSchema,
} as const;

export type SchemaName = keyof typeof SCHEMAS;
