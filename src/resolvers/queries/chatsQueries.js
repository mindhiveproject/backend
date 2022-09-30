const chatsQueries = {
  // get talks of the user
  async myTalks(parent, args, ctx, info) {
    if (!ctx.request.userId) {
      throw new Error('You must be logged in');
    }

    const me = await ctx.db.query.profile(
      {
        where: {
          id: ctx.request.userId,
        },
      },
      `{ id studentIn { id } teacherIn { id } mentorIn { id } researcherIn { id } collaboratorInStudy { id } }`
    );

    // get all studies and classes IDs
    const userStudies = [
      ...me.researcherIn?.map(s => s.id),
      ...me.collaboratorInStudy?.map(s => s.id),
    ];
    const userClasses = [
      ...me.studentIn?.map(c => c.id),
      ...me.teacherIn?.map(c => c.id),
      ...me.mentorIn?.map(c => c.id),
    ];

    // query parameters where author is the current user
    return ctx.db.query.talks(
      {
        where: {
          OR: [
            {
              author: {
                id: ctx.request.userId,
              },
            },
            {
              members_some: {
                id: ctx.request.userId,
              },
            },
            {
              studies_some: {
                id_in: userStudies,
              },
            },
            {
              classes_some: {
                id_in: userClasses,
              },
            },
          ],
        },
      },
      info
    );
  },
};

module.exports = chatsQueries;
