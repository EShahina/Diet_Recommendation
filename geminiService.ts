import { GoogleGenAI, Type, Modality } from "@google/genai";
import { searchFoodDatabase, type NutritionData } from "./nutritionService";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface MealAnalysis {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  disciplineScore: number; // 1-100
  feedback: string;
  alternatives: string[];
  nudge: string;
  databaseMatches?: NutritionData[];
}

export interface UserProfile {
  issue: string;
  habits: string;
  preference: string;
  isSmoker: string;
  isAlcoholic: string;
  phone: string;
}

export async function analyzeMeal(mealDescription: string, history: string[], profile?: UserProfile, imageData?: string): Promise<MealAnalysis> {
  // Step 1: Extract food items from description/image
  const extractionResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: {
      parts: [
        { text: `Identify the main food items in this meal: "${mealDescription || "See attached image"}". Return as a simple JSON array of strings.` },
        ...(imageData ? [{
          inlineData: {
            mimeType: "image/jpeg",
            data: imageData.split(",")[1]
          }
        }] : [])
      ]
    },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: { type: Type.STRING }
      }
    }
  });

  const items: string[] = JSON.parse(extractionResponse.text || "[]");
  
  // Step 2: Search nutritional database for these items
  const dbResults: NutritionData[] = [];
  if (items.length > 0) {
    const searchPromises = items.slice(0, 3).map(item => searchFoodDatabase(item));
    const results = await Promise.all(searchPromises);
    results.forEach(res => {
      if (res.length > 0) dbResults.push(res[0]); // Take the best match for each item
    });
  }

  const profileContext = profile ? `
    User Profile:
    - Health Issue/Goal: ${profile.issue}
    - Regular Habits: ${profile.habits}
    - Diet Preference: ${profile.preference}
    - Lifestyle: ${profile.isSmoker}, ${profile.isAlcoholic}
  ` : "";

  const dbContext = dbResults.length > 0 ? `
    Nutritional Database Reference Data:
    ${dbResults.map(r => `- ${r.name}: ${r.calories}kcal, P:${r.protein}g, C:${r.carbs}g, F:${r.fat}g (Source: ${r.source})`).join("\n")}
    Use this database data to ground your nutritional estimates.
  ` : "";

  const parts: any[] = [
    { text: `Analyze this meal: "${mealDescription || "See attached image"}". 
    ${profileContext}
    ${dbContext}
    User history context: ${history.join(", ")}.
    Provide nutritional estimates, a discipline score (how well it fits a healthy diet, from 0 to 100), constructive feedback, 3 healthier alternatives, and a short personalized "nudge" (behavioral psychology tip).` }
  ];

  if (imageData) {
    parts.push({
      inlineData: {
        mimeType: "image/jpeg",
        data: imageData.split(",")[1]
      }
    });
  }

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: { parts },
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          calories: { type: Type.NUMBER },
          protein: { type: Type.NUMBER },
          carbs: { type: Type.NUMBER },
          fat: { type: Type.NUMBER },
          disciplineScore: { type: Type.NUMBER },
          feedback: { type: Type.STRING },
          alternatives: { 
            type: Type.ARRAY,
            items: { type: Type.STRING }
          },
          nudge: { type: Type.STRING }
        },
        required: ["calories", "protein", "carbs", "fat", "disciplineScore", "feedback", "alternatives", "nudge"]
      }
    }
  });

  const analysis = JSON.parse(response.text || "{}");
  return {
    ...analysis,
    databaseMatches: dbResults
  };
}

export async function getDailySummary(meals: any[], profile?: UserProfile): Promise<string> {
  const mealSummary = meals.map(m => {
    const timeStr = typeof m.timestamp === 'string' || typeof m.timestamp === 'number' || m.timestamp instanceof Date
      ? new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : "Unknown time";
    return `${m.description} (${timeStr}) with Discipline Score: ${m.analysis.disciplineScore}/100`;
  }).join(", ");

  const profileCtx = profile ? `
  User Profile context:
  - Goal / Health Issue: ${profile.issue}
  - Habits: ${profile.habits}
  - Preferences: ${profile.preference}
  ` : "";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are an empathetic, scientific, and highly supportive "Neuro-Coach". Analyze these today's meals: ${mealSummary}. 
    ${profileCtx}
    
    Provide a professional, warm, and encouraging neuro-coaching review that is actionable and grounded in user context. Format beautifully with Markdown:
    - **Neurological Insights**: Explain science behind their eating patterns, dopamine levels, brain focus, or satiety.
    - **Compassionate Encouragement**: Praise the user's steps to consistency, especially if they hit challenges.
    - **Empathetic Nudges**: Offer 1-2 supportive, clear behavioral strategies they can implement tomorrow.`,
  });
  return response.text || "Keep up the great work on your neuro-journey!";
}

export interface DietPlan {
  title: string;
  duration: string;
  weeklySchedule: {
    day: string;
    meals: {
      breakfast: { main: string; alternative: string; nutrition: string };
      lunch: { main: string; alternative: string; nutrition: string };
      dinner: { main: string; alternative: string; nutrition: string };
      snack: { main: string; alternative: string; nutrition: string };
    };
  }[];
  recommendations: string[];
}

export interface DietaryPattern {
  trend: string;
  insight: string;
  recommendation: string;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface CorrectiveTask {
  id: string;
  title: string;
  description: string;
  type: 'nutrition' | 'activity' | 'mindset';
  impact: string;
  isCompleted: boolean;
}

export interface SuggestedRecipe {
  title: string;
  prepTime: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  ingredients: string[];
  instructions: string[];
  reasonForSuggestion: string;
}

export async function generateVoiceAlert(message: string): Promise<string | undefined> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: `Say with a supportive but firm tone: ${message}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' },
          },
        },
      },
    });

    return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
  } catch (error) {
    console.error("TTS generation failed:", error);
    return undefined;
  }
}

export async function getRecipeSuggestions(meals: any[], profile: UserProfile, customGoals?: { calories: number; protein: number; carbs: number; fat: number }): Promise<SuggestedRecipe[]> {
  const mappedHistory = meals.slice(-5).map(m => m.description).join(", ");
  const customGoalsCtx = customGoals ? `
  Ensure the suggestions align with their nutrition target per meal:
  - Daily Target: ${customGoals.calories} kcal, ${customGoals.protein}g protein, ${customGoals.carbs}g carbs, ${customGoals.fat}g fat.
  ` : "";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on the user's habits, nutritional targets, and past meals, suggest exactly 3 delicious, healthy, and easy-to-make recipes.
    
    User Profile:
    - Issue/Goal: ${profile.issue}
    - Taste Preference: ${profile.preference}
    - Habits: ${profile.habits}
    - Recent meal history: ${mappedHistory}
    ${customGoalsCtx}

    Provide exactly 3 custom recipes that target their health goals and complement their eating patterns. Include a "reasonForSuggestion" showing how this recipe addresses their neurological/biological needs.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            prepTime: { type: Type.STRING },
            calories: { type: Type.NUMBER },
            protein: { type: Type.NUMBER },
            carbs: { type: Type.NUMBER },
            fat: { type: Type.NUMBER },
            ingredients: { 
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            instructions: {
              type: Type.ARRAY,
              items: { type: Type.STRING }
            },
            reasonForSuggestion: { type: Type.STRING }
          },
          required: ["title", "prepTime", "calories", "protein", "carbs", "fat", "ingredients", "instructions", "reasonForSuggestion"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    console.error("Failed to parse suggested recipes:", e);
    return [];
  }
}

export async function analyzeDietaryPatterns(meals: any[], profile: UserProfile): Promise<DietaryPattern[]> {
  const mealHistory = meals.map(m => ({
    description: m.description,
    score: m.analysis.disciplineScore, // 0-100
    time: m.timestamp,
    macros: { p: m.analysis.protein, c: m.analysis.carbs, f: m.analysis.fat }
  }));

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze these meal patterns for a user with the following profile:
    Goal: ${profile.issue}
    Preference: ${profile.preference}
    
    Data Set (User Meal History): ${JSON.stringify(mealHistory)}
    
    Identify 3 key behavioral or nutritional patterns. For each, provide:
    1. The observed trend.
    2. A psychological or physiological insight.
    3. A specific recommendation.
    4. A risk level (low, medium, high) regarding their health goal.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            trend: { type: Type.STRING },
            insight: { type: Type.STRING },
            recommendation: { type: Type.STRING },
            riskLevel: { type: Type.STRING }
          },
          required: ["trend", "insight", "recommendation", "riskLevel"]
        }
      }
    }
  });

  try {
    return JSON.parse(response.text || "[]");
  } catch (e) {
    return [];
  }
}

export async function generateCorrectiveTask(missedMeal: string, profile: UserProfile): Promise<CorrectiveTask> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `The user missed their ${missedMeal}. Based on their health goal (${profile.issue}) and habits (${profile.habits}), generate a single "Corrective Task" to help them get back on track.
    
    The task must be highly encouraging, empathetic, and actionable, specifically geared towards their neurological and health requirements.
    
    Return as JSON:
    {
      "title": "Short task title",
      "description": "Detailed instructions",
      "type": "nutrition" | "activity" | "mindset",
      "impact": "How this helps their specific goal"
    }`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          type: { type: Type.STRING, enum: ["nutrition", "activity", "mindset"] },
          impact: { type: Type.STRING }
        },
        required: ["title", "description", "type", "impact"]
      }
    }
  });

  const data = JSON.parse(response.text || "{}");
  return {
    ...data,
    id: Math.random().toString(36).substr(2, 9),
    isCompleted: false
  };
}

export async function generateDietPlan(profile: UserProfile, customGoals?: { calories: number; protein: number; carbs: number; fat: number }): Promise<DietPlan> {
  const customGoalsCtx = customGoals ? `
  We are targeting a specific nutritional set:
  - Daily Calories: ${customGoals.calories} kcal
  - Daily Protein: ${customGoals.protein}g
  - Daily Carbs: ${customGoals.carbs}g
  - Daily Fat: ${customGoals.fat}g
  Strictly adjust the recommended meals and alternatives to alignment with these customized goals.
  ` : "";

  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Based on this user profile, generate a comprehensive WEEKLY diet plan (Day 1 to Day 7) to reach their goal:
    - Health Issue/Goal: ${profile.issue}
    - Regular Habits: ${profile.habits}
    - Diet Preference: ${profile.preference}
    - Lifestyle: ${profile.isSmoker}, ${profile.isAlcoholic}
    ${customGoalsCtx}
    
    For each day, provide a main meal and an alternative meal with similar nutritional value for Breakfast, Lunch, Dinner, and Snack.`,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          duration: { type: Type.STRING },
          weeklySchedule: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                day: { type: Type.STRING },
                meals: {
                  type: Type.OBJECT,
                  properties: {
                    breakfast: { 
                      type: Type.OBJECT,
                      properties: { main: { type: Type.STRING }, alternative: { type: Type.STRING }, nutrition: { type: Type.STRING } },
                      required: ["main", "alternative", "nutrition"]
                    },
                    lunch: { 
                      type: Type.OBJECT,
                      properties: { main: { type: Type.STRING }, alternative: { type: Type.STRING }, nutrition: { type: Type.STRING } },
                      required: ["main", "alternative", "nutrition"]
                    },
                    dinner: { 
                      type: Type.OBJECT,
                      properties: { main: { type: Type.STRING }, alternative: { type: Type.STRING }, nutrition: { type: Type.STRING } },
                      required: ["main", "alternative", "nutrition"]
                    },
                    snack: { 
                      type: Type.OBJECT,
                      properties: { main: { type: Type.STRING }, alternative: { type: Type.STRING }, nutrition: { type: Type.STRING } },
                      required: ["main", "alternative", "nutrition"]
                    }
                  },
                  required: ["breakfast", "lunch", "dinner", "snack"]
                }
              },
              required: ["day", "meals"]
            }
          },
          recommendations: {
            type: Type.ARRAY,
            items: { type: Type.STRING }
          }
        },
        required: ["title", "duration", "weeklySchedule", "recommendations"]
      }
    }
  });

  return JSON.parse(response.text || "{}");
}
