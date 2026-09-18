// Model-only provider: exactly what production calls, minus the rules layer.
// Usage: --provider openai [--model gpt-5.6-luna] [--effort none|low|medium]
// Model/effort are read by the classifier from env, so we set them before importing.
export const makeOpenAI = async ({ model, effort }) => {
  if (model) process.env.CATEGORIZATION_MODEL = model;
  if (effort) process.env.CATEGORIZATION_REASONING_EFFORT = effort;
  const { classifyWithModel, CLASSIFIER_MODEL, CLASSIFIER_REASONING_EFFORT } = await import('../../src/services/classifier/index.js');
  return { name: `openai:${CLASSIFIER_MODEL}:${CLASSIFIER_REASONING_EFFORT}`, classify: classifyWithModel };
};
