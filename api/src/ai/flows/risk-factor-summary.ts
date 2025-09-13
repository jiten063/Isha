'use server';

/**
 * @fileOverview Provides a summarized view of personalized disease risk factors.
 *
 * - riskFactorSummary - A function that generates a summary of disease risk factors.
 * - RiskFactorSummaryInput - The input type for the riskFactorSummary function.
 * - RiskFactorSummaryOutput - The return type for the riskFactorSummary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const RiskFactorSummaryInputSchema = z.object({
  profileData: z.string().describe('User profile data including health history and preferences.'),
  location: z.string().describe('Current location of the user (e.g., city, state).'),
  weatherData: z.string().describe('Current weather data for the user’s location.'),
  localHealthData: z.string().describe('Local health data for the last week.'),
  governmentHealthData: z.string().describe('Government public health data (IDSP).'),
  environmentRiskData: z.string().describe('Environmental risk data (air quality, potential crops).'),
});
export type RiskFactorSummaryInput = z.infer<typeof RiskFactorSummaryInputSchema>;

const RiskItemSchema = z.object({
  category: z.enum(['Occupational', 'Environmental', 'Lifestyle', 'Vector']),
  name: z.string(),
  value: z.string(),
  recommendation: z.string(),
});

const RiskFactorSummaryOutputSchema = z.object({
  risks: z.array(RiskItemSchema).describe('A list of personalized disease risk factors.'),
});
export type RiskFactorSummaryOutput = z.infer<typeof RiskFactorSummaryOutputSchema>;

export async function riskFactorSummary(input: RiskFactorSummaryInput): Promise<RiskFactorSummaryOutput> {
  return riskFactorSummaryFlow(input);
}

const riskFactorSummaryPrompt = ai.definePrompt({
  name: 'riskFactorSummaryPrompt',
  input: {schema: RiskFactorSummaryInputSchema},
  output: {schema: RiskFactorSummaryOutputSchema},
  prompt: `You are an AI health assistant providing a summarized view of personalized disease risk factors for the user.
Analyze the following data to generate a structured list of risks.
For each risk, provide:
- A category: 'Occupational', 'Environmental', 'Lifestyle', or 'Vector'.
- A short, specific name for the risk (e.g., 'Copper Toxicity', 'Groundwater Nitrates').
- The value or metric associated with the risk (e.g., '58µg/dL', 'Cases ↑40%').
- A concise, actionable recommendation (e.g., 'Chelation advised', 'Fogging scheduled').

Generate 4 distinct risk items based on the input data.

User Profile Data: {{{profileData}}}
Location: {{{location}}}
Weather Data: {{{weatherData}}}
Local Health Data: {{{localHealthData}}}
Government Health Data (IDSP): {{{governmentHealthData}}}
Environmental Risk Data: {{{environmentRiskData}}}
`,
});

const riskFactorSummaryFlow = ai.defineFlow(
  {
    name: 'riskFactorSummaryFlow',
    inputSchema: RiskFactorSummaryInputSchema,
    outputSchema: RiskFactorSummaryOutputSchema,
  },
  async input => {
    const {output} = await riskFactorSummaryPrompt(input);
    return output!;
  }
);
