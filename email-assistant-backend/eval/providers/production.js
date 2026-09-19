// Full production classifier: sender rules + thread rules + model with inbox guarantee.
// Usage: --provider production [--backend openai|jev] [--minconf 0.6] [--model ...] [--effort ...]
export const makeProduction = async ({ model, effort, backend, minconf }) => {
  if (model) process.env.CATEGORIZATION_MODEL = model;
  if (effort) process.env.CATEGORIZATION_REASONING_EFFORT = effort;
  if (backend) process.env.CLASSIFIER_PROVIDER = backend;
  if (minconf) process.env.JEV_MIN_CONFIDENCE = String(minconf);
  const { classifyEmail, CLASSIFIER_MODEL, CLASSIFIER_REASONING_EFFORT, CLASSIFIER_PROVIDER, JEV_MIN_CONFIDENCE } = await import('../../src/services/classifier/index.js');
  const name = CLASSIFIER_PROVIDER === 'jev'
    ? `production:jev>=${JEV_MIN_CONFIDENCE}:${CLASSIFIER_MODEL}`
    : `production:${CLASSIFIER_MODEL}:${CLASSIFIER_REASONING_EFFORT}`;
  return { name, classify: classifyEmail };
};
