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
      `{ id
         title
         creator {
           id
           authorOfProposal {
             id
            }
         }
         students {
           id
          authorOfProposal {
            id
           }
          }
         }`
    );

    // 2. prepare the object to return
    const allStudentProposals = theClasses
      .map(theClass =>
        theClass.students.map(student =>
          student.authorOfProposal.map(proposal => proposal.id)
        )
      )
      .flat(3);

    const allTeacherProposals = theClasses
      .map(theClass =>
        theClass.creator.authorOfProposal.map(proposal => proposal.id)
      )
      .flat(2);

    // TODO: find also all proposals where the user is collaborator on the study
    const myStudyProposals = await ctx.db.query.studies(
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
            {
              featured: true, // include featured studies (their proposals also should be submitted)
            },
          ],
        },
      },
      `{proposal { id } }`
    );
    const myStudyProposalsIDs = myStudyProposals
      .map(study => study.proposal.map(proposal => proposal.id))
      .flat(2);

    const proposalIDs = [
      ...new Set([
        ...allStudentProposals,
        ...allTeacherProposals,
        ...myStudyProposalsIDs,
      ]),
    ];

    const submittedProposals = await ctx.db.query.proposalBoards(
      {
        where: {
          OR: [
            { id_in: proposalIDs, isSubmitted: true },
            { author: { id: ctx.request.userId } }, // find also all proposals where the user is the author or collaborator
            { collaborators_some: { id: ctx.request.userId } },
          ],
        },
      },
      `{ id
          slug
          title
          createdAt
          isSubmitted
          study {
            title
          }
          reviews {
            id
            stage
          }
          author {
            id
            studentIn {
              id
              title
            }
            teacherIn {
              id
              title
            }
          }
        }`
    );

    return submittedProposals;
  },
};

module.exports = studiesQueries;
