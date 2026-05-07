import type { JwtService } from '../../domain/services/jwt-service';
import type { TokenGenerator } from '../../domain/services/token-generator';
import { normalizeLocale, type SupportedLocale } from '../../shared/utils/locale';

type HumanCheckQuestion = {
  question: string;
  answers: string[];
};

type HumanCheckChallengePayload = {
  type: 'human_check';
  locale: SupportedLocale;
  questionId: number;
  nonce: string;
  exp: number;
};

const HUMAN_CHECK_TTL_SECONDS = 15 * 60;

const QUESTIONS: Record<SupportedLocale, HumanCheckQuestion[]> = {
  'pt-BR': [
    { question: 'Quanto é 2 + 2?', answers: ['4', 'quatro'] },
    { question: 'Que número vem depois de 8?', answers: ['9', 'nove'] },
    { question: 'Qual é o último mês do ano?', answers: ['dezembro'] },
    { question: 'Quanto é 10 dividido por 2?', answers: ['5', 'cinco'] },
    { question: 'Que dia vem depois da segunda-feira?', answers: ['terca', 'terca-feira', 'terça', 'terça-feira'] },
  ],
  en: [
    { question: 'What is 2 + 2?', answers: ['4', 'four'] },
    { question: 'What number comes after 8?', answers: ['9', 'nine'] },
    { question: 'What is the last month of the year?', answers: ['december'] },
    { question: 'What is 10 divided by 2?', answers: ['5', 'five'] },
    { question: 'What day comes after Monday?', answers: ['tuesday'] },
  ],
  es: [
    { question: 'Cuánto es 2 + 2?', answers: ['4', 'cuatro'] },
    { question: 'Qué número viene después de 8?', answers: ['9', 'nueve'] },
    { question: 'Cuál es el último mes del año?', answers: ['diciembre'] },
    { question: 'Cuánto es 10 dividido por 2?', answers: ['5', 'cinco'] },
    { question: 'Qué día viene después del lunes?', answers: ['martes'] },
  ],
  fr: [
    { question: 'Combien font 2 + 2 ?', answers: ['4', 'quatre'] },
    { question: 'Quel nombre vient après 8 ?', answers: ['9', 'neuf'] },
    { question: 'Quel est le dernier mois de l’année ?', answers: ['decembre', 'décembre'] },
    { question: 'Combien font 10 divisé par 2 ?', answers: ['5', 'cinq'] },
    { question: 'Quel jour vient après lundi ?', answers: ['mardi'] },
  ],
};

function normalizeValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function pickQuestionId(locale: SupportedLocale): number {
  const questions = QUESTIONS[locale];
  const index = Math.floor(Math.random() * questions.length);
  return Math.max(0, Math.min(index, questions.length - 1));
}

export async function createHumanCheckChallenge(
  input: {
    locale?: string | null;
  },
  deps: {
    jwtService: JwtService;
    jwtSecret: string;
    tokenGenerator: TokenGenerator;
    now: Date;
  }
): Promise<{ challengeId: string; question: string; locale: SupportedLocale }> {
  const locale = normalizeLocale(input.locale);
  const questionId = pickQuestionId(locale);
  const question = QUESTIONS[locale][questionId];
  const exp = Math.floor(deps.now.getTime() / 1000) + HUMAN_CHECK_TTL_SECONDS;

  const challengeId = await deps.jwtService.sign(
    {
      type: 'human_check',
      locale,
      questionId,
      nonce: deps.tokenGenerator.generate(),
      exp,
    } satisfies HumanCheckChallengePayload,
    deps.jwtSecret
  );

  return { challengeId, question: question.question, locale };
}

export async function verifyHumanCheckChallenge(
  input: {
    challengeId: string;
    answer: string;
  },
  deps: {
    jwtService: JwtService;
    jwtSecret: string;
  }
): Promise<boolean> {
  let payload: HumanCheckChallengePayload;
  try {
    payload = await deps.jwtService.verify(input.challengeId, deps.jwtSecret) as HumanCheckChallengePayload;
  } catch {
    return false;
  }

  if (payload.type !== 'human_check') return false;

  const locale = normalizeLocale(payload.locale);
  const question = QUESTIONS[locale][payload.questionId];
  if (!question) return false;

  const normalizedAnswer = normalizeValue(input.answer);
  if (!normalizedAnswer) return false;

  return question.answers.some((answer) => normalizeValue(answer) === normalizedAnswer);
}


