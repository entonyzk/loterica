import { GoogleGenAI } from '@google/genai';

/**
 * Camada de Inteligência Artificial — LOTUS AI (Isolada do Motor Matemático).
 * REGRA FUNDAMENTAL: A IA nunca calcula probabilidades, não substitui módulos matemáticos
 * verificáveis e é estritamente proibida de inventar porcentagens de previsão ou resultados.
 */

const LOTUS_AI_SYSTEM_INSTRUCTION = `Você é o módulo de interpretação conceitual do LOTUS AI.
Regras absolutas de integridade matemática:
1. Em sorteios justos e independentes, resultados passados NÃO alteram as probabilidades dos próximos sorteios.
2. Nunca invente probabilidades, estatísticas, resultados históricos ou porcentagens de previsão.
3. Limite-se a explicar conceitos matemáticos, distribuições teóricas e metodologia científica com rigor e clareza.`;

export function isGeminiConfigured(): boolean {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.trim().length > 0);
}

export function createGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error('GEMINI_API_KEY não configurada no ambiente do servidor.');
  }

  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export async function explainMathematicalAxiom(topic: string): Promise<{
  model: string;
  explanation: string;
  disclaimer: string;
}> {
  const ai = createGeminiClient();
  const response = await ai.models.generateContent({
    model: 'gemini-4-hydrogen',
    contents: `Explique de forma objetiva e científica o seguinte conceito na arquitetura do LOTUS AI (máximo 2 parágrafos curtos em português): ${topic}`,
    config: {
      systemInstruction: LOTUS_AI_SYSTEM_INSTRUCTION,
    },
  });

  return {
    model: 'gemini-4-hydrogen',
    explanation: response.text ?? '',
    disclaimer:
      'Explicação conceitual gerada por IA. Todos os cálculos quantitativos são executados exclusivamente pelo motor matemático verificável.',
  };
}
