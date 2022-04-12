const studiesQueries = {
  async myAndPublicStudies(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    const studies = await ctx.db.query.studies(
      {
        where: {
          OR: [
            { public: true },
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
        orderBy: 'createdAt_DESC',
      },
      info
    );
    return studies;
  },

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

  // count all studies
  async countStudies(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    const studiesConnection = await ctx.db.query.studiesConnection({}, info);
    return studiesConnection;
  },

  // get all studies for admin
  async allStudies(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in to do that!');
    }
    const studies = await ctx.db.query.studies({}, info);
    return studies;
  },

  // get submitted proposals of all featured studies
  async proposalsFeaturedStudies(parent, args, ctx, info) {
    // 1. get featured studies
    const featuredStudies = await ctx.db.query.studies(
      {
        where: {
          featured: true,
        },
      },
      `{proposal { id }}`
    );
    const ids = featuredStudies
      .map(study => study.proposal.map(proposal => proposal.id))
      .flat(2);
    const proposalIds = [...new Set([...ids])];
    // 2. pull proposals
    const proposals = await ctx.db.query.proposalBoards(
      {
        where: {
          id_in: proposalIds,
          isSubmitted: true, // only submitted
        },
      },
      info
    );
    return proposals;
  },

  // get all proposals of my studies
  async proposalsMyStudies(parent, args, ctx, info) {
    // 1. get my studies
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
    const ids = myStudies
      .map(study => study.proposal.map(proposal => proposal.id))
      .flat(2);
    const proposalIds = [...new Set([...ids])];
    // 2. pull proposals
    const proposals = await ctx.db.query.proposalBoards(
      {
        where: {
          id_in: proposalIds,
        },
      },
      info
    );
    return proposals;
  },

  // get submitted proposals of specific class
  async proposalsOfClass(parent, args, ctx, info) {
    // 1. get the classes
    const { where } = args;
    const theClasses = await ctx.db.query.classes(
      { where },
      `{ id
         studies {
           id
           proposal {
             id
           }
         }
        }`
    );
    // 2. get the proposal Ids
    const proposalIds = theClasses
      .map(theClass =>
        theClass.studies.map(study =>
          study.proposal.map(proposal => proposal.id)
        )
      )
      .flat(2);

    // 3. Leave only unique Ids
    const uniqueProposalIds = [...new Set([...proposalIds])];

    // 4. Pull all submitted proposals
    const proposals = await ctx.db.query.proposalBoards(
      {
        where: { id_in: uniqueProposalIds, isSubmitted: true }, // only submitted,
      },
      info
    );

    return proposals;
  },
};

module.exports = studiesQueries;
