const authMutations = require('./mutations/authMutations');
const resultsMutations = require('./mutations/resultsMutations');
const classMutations = require('./mutations/classMutations');
const participantsMutations = require('./mutations/participantsMutations');
const templateMutations = require('./mutations/templateMutations');
const taskMutations = require('./mutations/taskMutations');
const studyMutations = require('./mutations/studyMutations');
const consentMutations = require('./mutations/consentMutations');
const messageMutations = require('./mutations/messageMutations');

const Mutations = {
  ...authMutations,
  ...resultsMutations,
  ...classMutations,
  ...participantsMutations,
  ...templateMutations,
  ...taskMutations,
  ...studyMutations,
  ...consentMutations,
  ...messageMutations,

  async createSchool(parent, args, ctx, info) {
    // TODO: Check login
    const school = await ctx.db.mutation.createSchool(
      {
        data: {
          ...args,
        },
      },
      info
    );

    return school;
  },
};

module.exports = Mutations;
