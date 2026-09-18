// Full production classifier: sender rules + thread rules + model with inbox guarantee.
// Usage: --provider production [--model ...] [--effort ...]
export const makeProduction = async ({ model, effort }) => {
  if (model) process.env.CATEGORIZATION_MODEL = model;
  if (effort) process.env.CATEGORIZATION_REASONING_EFFORT = effort;
  const { classifyEmail, CLASSIFIER_MODEL, CLASSIFIER_REASONING_EFFORT } = await import('../../src/services/classifier/index.js');
  return { name: `production:${CLASSIFIER_MODEL}:${CLASSIFIER_REASONING_EFFORT}`, classify: classifyEmail };
};
