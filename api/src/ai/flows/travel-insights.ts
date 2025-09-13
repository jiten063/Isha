'use server';

/**
 * @fileOverview AI-powered travel insights flow to provide users with a detailed, scorable travel risk report.
 *
 * - travelInsights - A function that handles the travel insights process.
 * - TripInput - The input type for the trip details.
 * - TravelInsightsOutput - The return type for the travelInsights function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { openAI } from 'genkitx-openai';

// 1) Input Schemas

const TripInputSchema = z.object({
  from_district: z.string(),
  to_district: z.string(),
  travel_date: z.string().describe('YYYY-MM-DD format'),
  mode: z.enum(['road', 'rail', 'air']),
});
export type TripInput = z.infer<typeof TripInputSchema>;

const UserProfileSchema = z.object({
  age: z.number(),
  sex: z.enum(['M', 'F', 'O']),
  conditions: z.array(z.string()),
  allergies: z.array(z.string()),
  pregnant: z.boolean(),
  vaccinations: z.array(z.string()),
  medications: z.array(z.string()),
});
export type UserProfile = z.infer<typeof UserProfileSchema>;

const LiveDataSchema = z.object({
  disease: z.object({
    to: z.object({
      dengue_weekly_cases: z.number(),
      typhoid_cluster: z.boolean().optional(),
      flu_trend: z.string().optional(),
    }),
    from: z.object({
      dengue_weekly_cases: z.number(),
    }),
  }),
  weather: z.object({
    to: z.object({
      rain_mm_24h: z.number(),
      heat_index: z.number().optional(),
      alerts: z.array(z.string()).optional(),
    }),
    route: z.object({
      flood_prone_segments: z.array(z.string()).optional(),
    }),
  }),
  aqi: z.object({
    to: z.number(),
    from: z.number(),
    route_max: z.number(),
  }),
  infrastructure: z.object({
    hospitals_to: z.array(
      z.object({
        name: z.string(),
        phone: z.string(),
        is_24x7: z.boolean(),
        eta_min: z.number(),
      })
    ),
    pharmacies_to: z.array(
      z.object({
        name: z.string(),
        phone: z.string(),
        is_24x7: z.boolean(),
      })
    ),
    ambulance: z.string(),
  }),
});
export type LiveData = z.infer<typeof LiveDataSchema>;

const CombinedInputSchema = z.object({
  trip: TripInputSchema,
  profile: UserProfileSchema,
  live: LiveDataSchema,
});


const AiEnhancedOutputSchema = z.object({
    enhanced_advice: z.string().describe("A concise, personalized summary of the most critical risks and advice. Get straight to the point. Combine the provided reasons and advice points into a direct, 1-2 sentence paragraph. Address the user directly."),
    enhanced_checklist_commentary: z.string().describe("A brief, encouraging comment about the checklist, e.g., 'A little preparation goes a long way! Here is a checklist to help you pack smart and stay safe.'"),
});

const TravelInsightsOutputSchema = z.object({
  header: z.string().describe('Trip: {from} → {to} | Date: {dd Mon yyyy} | Mode: {Road/Rail/Air}'),
  risk: z.string().describe('{badge} {BAND}'),
  band: z.enum(['LOW', 'MODERATE', 'HIGH']),
  reasons: z.array(z.string()),
  advice: z.array(z.string()),
  emergency: z.object({
    hospital: z.string(),
    pharmacy: z.string(),
    ambulance: z.string(),
  }),
  checklist: z.object({
    before: z.array(z.string()),
    on_way: z.array(z.string()),
    on_arrival: z.array(z.string()),
  }),
  ai_summary: AiEnhancedOutputSchema,
});
export type TravelInsightsOutput = z.infer<typeof TravelInsightsOutputSchema>;

const enhancementPrompt = ai.definePrompt({
    name: 'travelRiskEnhancementPrompt',
    models: [openAI('gpt-4-turbo')],
    input: { schema: z.object({
        trip: TripInputSchema,
        profile: UserProfileSchema,
        risk_band: z.string(),
        reasons: z.array(z.string()),
        advice: z.array(z.string()),
    })},
    output: { schema: AiEnhancedOutputSchema },
    prompt: `You are an AI travel health advisor. Your goal is to provide a direct, to-the-point summary of travel risks.

Based on the provided data, generate a concise and personalized summary of the most critical risks and advice. Combine the key reasons and advice points into a direct, 1-2 sentence paragraph. Do not use filler words. Address the user directly based on their profile.

Also, provide a brief, encouraging comment for the checklist.

Trip Details:
From: {{trip.from_district}}
To: {{trip.to_district}}
Date: {{trip.travel_date}}
Mode: {{trip.mode}}

User Profile:
Age: {{profile.age}}
Conditions: {{#each profile.conditions}}{{this}} {{/each}}
Pregnant: {{profile.pregnant}}

Calculated Risk Band: {{risk_band}}

Key Risk Factors:
{{#each reasons}}
- {{this}}
{{/each}}

Generated Advice Points:
{{#each advice}}
- {{this}}
{{/each}}
`,
});

// 8) Main function
const travelInsightsFlow = ai.defineFlow(
  {
    name: 'travelInsightsFlow',
    inputSchema: CombinedInputSchema,
    outputSchema: TravelInsightsOutputSchema,
  },
  async ({ trip, profile, live }) => {
    // 2.1) Factor scores
    let DR = 0;
    const dengueCases = live.disease.to.dengue_weekly_cases;
    if (dengueCases >= 10 && dengueCases < 30) DR = 1;
    else if (dengueCases >= 30 && dengueCases < 60) DR = 2;
    else if (dengueCases >= 60) DR = 3;
    if (live.disease.to.typhoid_cluster) DR += 1;
    DR = Math.min(DR, 3);

    const rain = live.weather.to.rain_mm_24h;
    let WR = 0;
    if (rain >= 20 && rain < 50) WR = 1;
    else if (rain >= 50 && rain < 100) WR = 2;
    else if (rain >= 100) WR = 3;

    if (live.weather.to.alerts?.some(a => a.includes('flood'))) {
      WR = Math.max(WR, 2);
    }
    
    const heatIndex = live.weather.to.heat_index ?? 0;
    if (heatIndex >= 32 && heatIndex < 40) WR = Math.min(3, WR + 1);
    if (heatIndex >= 40) WR = Math.min(3, WR + 2);
    

    const aqi_max = Math.max(live.aqi.to, live.aqi.from, live.aqi.route_max);
    let AR = 0;
    if (aqi_max > 100 && aqi_max <= 200) AR = 1;
    else if (aqi_max > 201 && aqi_max <= 300) AR = 2;
    else if (aqi_max > 300) AR = 3;

    let RH = 0;
    if (live.weather.route?.flood_prone_segments && live.weather.route.flood_prone_segments.length > 0) {
      RH = 1;
    }

    // 2.2) Profile sensitivity
    let PSM = 1.0;
    if (profile.age >= 60) PSM *= 1.2;
    if (profile.pregnant) PSM *= 1.3;
    const conditions = new Set(profile.conditions);
    if ((conditions.has('asthma') || conditions.has('copd')) && aqi_max > 100) PSM *= 1.3;
    if (conditions.has('diabetes') && rain >= 50) PSM *= 1.2;
    if (conditions.has('cvd') && heatIndex >= 40) PSM *= 1.2;
    PSM = Math.min(PSM, 1.6);

    // 2.3) Total score & band
    const base_score = (DR * 0.4 + WR * 0.3 + AR * 0.2 + RH * 0.1) * 10;
    const personalized_score = base_score * PSM;
    const band = personalized_score <= 15 ? 'LOW' : personalized_score <= 27 ? 'MODERATE' : 'HIGH';
    const badge = band === 'LOW' ? '🟢' : band === 'MODERATE' ? '🟠' : '🔴';

    // 3) Reasons
    const reasons: string[] = [];
    if (DR >= 2) reasons.push(`Dengue surge in ${trip.to_district} (${live.disease.to.dengue_weekly_cases} cases last week)`);
    if (live.disease.to.typhoid_cluster) reasons.push('Active typhoid cluster reported');
    if (WR >= 2) reasons.push(`Heavy rainfall forecast: ${rain} mm`);
    if (live.weather.route.flood_prone_segments && live.weather.route.flood_prone_segments.length > 0) {
        reasons.push(`Waterlogging risk on ${live.weather.route.flood_prone_segments[0]}`)
    }
    if (AR >= 1) reasons.push(`High Air Quality Index (AQI ${aqi_max}) expected`);


    // 4) Personalized Advice
    const advice: string[] = [];
    if (DR >= 2) advice.push('Wear long-sleeve clothes & use mosquito repellent (10–30% DEET). Avoid outdoors during evening hours.');
    if (live.disease.to.typhoid_cluster) advice.push('Drink only boiled or bottled water. Avoid raw salads and street food.');
    if (rain >= 50) {
        advice.push('Use non-slip footwear. Keep medicines and documents in a waterproof pouch.');
        if (conditions.has('diabetes')) advice.push('Diabetic foot care is crucial; keep dressings dry.');
    }
    if (aqi_max > 150 && (conditions.has('asthma') || conditions.has('copd'))) advice.push('Carry your inhaler and spacer. Consider wearing an N95 mask.');
    if (heatIndex >= 40) advice.push('Avoid travel between 12-4 PM. Stay hydrated with ORS and take breaks in shade.');
    if(trip.mode === 'rail') advice.push('Carry a personal bedsheet & hand sanitizer. Check IRCTC for delay alerts.');
    if(trip.mode === 'air' && (conditions.has('asthma') || conditions.has('copd'))) advice.push('Use a saline nasal spray. Discuss pre-travel bronchodilator plan with your doctor.');

    // 5) Emergency Info
    const hosp = live.infrastructure.hospitals_to.length > 0 ? live.infrastructure.hospitals_to[0] : null;
    const pharm = live.infrastructure.pharmacies_to.length > 0 ? live.infrastructure.pharmacies_to[0] : null;
    const emergency = {
      hospital: hosp ? `${hosp.name} (${hosp.phone})` : 'Not available',
      pharmacy: pharm ? `${pharm.name} (${pharm.phone})` : 'Not available',
      ambulance: live.infrastructure.ambulance,
    };

    // 6) Checklist
    const checklist_before = ['Repellent', 'ORS sachets & bottled water', 'First-aid kit & personal medications (with buffer supply)', 'IDs, insurance, prescriptions (digital & paper copy)', 'Fully charged phone & power bank'];
    if (rain >= 20) checklist_before.push('Raincoat/umbrella & waterproof pouch');
    
    const checklist_way = [];
    if (DR >= 2) checklist_way.push('Keep vehicle windows closed or use AC in high mosquito-risk zones');
    if (RH >= 1) checklist_way.push('Avoid flooded patches; follow official advisories and detours');
    if (live.disease.to.typhoid_cluster) checklist_way.push('Eat only hot, freshly cooked food from trusted places');

    const checklist_arrival = ['Inspect room for mosquito entry points; use nets if available', 'Self-monitor for symptoms like fever, rash, or headache for 3-7 days post-arrival and seek care if needed'];

    // OpenAI Enhancement
    const enhancementResult = await enhancementPrompt({
        trip,
        profile,
        risk_band: band,
        reasons: reasons.slice(0, 3),
        advice: advice.slice(0, 6),
    });

    const ai_summary = enhancementResult.output ?? {
        enhanced_advice: "Your personalized travel report is ready. Please review the advice and checklist for a safe journey.",
        enhanced_checklist_commentary: "A little preparation goes a long way. Here is a checklist to help you pack smart and stay safe."
    };


    // 7) Format output
    const travelDate = new Date(trip.travel_date);
    const formattedDate = travelDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });

    return {
      header: `Trip: ${trip.from_district} → ${trip.to_district} | Date: ${formattedDate} | Mode: ${trip.mode.charAt(0).toUpperCase() + trip.mode.slice(1)}`,
      risk: `${badge} ${band}`,
      band: band as 'LOW' | 'MODERATE' | 'HIGH',
      reasons: reasons.slice(0, 3),
      advice: advice.slice(0, 6),
      emergency,
      checklist: {
        before: checklist_before,
        on_way: checklist_way,
        on_arrival: checklist_arrival,
      },
      ai_summary,
    };
  }
);

// Wrapper function to be called from the frontend.
export async function travelInsights(
  trip: TripInput,
  profile: UserProfile,
  live: LiveData
): Promise<TravelInsightsOutput> {
  return travelInsightsFlow({ trip, profile, live });
}
