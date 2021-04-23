const studiesQueries = {
  // get the studies of the students of a class
  async classStudies(parent, args, ctx, info) {
    // 1. get the class
    const { where } = args;
    const theclass = await ctx.db.query.class(
      { where },
      `{ id title students { id researcherIn { id slug title createdAt participants { id } author { username } collaborators { username } }} }`
    );
    // 2. prepare the object to return
    const studies = theclass.students.map(student => student.researcherIn);
    const uniqueStudies = [...new Set(studies.flat())];
    return uniqueStudies;
  },

  // get all studies for admin
  async allStudies(parent, args, ctx, info) {
    const studies = await ctx.db.query.studies({}, info);
    return studies;
  },

  // get the studies that are ready to be reviewed
  async proposalsForReview(parent, args, ctx, info) {
    // 1. get the classes
    const { where } = args;
    const theClasses = await ctx.db.query.classes(
      { where },
      `{ id title students { id authorOfProposal { id slug title createdAt isSubmitted study { title } reviews { id } } } }`
    );
    // 2. prepare the object to return
    const allProposals = theClasses.map(theClass =>
      theClass.students.map(student => student.authorOfProposal)
    );
    const proposals = [...new Set(allProposals.flat(2))];
    const submittedProposals = proposals.filter(
      proposal => proposal.isSubmitted
    );
    return submittedProposals;
  },
};

module.exports = studiesQueries;
