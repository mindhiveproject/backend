const studiesQueries = {
  // get the studies of the students of a class
  async classStudies(parent, args, ctx, info) {
    // 1. get the class
    const { where } = args;
    const theclass = await ctx.db.query.class(
      { where },
      `{ id studies { id slug title createdAt participants { id } author { username } collaborators { username } } }`
    );
    // 2. prepare the object to return
    // const studies = theclass.students.map(student => student.researcherIn);
    // const uniqueStudies = [...new Set(studies.flat())];
    return theclass.studies;
  },

  // get all studies for admin
  async allStudies(parent, args, ctx, info) {
    const studies = await ctx.db.query.studies({}, info);
    return studies;
  },

  // get the studies that are ready to be reviewed
  async proposalsForReview(parent, args, ctx, info) {
    // 1. get the classes in the class network of the user (where the user is student, mentor, or teacher)
    const { where } = args;
    const theClasses = await ctx.db.query.classes(
      { where },
      `{ id
         title
         students {
           id
          collaboratorInStudy {
            id
           }
          }
         }`
    );

    // 2. get all studies of the students (where they are collaborators)
    const allStudentStudies = theClasses
      .map(theClass =>
        theClass.students.map(student =>
          student.collaboratorInStudy.map(study => study.id)
        )
      )
      .flat(3);

    // 3. get other studies (featured studies and studies where other students are collaborators)
    const otherStudies = await ctx.db.query.studies(
      {
        where: {
          OR: [
            { id_in: allStudentStudies },
            {
              featured: true, // include featured studies (their proposals also should be submitted)
            },
          ],
        },
      },
      `{proposal { id }}`
    );
    const otherStudyProposalsIDs = otherStudies
      .map(study => study.proposal.map(proposal => proposal.id))
      .flat(2);
    const otherProposalIDs = [...new Set([...otherStudyProposalsIDs])];

    // 4. get my studies
    const myStudies = await ctx.db.query.studies(
      {
        where: {
          OR: [
            {
              author: {
                id: ctx.request.userId,
              },
            },
            {
              collaborators_some: {
                id: ctx.request.userId,
              },
            },
          ],
        },
      },
      `{proposal { id }}`
    );
    const myStudyProposalsIDs = myStudies
      .map(study => study.proposal.map(proposal => proposal.id))
      .flat(2);
    const myProposalIDs = [...new Set([...myStudyProposalsIDs])];

    // 5. pull all proposals
    const proposals = await ctx.db.query.proposalBoards(
      {
        where: {
          OR: [
            { id_in: myProposalIDs }, // submitted and not submitted
            { id_in: otherProposalIDs, isSubmitted: true }, // only submitted
            { author: { id: ctx.request.userId } }, // find also all proposals where the user is the author or collaborator
            { collaborators_some: { id: ctx.request.userId } },
          ],
        },
      },
      info
    );

    return proposals;
  },
};

module.exports = studiesQueries;
