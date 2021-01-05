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
};

module.exports = studiesQueries;
